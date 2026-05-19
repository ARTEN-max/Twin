'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { MessageCircle, Send, Loader2 } from 'lucide-react';
import { useUserId } from '@/lib/auth';
import { generateChatOpener } from '@/lib/api';
import type { ChatMessage } from '@/lib/api';
import { cn } from '@twin/ui';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

/** Convert persisted API message to UIMessage-like shape for useChat */
function toUIMessage(m: ChatMessage): {
  id: string;
  role: 'user' | 'assistant';
  parts: Array<{ type: 'text'; text: string }>;
} {
  return {
    id: m.id,
    role: m.role,
    parts: [{ type: 'text' as const, text: m.content }],
  };
}

/** Get session + messages for daily or recording-scoped chat */
async function fetchChatSession(
  userId: string,
  options: { date?: string; recordingId?: string }
): Promise<{ sessionId: string; messages: ChatMessage[] }> {
  const params = new URLSearchParams();
  if (options.date) params.set('date', options.date);
  if (options.recordingId) params.set('recordingId', options.recordingId);
  const url = `${API_BASE}/api/chat/session${params.toString() ? `?${params}` : ''}`;
  const res = await fetch(url, { headers: { 'x-user-id': userId } });
  if (!res.ok) throw new Error('Failed to load chat session');
  const data = await res.json();
  return {
    sessionId: data.sessionId,
    messages: data.messages ?? [],
  };
}

export interface ChatPanelProps {
  /** When set, chat is scoped to this recording's transcript. Otherwise daily chat. */
  recordingId?: string;
  /** Optional date for daily chat (default: today) */
  date?: string;
  /** Optional subtitle shown in header */
  subtitle?: string;
}

export function ChatPanel({ recordingId, date, subtitle }: ChatPanelProps) {
  const userId = useUserId();
  const [input, setInput] = useState('');
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  const body = useMemo(
    () => (recordingId ? { recordingId } : { date: date ?? new Date().toISOString().slice(0, 10) }),
    [recordingId, date]
  );

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        headers: { 'X-User-ID': userId },
        body,
      }),
    [userId, body]
  );

  const { messages, setMessages, sendMessage, status, error, clearError } = useChat({
    transport,
    messages: [],
  });

  // Load persisted messages and optional opener (daily only)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { messages: persisted } = await fetchChatSession(userId, {
          date: recordingId ? undefined : (date ?? new Date().toISOString().slice(0, 10)),
          recordingId,
        });
        if (cancelled) return;
        if (persisted.length > 0) {
          setMessages(persisted.map(toUIMessage) as Parameters<typeof setMessages>[0]);
        } else if (!recordingId) {
          // Daily chat: generate opener when empty
          const { alreadyHasOpener, message } = await generateChatOpener(
            userId,
            date ?? new Date().toISOString().slice(0, 10)
          );
          if (cancelled) return;
          if (!alreadyHasOpener && message) {
            setMessages([toUIMessage(message)] as Parameters<typeof setMessages>[0]);
          }
        }
      } catch {
        // ignore load errors
      } finally {
        if (!cancelled) setInitialLoadDone(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, recordingId, date, setMessages]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const text = input.trim();
      if (!text || status === 'streaming' || status === 'submitted') return;
      setInput('');
      sendMessage({ text });
    },
    [input, status, sendMessage]
  );

  const isLoading = status === 'streaming' || status === 'submitted';

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-6 w-6 text-emerald-600" />
          <div>
            <h2 className="text-lg font-semibold text-slate-900">TwinAI</h2>
            <p className="text-xs text-slate-500">
              {subtitle ?? (recordingId ? 'Chat about this recording' : 'Your day')}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {!initialLoadDone && messages.length === 0 && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
          </div>
        )}

        {initialLoadDone && messages.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-slate-500">
              {recordingId
                ? 'Ask anything about this recording.'
                : 'Say something to start—I have context from your day.'}
            </p>
          </div>
        )}

        <div className="space-y-4">
          {messages.map((msg) => {
            const text =
              msg.parts
                ?.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
                .map((p) => p.text)
                .join('') ?? '';
            return (
              <div
                key={msg.id}
                className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}
              >
                <div
                  className={cn(
                    'max-w-[85%] rounded-2xl px-4 py-3 text-sm',
                    msg.role === 'user'
                      ? 'rounded-br-md bg-emerald-600 text-white'
                      : 'rounded-bl-md bg-slate-100 text-slate-800'
                  )}
                >
                  <p className="whitespace-pre-wrap">{text}</p>
                </div>
              </div>
            );
          })}
          {isLoading && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-slate-100 px-4 py-3 text-sm text-slate-800">
                <span className="inline-block h-4 w-2 animate-pulse bg-emerald-500 align-middle" />
              </div>
            </div>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="border-t border-slate-200 bg-white p-4">
        {error && (
          <p className="mb-2 text-sm text-red-600">
            {error.message}
            <button type="button" onClick={clearError} className="ml-2 underline">
              Dismiss
            </button>
          </p>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Message TwinAI..."
            className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className={cn(
              'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white transition hover:bg-emerald-700 disabled:opacity-50',
              isLoading && 'pointer-events-none'
            )}
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
