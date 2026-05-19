import OpenAI from 'openai';
import type { DebriefSection } from '@twin/shared';
import { getEnv } from '../env.js';

// ============================================
// Types
// ============================================

export type DebriefProvider = 'openai' | 'mock';

export interface DebriefResult {
  markdown: string;
  sections: DebriefSection[];
}

interface DebriefAnalysis {
  situation: string;
  emotionalDynamics: string;
  turningPoints: string[];
  whatTheUserMayBeMissing: string;
  ambiguities: string;
  adviceStance: 'none' | 'light' | 'direct';
  tone: string;
  keyQuotes: string[];
}

const TRANSCRIPT_CHARS_PER_SUMMARY_CHUNK = 16000;
const DIRECT_DEBRIEF_CHAR_LIMIT = 24000;

// Get the debrief provider from env
function getDebriefProvider(): DebriefProvider {
  const provider = process.env.DEBRIEF_PROVIDER || 'openai';
  if (provider !== 'openai' && provider !== 'mock') {
    console.warn(`Unknown DEBRIEF_PROVIDER "${provider}", defaulting to openai`);
    return 'openai';
  }
  return provider;
}

// NOTE: We intentionally do NOT enforce a fixed structured output schema here.
// The debrief is free-form markdown so it can adapt to the topic/content.

// ============================================
// System Prompts by Mode
// ============================================

const MODE_CONTEXTS: Record<string, string> = {
  general:
    'Treat this as a real human interaction. Pay attention to emotional subtext, mutual interest or distance, confusion, avoidance, tenderness, tension, and shifts in power or vulnerability. Do not force a win/loss frame.',
  sales:
    'Treat this as a business conversation. Pay attention to trust, resistance, clarity, pressure, buyer energy, hesitation, and what was left unsaid. Do not reduce everything to closing technique.',
  interview:
    'Treat this as an interview or evaluative conversation. Pay attention to confidence, clarity, rapport, defensiveness, curiosity, and how the person likely came across, not just whether an answer was "good."',
  meeting:
    'Treat this as a collaborative conversation. Pay attention to alignment, misalignment, power dynamics, ownership, friction, emotional temperature, and what changed the room.',
};

const ANALYSIS_SYSTEM_PROMPT = `You are analyzing a transcript so another model can write a deeply tailored debrief.

Do not coach by default. Do not reduce the interaction to success/failure unless the transcript is unmistakably that simple.

Your job is to identify:
- what was actually happening
- the emotional and relational dynamics
- what shifted over the course of the interaction
- what the speaker may be missing
- where ambiguity remains
- whether advice is actually warranted, or whether interpretation is more useful

Return strict JSON with this exact shape:
{
  "situation": string,
  "emotionalDynamics": string,
  "turningPoints": string[],
  "whatTheUserMayBeMissing": string,
  "ambiguities": string,
  "adviceStance": "none" | "light" | "direct",
  "tone": string,
  "keyQuotes": string[]
}

Rules:
- Be specific and concrete.
- Use exact quotes when possible.
- Keep uncertainty honest.
- If this is mainly something to process, not solve, set adviceStance to "none".`;

const FINAL_DEBRIEF_SYSTEM_PROMPT = `You are Twin. You are helping someone understand what happened in a real interaction.

Default stance: perceptive, emotionally literate, specific, grounded. More interpreter than coach.

Most recordings are not clean wins or losses. Do not force a score, lesson, or action item when the deeper truth is ambiguity, mismatch, grief, confusion, tenderness, distance, or unresolved tension.

What good looks like:
- It sounds like someone who actually listened
- It names the emotional truth of the moment
- It anchors itself in specific lines or turns in the conversation
- It surfaces what changed
- It helps the user understand themselves, the other person, or the dynamic more clearly

What bad looks like:
- generic communication advice
- fake balance
- performance-review tone
- forced positivity
- turning every interaction into "what you did wrong"

Writing rules:
- Write in natural text-message-style prose
- No bullet points
- No numbered lists
- No headers unless the transcript is complex enough that they genuinely help
- Use contractions
- Sound human, not therapeutic, corporate, or report-like
- If advice is warranted, keep it secondary and minimal
- If no advice is warranted, do not invent any
- End with a line that leaves the thought open, not a sign-off

The goal is not to make the user feel coached. The goal is to make them feel accurately understood.`;

// ============================================
// OpenAI Client
// ============================================

function getOpenAIClient(): OpenAI {
  const env = getEnv();
  return new OpenAI({
    apiKey: env.OPENAI_API_KEY,
  });
}

function getModeContext(mode: string): string {
  return MODE_CONTEXTS[mode] ?? MODE_CONTEXTS.general;
}

