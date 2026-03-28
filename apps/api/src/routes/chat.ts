import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { UIMessage } from 'ai';
import { streamText, generateText, convertToModelMessages } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import OpenAI from 'openai';
import { getEnv } from '../lib/env.js';
import { db } from '../lib/db.js';
import {
  getOrCreateChatSession,
  getOrCreateRecordingChatSession,
  getChatSessionByUserAndDate,
  getChatSessionByRecording,
  addChatMessage,
} from '../services/chat.service.js';
import { getDayContext, getDayDebriefs, getRecordingContext } from '../services/context.service.js';
import { checkAndIncrementChatCount } from '../lib/subscription.js';

// ============================================
// Request schemas
// ============================================

const getSessionQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  recordingId: z.string().uuid().optional(),
});

// useChat sends { messages: Array<{ id, role, content | parts }> }
const postChatBodySchema = z.object({
  messages: z.array(z.record(z.unknown())).min(1),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  recordingId: z.string().uuid().optional(),
});

// ============================================
// Chat system prompt (context injected by route)
// ============================================

const OPENER_FROM_DEBRIEF_PROMPT = `You are TwinAI. Below are debrief summaries from the user's recordings today. Write ONE short opening message (1-3 sentences) like a friend who just listened to everything and has a hot take. Lead with the most interesting or notable thing - a specific moment, quote, or turn. High energy if it was a good day. Real if it was rough. Casual, no markdown, no bullet points.`;

const OPENER_FROM_TRANSCRIPT_PROMPT = `You are TwinAI. Below are transcripts from the user's day. Write ONE short opening message (1-3 sentences) like a friend who was there and has a reaction. Lead with the most interesting moment - quote something specific if you can. Casual, no markdown.`;

const FALLBACK_OPENER = "nothing from today yet. record something and i'll have thoughts.";

const CHAT_SYSTEM_PROMPT_DAY = `You are TwinAI: a friend who already listened to everything that happened in the user's day. You're not an assistant - you were there. You have receipts (the transcripts below).

When they talk to you:
- Reference specific moments with actual quotes. Don't say "when you talked to that person" - say "when you said '[actual quote from transcript]' - that's the part." Quote the transcript directly whenever it's relevant.
- Match the energy of what happened. If it was a good day: be excited about the wins. If rough: be real and direct.
- Be concise. Texts, not essays.
- If they ask for a take: give your honest one. Don't hedge.
- Never give improvement suggestions unless they specifically ask "what should I do differently" or "what could I improve." Just react, reference, engage.
- If they ask about their day: lead with the most interesting thing, not a summary rundown.
- If there's no transcript context for today: say so in one line and stay warm.

Language: contractions always. Casual always. "ngl, lowkey, honestly, bro (gender neutral), lol, haha, okay W, that's a miss, no notes, you ate that, certified moment"
Never: "demonstrate", "leverage", "opportunity for growth", bullet points, headers, numbered lists, "great job", "well done"`;

const CHAT_SYSTEM_PROMPT_RECORDING = `You are TwinAI: a friend who listened to this specific recording with the user. You both heard it. You have the transcript. Reference it like shared memory.

When they talk to you:
- Quote specific lines from the transcript when relevant. "you literally said '[quote]'" lands differently than "you mentioned X." Pull the actual words.
- Be direct. If they ask what went wrong: the one thing, not five things.
- If they ask what went well: be specific and loud about it. Name exactly what worked and why.
- Match their energy. If they're hyped: be hyped. If they're processing: be real.
- No unsolicited suggestions. React, reference, engage. Suggestions only if they explicitly ask.
- Keep it short. Texts, not reports.

Language: contractions always. Casual always. No corporate speak. No markdown. No bullet points. No numbered lists.`;

// ============================================
// Helpers
// ============================================

import type { FirebaseUser } from '../plugins/firebase-auth.js';

async function ensureUserExists(uid: string, email?: string): Promise<void> {
  const existing = await db.user.findUnique({ where: { id: uid } });
  if (!existing) {
    await db.user.create({
      data: {
        id: uid,
        email: email || `${uid.slice(0, 20)}@local`,
      },
    });
  } else if (email && existing.email !== email) {
    await db.user.update({ where: { id: uid }, data: { email } });
  }
}

function requireUser(request: { firebaseUser?: FirebaseUser | null }): FirebaseUser {
  const user = request.firebaseUser;
  if (!user) {
    const err = new Error('Authentication required') as Error & { statusCode: number };
    err.statusCode = 401;
    throw err;
  }
  return user;
}

