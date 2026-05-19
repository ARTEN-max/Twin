/**
 * ChatScreen
 *
 * Daily homie coach chat interface that uses today's recordings as context.
 * Features:
 * - Messages list (user + assistant bubbles)
 * - Text input + send button
 * - Loading indicator while assistant responds
 * - Date navigation (prev/next day with AsyncStorage persistence)
 * - Fetches selected day's recordings on load
 * - Persists messages locally with AsyncStorage
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  AppState,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import {
  listRecordings,
  getRecordingResult,
  getChatSession,
  sendChatMessage,
  ApiClientError,
  type ChatMessage,
} from '@twin/shared';
import { useAuth } from '../contexts/AuthContext';
import { theme } from '../theme';

const STORAGE_BASE = `${FileSystem.documentDirectory}twin_chat/`;
const CHAT_DATE_KEY = 'twin:chat_date';

function todayString(): string {
  return new Date().toISOString().split('T')[0];
}

function offsetDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function formatDate(dateStr: string): string {
  const today = todayString();
  const yesterday = offsetDate(today, -1);
  if (dateStr === today) return 'Today';
  if (dateStr === yesterday) return 'Yesterday';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

const ensureStorageDir = async (uid: string) => {
  const dir = `${STORAGE_BASE}${uid}/`;
  const dirInfo = await FileSystem.getInfoAsync(dir);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
};

interface ChatScreenProps {
  onBack?: () => void;
  onPaywall?: (reason: string) => void;
}

interface DailyContext {
  recordings: Array<{
    id: string;
    title: string;
    transcript?: {
      text: string;
      segments?: Array<{ text: string; start: number; end: number }>;
    };
    debrief?: {
      markdown: string;
      sections?: Array<{ title: string; content: string }>;
    };
  }>;
}

export default function ChatScreen({ onBack: _onBack, onPaywall }: ChatScreenProps) {
  const { user } = useAuth();
  const userId = user!.uid;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dailyContext, setDailyContext] = useState<DailyContext>({ recordings: [] });
  const [selectedDate, setSelectedDate] = useState<string>(todayString);
  const flatListRef = useRef<FlatList>(null);
  // Refs so callbacks always see latest values without stale closures
  const selectedDateRef = useRef(selectedDate);
  selectedDateRef.current = selectedDate;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // Restore last-viewed chat date on mount, but never a future date
  useEffect(() => {
    AsyncStorage.getItem(CHAT_DATE_KEY).then((saved) => {
      if (saved && saved <= todayString()) {
        setSelectedDate(saved);
      }
    });
  }, []);

  const changeDate = useCallback((newDate: string) => {
    setSelectedDate(newDate);
    AsyncStorage.setItem(CHAT_DATE_KEY, newDate);
  }, []);

  const getStoragePath = (date: string) => `${STORAGE_BASE}${userId}/${date}.json`;

  const normalizeMessages = (msgs: ChatMessage[]): ChatMessage[] => {
    if (!Array.isArray(msgs)) {
      console.warn('normalizeMessages: input is not an array', msgs);
      return [];
    }
    return msgs
      .map((msg, index) => {
        if (!msg || typeof msg !== 'object') {
          console.warn(`normalizeMessages: invalid message at index ${index}`, msg);
          return null;
        }
        let content = msg.content;
        if (content && typeof content === 'object' && 'then' in content) {
          console.warn(`Found Promise in message content at index ${index}, filtering out`, msg);
          return null;
        }
        if (typeof content === 'string' && content.includes('[object Promise]')) {
          console.warn(
            `Found [object Promise] string in message at index ${index}, filtering out`,
            msg
          );
          return null;
        }
        const normalizedContent = typeof content === 'string' ? content : String(content || '');
        if (!normalizedContent.trim()) {
          console.warn(`Found empty message at index ${index}, filtering out`, msg);
          return null;
        }
        return { ...msg, content: normalizedContent };
      })
      .filter((msg): msg is ChatMessage => msg !== null);
  };

  const saveMessagesLocally = async (msgs: ChatMessage[], date: string) => {
    try {
      await ensureStorageDir(userId);
      await FileSystem.writeAsStringAsync(getStoragePath(date), JSON.stringify(msgs));
    } catch (err) {
      console.error('Error saving messages locally:', err);
    }
  };

  const loadChatData = async (date: string) => {
    try {
      setLoading(true);
      setError(null);

      const recordingsResponse = await listRecordings(userId, { date, limit: 50 });
      const recordingsArray = recordingsResponse?.data || [];
      const completeRecordings = recordingsArray.filter((r: any) => r.status === 'complete');

      const contextRecordings = await Promise.all(
        completeRecordings.map(async (recording: any) => {
          try {
            const fullRecording = await getRecordingResult(userId, recording.id);
            return {
              id: fullRecording.id,
              title: fullRecording.title || 'Untitled',
              transcript: fullRecording.transcript
                ? {
                    text: fullRecording.transcript.text,
                    segments: fullRecording.transcript.segments || [],
                  }
                : undefined,
              debrief: fullRecording.debrief
                ? {
                    markdown: fullRecording.debrief.markdown,
                    sections: fullRecording.debrief.sections || [],
                  }
                : undefined,
            };
          } catch (err) {
            console.error(`Failed to load recording ${recording.id}:`, err);
            return null;
          }
        })
      );

      setDailyContext({
        recordings: contextRecordings.filter((r) => r !== null) as DailyContext['recordings'],
      });

      try {
        const session = await getChatSession(userId, date);
        if (session.messages && session.messages.length > 0) {
          const normalized = normalizeMessages(session.messages);
          setMessages(normalized);
          await FileSystem.writeAsStringAsync(getStoragePath(date), JSON.stringify(normalized));
        } else {
          try {
            const local = await FileSystem.readAsStringAsync(getStoragePath(date));
            if (local) setMessages(normalizeMessages(JSON.parse(local)));
          } catch {
            /* no local file */
          }
        }
      } catch (sessionError) {
        console.error('Error loading chat session:', sessionError);
        try {
          const local = await FileSystem.readAsStringAsync(getStoragePath(date));
          if (local) setMessages(normalizeMessages(JSON.parse(local)));
        } catch {
          /* no local file */
        }
      }
    } catch (err) {
      console.error('Error loading chat data:', err);
      setError(
        err instanceof ApiClientError
          ? `API Error: ${err.message} (${err.statusCode})`
          : err instanceof Error
            ? err.message
            : 'Failed to load chat'
      );
      try {
        const local = await FileSystem.readAsStringAsync(getStoragePath(date));
        if (local) setMessages(normalizeMessages(JSON.parse(local)));
      } catch {
        /* no local file */
      }
    } finally {
      setLoading(false);
    }
  };

  // Reset and reload when userId or selectedDate changes
  useEffect(() => {
    setMessages([]);
    setDailyContext({ recordings: [] });
    setInputText('');
    setError(null);
    setLoading(true);
    ensureStorageDir(userId).then(() => loadChatData(selectedDateRef.current));
  }, [userId, selectedDate]);

  // Poll for proactive openers (today only)
  // Use messagesRef so this effect doesn't recreate the interval on every message
  useEffect(() => {
    const interval = setInterval(async () => {
      const date = selectedDateRef.current;
      if (sending || date !== todayString()) return;
      try {
        const session = await getChatSession(userId, date);
        if (session.messages && session.messages.length > messagesRef.current.length) {
          const normalized = normalizeMessages(session.messages);
          setMessages(normalized);
          await saveMessagesLocally(normalized, date);
        }
      } catch {
        /* silently ignore */
      }
    }, 15_000);
    return () => clearInterval(interval);
  }, [userId, sending]);

  // Refresh on foreground (today only)
  // Use messagesRef so this effect doesn't re-subscribe on every message
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      const date = selectedDateRef.current;
      if (nextState === 'active' && !sending && date === todayString()) {
        getChatSession(userId, date)
          .then(async (session) => {
            if (session.messages && session.messages.length > messagesRef.current.length) {
              const normalized = normalizeMessages(session.messages);
              setMessages(normalized);
              await saveMessagesLocally(normalized, date);
            }
          })
          .catch(() => {
            /* silently ignore */
          });
      }
    });
    return () => sub.remove();
  }, [userId, sending]);

  const handleSend = async (retryCount = 0) => {
    const text = inputText.trim();
    if (!text || sending) return;

    const date = selectedDateRef.current;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    };

    let messagesWithUser = [...messages, userMessage];

    if (retryCount === 0) {
      const normalized = normalizeMessages(messagesWithUser);
      setMessages(normalized);
      setInputText('');
      setSending(true);
      setError(null);
      await saveMessagesLocally(normalized, date);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }

    try {
      const messagesWithoutLoading = messagesWithUser.filter(
        (m) => !m.id.startsWith('assistant-loading-')
      );

      const uiMessages = messagesWithoutLoading.map((m) => ({
        id: m.id,
        role: m.role,
        parts: [{ type: 'text' as const, text: m.content }],
      }));

      const loadingMessage: ChatMessage = {
        id: `assistant-loading-${Date.now()}`,
        role: 'assistant',
        content: '...',
        createdAt: new Date().toISOString(),
      };
      setMessages(normalizeMessages([...messagesWithoutLoading, loadingMessage]));

      let responseText: string;
      try {
        responseText = await sendChatMessage(userId, { messages: uiMessages, date });
        if (!responseText || responseText.trim() === '')
          throw new Error('Empty response from server');
      } catch (sendError) {
        setMessages(normalizeMessages(messagesWithoutLoading));
        throw sendError;
      }

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: responseText,
        createdAt: new Date().toISOString(),
      };

      const finalMessages = normalizeMessages([...messagesWithoutLoading, assistantMessage]);
      setMessages(finalMessages);
      await saveMessagesLocally(finalMessages, date);
      setSending(false);
      setError(null);
      setInputText('');
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (err) {
      const isRetryable =
        err instanceof ApiClientError &&
        (err.code === 'STREAM_NOT_READY' ||
          err.code === 'EMPTY_STREAM' ||
          err.message.includes('not ready') ||
          err.message.includes('no response body'));

      if (isRetryable && retryCount < 4) {
        const delay = [500, 1000, 1500, 2000][retryCount] || 2000;
        if (__DEV__)
          console.log(
            `Auto-retrying chat message (attempt ${retryCount + 1}/4) after ${delay}ms...`
          );
        setTimeout(() => handleSend(retryCount + 1), delay);
        return;
      }

      console.error('Error sending message:', err);

      if (err instanceof ApiClientError && err.statusCode === 402) {
        setMessages(
          normalizeMessages(messages.filter((m) => !m.id.startsWith('assistant-loading-')))
        );
        setSending(false);
        onPaywall?.('chat_limit_reached');
        return;
      }

      setMessages(
        normalizeMessages(messages.filter((m) => !m.id.startsWith('assistant-loading-')))
      );

      let errorMessage: string;
      if (err instanceof ApiClientError) {
        if (err.statusCode === 503 && err.message.includes('OPENAI_API_KEY')) {
          errorMessage = 'AI service unavailable. Please configure OPENAI_API_KEY.';
          setTimeout(() => loadChatData(selectedDateRef.current), 500);
        } else {
          errorMessage = `API Error: ${err.message}${err.statusCode ? ` (${err.statusCode})` : ''}`;
        }
      } else if (err instanceof Error) {
        errorMessage = err.message;
      } else {
        errorMessage = 'Failed to send message';
      }
      setError(errorMessage);
      setSending(false);
    }
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isUser = item.role === 'user';
    if (!item.content || !item.content.trim() || item.content.includes('[object Promise]'))
      return null;
    return (
      <View
        style={[
          styles.messageContainer,
          isUser ? styles.userMessageContainer : styles.assistantMessageContainer,
        ]}
      >
        <View style={[styles.messageBubble, isUser ? styles.userBubble : styles.assistantBubble]}>
          <Text style={[styles.messageText, isUser ? styles.userText : styles.assistantText]}>
            {item.content}
          </Text>
        </View>
      </View>
    );
  };

  const renderEmptyState = () => {
    if (dailyContext.recordings.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateTitle}>
            {selectedDate === todayString()
              ? 'Record something to unlock your daily context.'
              : `No recordings for ${formatDate(selectedDate)}.`}
          </Text>
          <Text style={styles.emptyStateText}>
            {selectedDate === todayString()
              ? "Once you have recordings with transcripts and debriefs, I'll be able to help you reflect on your day."
              : 'Use the arrows to navigate to a day with recordings.'}
          </Text>
        </View>
      );
    }
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyStateTitle}>Start a conversation</Text>
        <Text style={styles.emptyStateText}>
          Ask me anything about your day, or let me know what's on your mind.
        </Text>
      </View>
    );
  };

  const isToday = selectedDate === todayString();

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.dateNav}>
        <TouchableOpacity
          style={styles.navArrow}
          onPress={() => changeDate(offsetDate(selectedDate, -1))}
        >
          <Text style={styles.navArrowText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{formatDate(selectedDate)}</Text>
        <TouchableOpacity
          style={[styles.navArrow, isToday && styles.navArrowDisabled]}
          disabled={isToday}
          onPress={() => {
            if (!isToday) changeDate(offsetDate(selectedDate, 1));
          }}
        >
          <Text style={[styles.navArrowText, isToday && styles.navArrowTextDisabled]}>›</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        {renderHeader()}
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      </View>
    );
  }

  const visibleMessages = messages.filter(
    (m) => m.content && m.content.trim() && !m.content.includes('[object Promise]')
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      {renderHeader()}

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => loadChatData(selectedDate)} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        ref={flatListRef}
        data={visibleMessages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={
          visibleMessages.length === 0 ? styles.emptyList : styles.messagesList
        }
        ListEmptyComponent={renderEmptyState}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
      />

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Type a message..."
          placeholderTextColor="#666"
          multiline
          editable={!sending}
        />
        <TouchableOpacity
          style={[styles.sendButton, (!inputText.trim() || sending) && styles.sendButtonDisabled]}
          onPress={() => {
            void handleSend();
          }}
          disabled={!inputText.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <Text style={styles.sendButtonText}>Send</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  header: {
    paddingHorizontal: 8,
    paddingTop: 60,
    paddingBottom: 14,
    backgroundColor: theme.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  dateNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navArrow: {
    width: 44,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navArrowDisabled: {
    opacity: 0.2,
  },
  navArrowText: {
    fontSize: 28,
    color: theme.textPrimary,
    lineHeight: 32,
  },
  navArrowTextDisabled: {
    color: theme.textMuted,
  },
  headerTitle: {
    fontFamily: theme.fontDisplay,
    fontSize: 26,
    color: theme.textPrimary,
    letterSpacing: 0.3,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    margin: 16,
    padding: 14,
    backgroundColor: theme.errorDim,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(184,92,92,0.25)',
  },
  errorText: {
    color: theme.error,
    fontSize: 13,
    fontFamily: theme.fontMono,
    marginBottom: 10,
    lineHeight: 19,
  },
  retryButton: {
    backgroundColor: theme.accent,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  retryButtonText: {
    color: theme.bg,
    fontFamily: theme.fontMono,
    fontSize: 12,
    letterSpacing: 0.5,
  },
  emptyList: {
    flexGrow: 1,
  },
  messagesList: {
    padding: 16,
    paddingBottom: 8,
  },
  messageContainer: {
    marginBottom: 10,
  },
  userMessageContainer: {
    alignItems: 'flex-end',
  },
  assistantMessageContainer: {
    alignItems: 'flex-start',
  },
  messageBubble: {
    maxWidth: '82%',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 16,
  },
  userBubble: {
    backgroundColor: theme.accent,
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: theme.surfaceHigh,
    borderWidth: 1,
    borderColor: theme.border,
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  userText: {
    color: theme.bg,
    fontWeight: '500',
  },
  assistantText: {
    color: theme.textPrimary,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyStateTitle: {
    fontFamily: theme.fontDisplay,
    fontSize: 22,
    color: theme.textPrimary,
    marginBottom: 10,
    textAlign: 'center',
  },
  emptyStateText: {
    fontFamily: theme.fontMono,
    fontSize: 12,
    color: theme.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  inputContainer: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 12,
    paddingBottom: Platform.OS === 'ios' ? 12 : 12,
    backgroundColor: theme.surface,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    alignItems: 'flex-end',
    gap: 10,
  },
  input: {
    flex: 1,
    backgroundColor: theme.surfaceHigh,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: theme.textPrimary,
    fontSize: 15,
    maxHeight: 100,
    fontFamily: theme.fontMono,
  },
  sendButton: {
    backgroundColor: theme.accent,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 18,
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: theme.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  sendButtonDisabled: {
    opacity: 0.4,
    shadowOpacity: 0,
  },
  sendButtonText: {
    color: theme.bg,
    fontFamily: theme.fontMono,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});