function parseDebriefAnalysis(raw: string): DebriefAnalysis {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Debrief analysis did not return JSON');
  }

  const parsed = JSON.parse(raw.slice(start, end + 1)) as Partial<DebriefAnalysis>;
  return {
    situation: typeof parsed.situation === 'string' ? parsed.situation : '',
    emotionalDynamics: typeof parsed.emotionalDynamics === 'string' ? parsed.emotionalDynamics : '',
    turningPoints: Array.isArray(parsed.turningPoints)
      ? parsed.turningPoints.filter((value): value is string => typeof value === 'string')
      : [],
    whatTheUserMayBeMissing:
      typeof parsed.whatTheUserMayBeMissing === 'string' ? parsed.whatTheUserMayBeMissing : '',
    ambiguities: typeof parsed.ambiguities === 'string' ? parsed.ambiguities : '',
    adviceStance:
      parsed.adviceStance === 'none' ||
      parsed.adviceStance === 'light' ||
      parsed.adviceStance === 'direct'
        ? parsed.adviceStance
        : 'none',
    tone: typeof parsed.tone === 'string' ? parsed.tone : '',
    keyQuotes: Array.isArray(parsed.keyQuotes)
      ? parsed.keyQuotes.filter((value): value is string => typeof value === 'string')
      : [],
  };
}

async function analyzeTranscript(
  client: OpenAI,
  transcriptText: string,
  mode: string,
  title: string
): Promise<DebriefAnalysis> {
  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: ANALYSIS_SYSTEM_PROMPT },
      {
        role: 'user',
        content:
          `Recording title: "${title}"\nMode: "${mode}"\nMode context: ${getModeContext(mode)}\n\n` +
          `Transcript:\n${transcriptText}`,
      },
    ],
    temperature: 0.2,
    max_tokens: 800,
  });

  const content = response.choices[0]?.message?.content?.trim();
  if (!content) {
    throw new Error('No content in debrief analysis response');
  }

  return parseDebriefAnalysis(content);
}

// ============================================
// Main Debrief Generation
// ============================================

/**
 * Generate a mock debrief for local development/testing
 */
async function generateMockDebrief(
  transcriptText: string,
  mode: string,
  title: string
): Promise<DebriefResult> {
  // Simulate API delay
  await new Promise((resolve) => setTimeout(resolve, 1000));

  console.log('✅ Using mock debrief provider');

  const sections: DebriefSection[] = [
    {
      title: 'Key Discussion Points',
      content: `This is a mock debrief for "${title}".\n\nThe transcript contained ${transcriptText.length} characters discussing various topics related to ${mode}.`,
      order: 1,
    },
    {
      title: 'Decisions Made',
      content:
        '- Decision 1: Proceed with the current approach\n- Decision 2: Schedule follow-up meeting\n- Decision 3: Assign ownership to team leads',
      order: 2,
    },
    {
      title: 'Next Steps',
      content:
        '1. Review the discussed items\n2. Prepare action plan\n3. Share summary with stakeholders',
      order: 3,
    },
  ];

  const markdown = `# Debrief: ${title}

## Summary
This is a **mock debrief** generated for local development. In production, this would be generated by OpenAI GPT-4o analyzing the transcript.

## Mode
This recording was analyzed as a **${mode}** type.

## Key Discussion Points
${sections[0].content}

## Decisions Made
${sections[1].content}

## Next Steps
${sections[2].content}

## Action Items
- 🔴 Review transcript and verify accuracy (High Priority)
- 🟡 Share debrief with team members (Medium Priority)
- 🟢 Archive recording for future reference (Low Priority)

---
*Note: This is mock data. Set \`DEBRIEF_PROVIDER=openai\` for real AI-generated debriefs.*
`;

  return {
    markdown,
    sections,
  };
}

/**
 * Generate a debrief from a transcript using OpenAI
 */
export async function generateDebrief(
  transcriptText: string,
  mode: string,
  title: string
): Promise<DebriefResult> {
  const provider = getDebriefProvider();

  if (provider === 'mock') {
    return generateMockDebrief(transcriptText, mode, title);
  }

  const client = getOpenAIClient();
  const transcriptForPrompt =
    transcriptText.length > DIRECT_DEBRIEF_CHAR_LIMIT
      ? await buildLongTranscriptDigest(client, transcriptText, mode, title)
      : transcriptText;
  const analysis = await analyzeTranscript(client, transcriptForPrompt, mode, title);

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: FINAL_DEBRIEF_SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content:
          `Transcript title: "${title}"\nMode: "${mode}"\nMode context: ${getModeContext(mode)}\n\n` +
          `Analysis:\n` +
          `- Situation: ${analysis.situation}\n` +
          `- Emotional dynamics: ${analysis.emotionalDynamics}\n` +
          `- Turning points: ${analysis.turningPoints.join(' | ') || 'none clearly isolated'}\n` +
          `- What the user may be missing: ${analysis.whatTheUserMayBeMissing}\n` +
          `- Ambiguities: ${analysis.ambiguities}\n` +
          `- Advice stance: ${analysis.adviceStance}\n` +
          `- Suggested tone: ${analysis.tone}\n` +
          `- Key quotes: ${analysis.keyQuotes.join(' | ') || 'none captured'}\n\n` +
          `Transcript:\n${transcriptForPrompt}\n\n` +
          `Write a debrief that helps the user understand this interaction on a deeper level. ` +
          `Only give direct advice if the analysis genuinely calls for it.`,
      },
    ],
    temperature: 0.3, // Lower temperature for more consistent output
    max_tokens: 4000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No content in OpenAI response');
  }

  const markdown = content.trim();
  const sections = extractSectionsFromMarkdown(markdown);

  return {
    markdown,
    sections,
  };
}