function getOpenAIClient(): OpenAI | null {
  const env = getEnv();
  if (!env.OPENAI_API_KEY) return null;
  return new OpenAI({ apiKey: env.OPENAI_API_KEY });
}

/** Extract plain text from a UIMessage for persistence */
function getTextFromUIMessage(message: {
  parts?: Array<{ type?: string; text?: string }>;
}): string {
  if (!message.parts?.length) return '';
  return message.parts
    .filter(
      (p): p is { type: string; text: string } => p.type === 'text' && typeof p.text === 'string'
    )
    .map((p) => p.text)
    .join('');
}

// ============================================
// Routes
// ============================================

export const chatRoutes: FastifyPluginAsync = async (app) => {
  /**
   * GET /chat/session?date=YYYY-MM-DD | ?recordingId=uuid
   * Get or create a chat session for the user (daily or recording-scoped); return session + messages.
   */
  app.get<{ Querystring: { date?: string; recordingId?: string } }>(
    '/chat/session',
    async (request, reply) => {
      const { uid: userId, email } = requireUser(request);
      await ensureUserExists(userId, email);

      const parsed = getSessionQuerySchema.safeParse(request.query);
      const dateStr = parsed.success && parsed.data.date ? parsed.data.date : undefined;
      const recordingId = parsed.success ? parsed.data.recordingId : undefined;

      if (recordingId) {
        const session = await getOrCreateRecordingChatSession(userId, recordingId);
        const withMessages = await getChatSessionByRecording(userId, recordingId);
        if (!withMessages) {
          return reply.status(500).send({ error: 'Failed to load session' });
        }
        return reply.send({
          sessionId: session.id,
          recordingId: session.recordingId,
          sessionDate: null,
          messages: withMessages.messages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            createdAt: m.createdAt.toISOString(),
          })),
        });
      }

      const date = dateStr ?? new Date().toISOString().slice(0, 10);
      const session = await getOrCreateChatSession(userId, date);
      const withMessages = await getChatSessionByUserAndDate(userId, date);
      if (!withMessages) {
        return reply.status(500).send({ error: 'Failed to load session' });
      }
      return reply.send({
        sessionId: session.id,
        sessionDate: session.sessionDate?.toISOString().slice(0, 10) ?? null,
        recordingId: null,
        messages: withMessages.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          createdAt: m.createdAt.toISOString(),
        })),
      });
    }
  );

  /**
   * POST /chat/opener
   * Generate and persist the chat's opening message from the day's debriefs (or transcripts). Daily only. Idempotent.
   */
  const postOpenerBodySchema = z.object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  });
  app.post<{ Body: { date?: string } }>('/chat/opener', async (request, reply) => {
    const { uid: userId, email } = requireUser(request);
    await ensureUserExists(userId, email);

    const parsed = postOpenerBodySchema.safeParse(request.body ?? {});
    const dateStr = parsed.success && parsed.data.date ? parsed.data.date : undefined;
    const date = dateStr ?? new Date().toISOString().slice(0, 10);

    const session = await getOrCreateChatSession(userId, date);
    const withMessages = await getChatSessionByUserAndDate(userId, date);
    if (withMessages && withMessages.messages.length > 0) {
      return reply.send({
        alreadyHasOpener: true,
        message: withMessages.messages[0],
      });
    }

    const debriefs = await getDayDebriefs({ userId, date });
    let openerContent: string;

    const client = getOpenAIClient();
    if (debriefs.hasContent && debriefs.markdown) {
      if (client) {
        try {
          const res = await client.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: OPENER_FROM_DEBRIEF_PROMPT },
              { role: 'user', content: debriefs.markdown },
            ],
            temperature: 0.5,
            max_tokens: 500,
          });
          const text = res.choices[0]?.message?.content?.trim();
          openerContent = text || FALLBACK_OPENER;
        } catch {
          openerContent = FALLBACK_OPENER;
        }
      } else {
        openerContent = FALLBACK_OPENER;
      }
    } else {
      const { context, hasContent } = await getDayContext({ userId, date });
      if (hasContent && context && client) {
        try {
          const res = await client.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: OPENER_FROM_TRANSCRIPT_PROMPT },
              { role: 'user', content: context },
            ],
            temperature: 0.5,
            max_tokens: 500,
          });
          const text = res.choices[0]?.message?.content?.trim();
          openerContent = text || FALLBACK_OPENER;
        } catch {
          openerContent = FALLBACK_OPENER;
        }
      } else {
        openerContent = FALLBACK_OPENER;
      }
    }

    const message = await addChatMessage(session.id, 'assistant', openerContent);
    return reply.send({
      alreadyHasOpener: false,
      message: {
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt.toISOString(),
      },
    });
  });

  /**
   * POST /chat
   * Accepts useChat payload: { messages }. Optional recordingId or date for context. Streams reply via AI SDK.
   */
  app.post<{
    Body: { messages: unknown[]; date?: string; recordingId?: string };
  }>('/chat', async (request, reply) => {
    const { uid: userId, email } = requireUser(request);
    await ensureUserExists(userId, email);

    // Subscription limit check
    const limitCheck = await checkAndIncrementChatCount(userId);
    if (!limitCheck.allowed) {
      return reply.status(402).send({
        error: 'chat_limit_reached',
        message: `You've used all ${limitCheck.limit} chat messages for today. Upgrade to Twin Pro for unlimited chat.`,
        used: limitCheck.used,
        limit: limitCheck.limit,
        tier: limitCheck.tier,
      });
    }

    const parsed = postChatBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: parsed.error.flatten(),
      });
    }
    const { messages: uiMessages, date: dateStr, recordingId } = parsed.data;
    const date = dateStr ?? new Date().toISOString().slice(0, 10);

    let session;
    if (recordingId) {
      session = await getOrCreateRecordingChatSession(userId, recordingId);
    } else {
      session = await getOrCreateChatSession(userId, date);
    }

    // Persist the latest user message (last in the array from useChat)
    const lastMessage = uiMessages[uiMessages.length - 1] as {
      role?: string;
      content?: string;
      parts?: Array<{ type?: string; text?: string }>;
    };
    const userContent =
      typeof lastMessage?.content === 'string'
        ? lastMessage.content
        : getTextFromUIMessage(lastMessage ?? {});
    if (userContent) {
      await addChatMessage(session.id, 'user', userContent);
    }

    const env = getEnv();
    if (!env.OPENAI_API_KEY) {
      const mockReply =
        "I don't have access to an AI right now (no OPENAI_API_KEY). Add your key to enable chat.";
      await addChatMessage(session.id, 'assistant', mockReply);
      return reply.status(503).send({
        error: 'No OPENAI_API_KEY',
        message: mockReply,
      });
    }

    let systemContent: string;
    if (recordingId) {
      const { context, hasContent } = await getRecordingContext(recordingId, userId);
      systemContent = hasContent
        ? `${CHAT_SYSTEM_PROMPT_RECORDING}\n\n## Transcript for this recording\n\n${context}`
        : CHAT_SYSTEM_PROMPT_RECORDING + '\n\n(No transcript for this recording yet.)';
    } else {
      const { context, hasContent } = await getDayContext({ userId, date });
      systemContent = hasContent
        ? `${CHAT_SYSTEM_PROMPT_DAY}\n\n## Transcripts from this day\n\n${context}`
        : CHAT_SYSTEM_PROMPT_DAY + '\n\n(No transcripts for this day yet.)';
    }

    const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });
    const modelMessages = await convertToModelMessages(uiMessages as unknown as UIMessage[]);

    // Check if client wants streaming (via header) or non-streaming response
    const wantsStreaming = request.headers['accept']?.includes('text/event-stream') ?? true;

    if (wantsStreaming) {
      // Streaming response for web clients
      const result = streamText({
        model: openai('gpt-4o-mini'),
        system: systemContent,
        messages: modelMessages,
        temperature: 0.5,
        maxOutputTokens: 2048,
      });

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      result.pipeUIMessageStreamToResponse(reply.raw, {
        onFinish: async ({ responseMessage, isAborted }) => {
          if (isAborted) return;
          const text = getTextFromUIMessage(
            responseMessage as { parts?: Array<{ type?: string; text?: string }> }
          );
          if (text) {
            await addChatMessage(session.id, 'assistant', text);
          }
        },
      });
    } else {
      // Non-streaming response for mobile clients - use generateText instead of streamText
      const result = await generateText({
        model: openai('gpt-4o-mini'),
        system: systemContent,
        messages: modelMessages,
        temperature: 0.5,
        maxTokens: 2048,
      });

      // generateText returns { text: string } directly - no Promise wrapping
      const responseText = result.text;

      if (!responseText || !responseText.trim()) {
        return reply.status(500).send({
          error: 'Empty response from AI',
          message: 'The AI returned an empty response',
        });
      }

      await addChatMessage(session.id, 'assistant', responseText);
      // Explicitly set content-type for JSON response
      return reply.type('application/json').send({ text: responseText });
    }
  });
};