async function buildLongTranscriptDigest(
  client: OpenAI,
  transcriptText: string,
  mode: string,
  title: string
): Promise<string> {
  const chunks = splitTranscriptForSummaries(transcriptText, TRANSCRIPT_CHARS_PER_SUMMARY_CHUNK);
  const summaries: string[] = [];

  for (let index = 0; index < chunks.length; index++) {
    const chunk = chunks[index];
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'Summarize this transcript chunk for a later final debrief. Preserve emotional shifts, turning points, power dynamics, contradictions, awkwardness, tenderness, avoidance, standout quotes, what changed in the interaction, and anything the speaker may be misreading. Keep it compact but information-dense.',
        },
        {
          role: 'user',
          content:
            `Recording title: "${title}"\nMode: "${mode}"\nChunk ${index + 1} of ${chunks.length}\n\n` +
            `Transcript chunk:\n${chunk}`,
        },
      ],
      temperature: 0.2,
      max_tokens: 600,
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) {
      throw new Error(`Failed to summarize transcript chunk ${index + 1}`);
    }

    summaries.push(`Chunk ${index + 1} summary:\n${content}`);
  }

  return (
    'This recording was too long to pass as one raw transcript. Below are ordered chunk summaries extracted from the full session. ' +
    'Base the final debrief on the full arc of these summaries, not just one moment.\n\n' +
    summaries.join('\n\n')
  );
}

function splitTranscriptForSummaries(transcriptText: string, maxChars: number): string[] {
  const paragraphs = transcriptText
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) {
    return [transcriptText.slice(0, maxChars)];
  }

  const chunks: string[] = [];
  let current = '';

  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }

    if (current) {
      chunks.push(current);
    }

    if (paragraph.length <= maxChars) {
      current = paragraph;
      continue;
    }

    for (let start = 0; start < paragraph.length; start += maxChars) {
      chunks.push(paragraph.slice(start, start + maxChars));
    }
    current = '';
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

// ============================================
// Proactive Chat Opener
// ============================================

const PROACTIVE_OPENER_PROMPT = `You are TwinAI. You just processed someone's recording and you have the debrief below. You're texting them RIGHT NOW with the first real reaction that comes to mind.

Write ONE short punchy message (1-3 sentences). Lead with a reaction, not a summary.

Do not force a win/loss frame. React to what is actually most alive in the interaction:
- a clear moment
- emotional confusion
- chemistry or distance
- something awkward
- something quietly revealing
- something the user may not have noticed about themselves or the other person

Rules:
- Pull something SPECIFIC from the debrief - a quote, a moment, a turn in the conversation
- No vague generic encouragement
- Casual and human, no markdown, no bullet points
- Sound like a perceptive friend, not a coach
- If there's genuinely nothing interesting to react to, respond with EXACTLY the word "SKIP" and nothing else

The goal: they open their app, see this, and feel understood enough to respond.`;

/**
 * Generate a proactive chat opener from a completed debrief.
 * Returns the message text, or null if the content isn't interesting enough.
 */
export async function generateProactiveOpener(
  debriefMarkdown: string,
  recordingTitle: string
): Promise<string | null> {
  const provider = getDebriefProvider();

  if (provider === 'mock') {
    // In mock mode, return a simple opener for testing
    return `just finished going through "${recordingTitle}" - got some thoughts whenever you're ready`;
  }

  try {
    const client = getOpenAIClient();

    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: PROACTIVE_OPENER_PROMPT },
        {
          role: 'user',
          content: `Recording title: "${recordingTitle}"\n\nDebrief:\n${debriefMarkdown}`,
        },
      ],
      temperature: 0.7, // Slightly higher for personality
      max_tokens: 200,
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) return null;

    // If AI says SKIP, return null
    if (content.toUpperCase() === 'SKIP') {
      return null;
    }

    return content;
  } catch (error) {
    console.error('[ProactiveOpener] Failed to generate opener:', error);
    return null; // Don't fail the debrief job over this
  }
}

/**
 * Extract sections from Markdown for DB storage.
 * We treat each `## Heading` as a section.
 */
function extractSectionsFromMarkdown(markdown: string): DebriefSection[] {
  const lines = markdown.split(/\r?\n/);
  const sections: DebriefSection[] = [];

  let currentTitle: string | null = null;
  let currentLines: string[] = [];

  const flush = () => {
    if (!currentTitle) return;
    sections.push({
      title: currentTitle,
      content: currentLines.join('\n').trim(),
      order: sections.length,
    });
    currentTitle = null;
    currentLines = [];
  };

  for (const line of lines) {
    const match = line.match(/^##\s+(.+)\s*$/);
    if (match) {
      flush();
      currentTitle = match[1].trim();
      continue;
    }
    if (currentTitle) currentLines.push(line);
  }
  flush();

  if (sections.length === 0) {
    return [{ title: 'Debrief', content: markdown.trim(), order: 0 }];
  }

  return sections;
}
