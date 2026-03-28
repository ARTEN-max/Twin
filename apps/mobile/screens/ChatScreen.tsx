/* global setInterval, clearInterval, setTimeout, __DEV__, console */
/**
 * ChatScreen
 *
 * Daily homie coach chat interface that uses today's recordings as context.
 * Features:
 * - Messages list (user + assistant bubbles)
 * - Text input + send button
 * - Loading indicator while assistant responds
 * - Fetches today's recordings on load
 * - Builds dailyContext from complete recordings
 * - Persists messages locally with AsyncStorage
 */

import React, { useState, useEffect, useRef } from 'react';
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
import * as FileSystem from 'expo-file-system/legacy';
import {
  listRecordings,
  getRecordingResult,
  getChatSession,
  sendChatMessage,
  ApiClientError,
  type ChatMessage,
} from '@komuchi/shared';
import { useAuth } from '../contexts/AuthContext';

const STORAGE_BASE = `${FileSystem.documentDirectory}komuchi_chat/`;

// Ensure storage directory exists for a given user
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
  const flatListRef = useRef<FlatList>(null);
  const today = new Date().toISOString().split('T')[0];

  // Reset state and reload when the user changes (account switch)
  useEffect(() => {
    setMessages([]);
    setDailyContext({ recordings: [] });
    setInputText('');
    setError(null);
    setLoading(true);

    ensureStorageDir(userId).then(() => {
      loadChatData();
    });
  }, [userId]);

  // Refresh messages periodically to pick up proactive openers from the backend.
  // These are generated server-side after a recording finishes processing.
  useEffect(() => {
    const interval = setInterval(async () => {
      // Only refresh if not currently sending a message
      if (sending) return;
      try {
        const session = await getChatSession(userId, today);
        if (session.messages && session.messages.length > messages.length) {
          const normalizedMessages = normalizeMessages(session.messages);
          setMessages(normalizedMessages);
          await saveMessagesLocally(normalizedMessages);
        }
      } catch {
        // Silently ignore — this is a background refresh
      }
    }, 15_000); // Every 15 seconds

    return () => clearInterval(interval);
  }, [userId, today, messages.length, sending]);

  // Also refresh when app returns to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && !sending) {
        getChatSession(userId, today)
          .then(async (session) => {
            if (session.messages && session.messages.length > messages.length) {
              const normalizedMessages = normalizeMessages(session.messages);
              setMessages(normalizedMessages);
              await saveMessagesLocally(normalizedMessages);
            }
          })
          .catch(() => {
            // Silently ignore
          });
      }
    });
    return () => sub.remove();
  }, [userId, today, messages.length, sending]);

  const getStoragePath = (date: string) => `${STORAGE_BASE}${userId}/${date}.json`;

  // Helper function to normalize messages and ensure content is always a string
  // Filters out corrupted messages (with [object Promise] or empty content)
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

        // If content is a Promise, we can't resolve it here, so filter it out
        if (content && typeof content === 'object' && 'then' in content) {
          console.warn(`Found Promise in message content at index ${index}, filtering out`, msg);
          return null;
        }

        // Handle case where content might be [object Promise] string
        if (typeof content === 'string' && content.includes('[object Promise]')) {
          console.warn(
            `Found [object Promise] string in message at index ${index}, filtering out`,
            msg
          );
          return null;
        }

        // Ensure content is always a string
        const normalizedContent = typeof content === 'string' ? content : String(content || '');

        // Filter out messages with empty content (corrupted messages)
        if (!normalizedContent.trim()) {
          console.warn(`Found empty message at index ${index}, filtering out`, msg);
          return null;
        }

        return {
          ...msg,
          content: normalizedContent,
        };
      })
      .filter((msg): msg is ChatMessage => msg !== null);
  };

  const loadChatData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load today's recordings
      const recordingsResponse = await listRecordings(userId, {
        date: today,
        limit: 50,
      });

      const recordingsArray = recordingsResponse?.data || [];
      const completeRecordings = recordingsArray.filter((r: any) => r.status === 'complete');

      // Fetch full details (transcript + debrief) for complete recordings
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

      const validRecordings = contextRecordings.filter(
        (r) => r !== null
      ) as DailyContext['recordings'];
      setDailyContext({ recordings: validRecordings });

      // Load chat session from backend
      try {
        const session = await getChatSession(userId, today);
        if (session.messages && session.messages.length > 0) {
          const normalizedMessages = normalizeMessages(session.messages);
          setMessages(normalizedMessages);
          await FileSystem.writeAsStringAsync(
            getStoragePath(today),
            JSON.stringify(normalizedMessages)
          );
        } else {
          // Try loading from local storage
          try {
            const localMessages = await FileSystem.readAsStringAsync(getStoragePath(today));
            if (localMessages) {
              const parsed = JSON.parse(localMessages);
              const normalizedMessages = normalizeMessages(parsed);
              setMessages(normalizedMessages);
            }
          } catch {
            // File doesn't exist, that's okay
          }
        }
      } catch (sessionError) {
        console.error('Error loading chat session:', sessionError);
        // Try loading from local storage as fallback
        try {
          const localMessages = await FileSystem.readAsStringAsync(getStoragePath(today));
          if (localMessages) {
            const parsed = JSON.parse(localMessages);
            const normalizedMessages = normalizeMessages(parsed);
            setMessages(normalizedMessages);
          }
        } catch {
          // File doesn't exist, that's okay
        }
      }
    } catch (err) {
      console.error('Error loading chat data:', err);
      const errorMessage =
        err instanceof ApiClientError
          ? `API Error: ${err.message} (${err.statusCode})`
          : err instanceof Error
            ? err.message
            : 'Failed to load chat';
      setError(errorMessage);

      // Try loading from local storage as fallback
      try {
        const localMessages = await FileSystem.readAsStringAsync(getStoragePath(today));
        if (localMessages) {
          const parsed = JSON.parse(localMessages);
          const normalizedMessages = normalizeMessages(parsed);
          setMessages(normalizedMessages);
        }
      } catch {
        // File doesn't exist, that's okay
      }
    } finally {
      setLoading(false);
    }
  };

  const saveMessagesLocally = async (msgs: ChatMessage[]) => {
    try {
      await ensureStorageDir(userId);
      await FileSystem.writeAsStringAsync(getStoragePath(today), JSON.stringify(msgs));
    } catch (err) {
      console.error('Error saving messages locally:', err);
    }
  };

  const handleSend = async (retryCount = 0) => {
    const text = inputText.trim();
    if (!text || sending) return;

    // Create user message
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    };

    // Get current messages and add user message
    let messagesWithUser = [...messages, userMessage];

    // Only update UI and clear input on first attempt
    if (retryCount === 0) {
      const normalizedMessages = normalizeMessages(messagesWithUser);
      setMessages(normalizedMessages);
      setInputText(''); // Clear input immediately
      setSending(true);
      setError(null);
      await saveMessagesLocally(normalizedMessages);

      // Scroll to bottom
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }

    try {
      // Remove any loading messages, but keep all other messages including user message
      const messagesWithoutLoading = messagesWithUser.filter(
        (m) => !m.id.startsWith('assistant-loading-')
      );

      // Convert to UIMessage format expected by backend (with parts array)
      const uiMessages = messagesWithoutLoading.map((m) => ({
        id: m.id,
        role: m.role,
        parts: [{ type: 'text' as const, text: m.content }],
      }));

      // Add a temporary loading message
      const loadingMessageId = `assistant-loading-${Date.now()}`;
      const loadingMessage: ChatMessage = {
        id: loadingMessageId,
        role: 'assistant',
        content: '...',
        createdAt: new Date().toISOString(),
      };
      // Build messages: all existing (including user) + loading
      const messagesWithLoading = [...messagesWithoutLoading, loadingMessage];
      const normalizedWithLoading = normalizeMessages(messagesWithLoading);
      setMessages(normalizedWithLoading);

      let responseText: string;
      try {
        responseText = await sendChatMessage(userId, {
          messages: uiMessages,
          date: today,
        });

        if (!responseText || responseText.trim() === '') {
          throw new Error('Empty response from server');
        }
      } catch (sendError) {
        // Remove loading message on error
        const normalizedWithoutLoading = normalizeMessages(messagesWithoutLoading);
        setMessages(normalizedWithoutLoading);
        throw sendError; // Re-throw to be caught by outer catch
      }

      // Replace loading message with actual response
      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: responseText,
        createdAt: new Date().toISOString(),
      };

      // Build final messages: messagesWithoutLoading (includes user) + assistant response
      // messagesWithoutLoading already has the user message, so just add assistant
      const finalMessages = [...messagesWithoutLoading, assistantMessage];
      const normalizedFinalMessages = normalizeMessages(finalMessages);

      setMessages(normalizedFinalMessages);
      await saveMessagesLocally(normalizedFinalMessages);
      setSending(false);
      setError(null);

      // Ensure input is cleared after successful send
      setInputText('');

      // Scroll to bottom
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (err) {
      // Check if this is a retryable streaming error
      const isRetryableError =
        err instanceof ApiClientError &&
        (err.code === 'STREAM_NOT_READY' ||
          err.code === 'EMPTY_STREAM' ||
          err.message.includes('not ready') ||
          err.message.includes('no response body'));

      // Auto-retry up to 4 times with increasing delays
      // The first retry happens quickly, subsequent ones wait longer
      if (isRetryableError && retryCount < 4) {
        const delays = [500, 1000, 1500, 2000]; // Progressive delays
        const delay = delays[retryCount] || 2000;
        // Only log retries in development, don't show errors to user
        if (__DEV__) {
          console.log(
            `Auto-retrying chat message (attempt ${retryCount + 1}/4) after ${delay}ms...`
          );
        }
        // Don't show error during retries - keep the loading state
        setTimeout(() => {
          handleSend(retryCount + 1);
        }, delay);
        return; // Don't set error or stop sending yet
      }

      // Only log error if we're not retrying
      console.error('Error sending message:', err);

      // 402 = chat limit reached → show paywall
      if (err instanceof ApiClientError && err.statusCode === 402) {
        const messagesWithoutLoading = messages.filter(
          (m) => !m.id.startsWith('assistant-loading-')
        );
        setMessages(normalizeMessages(messagesWithoutLoading));
        setSending(false);
        onPaywall?.('chat_limit_reached');
        return;
      }

      // If retries exhausted or non-retryable error, show error
      // Remove any loading messages
      const messagesWithoutLoading = messages.filter((m) => !m.id.startsWith('assistant-loading-'));
      const normalizedWithoutLoading = normalizeMessages(messagesWithoutLoading);
      setMessages(normalizedWithoutLoading);

      // Handle API key missing error gracefully
      let errorMessage: string;
      if (err instanceof ApiClientError) {
        if (err.statusCode === 503 && err.message.includes('OPENAI_API_KEY')) {
          // API key missing - the backend already added the message to the chat
          // Just show a brief error and reload to show the assistant's message
          errorMessage = 'AI service unavailable. Please configure OPENAI_API_KEY.';
          // Reload chat to show the assistant's error message
          setTimeout(() => {
            loadChatData();
          }, 500);
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

    // Don't render messages with empty or corrupted content
    if (!item.content || !item.content.trim() || item.content.includes('[object Promise]')) {
      return null;
    }

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
          <Text style={styles.emptyStateTitle}>Record something to unlock your daily context.</Text>
          <Text style={styles.emptyStateText}>
            Once you have recordings with transcripts and debriefs, I'll be able to help you reflect
            on your day.
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

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Chat</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0ff" />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Chat</Text>
      </View>

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={loadChatData} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        ref={flatListRef}
        data={messages.filter(
          (m) => m.content && m.content.trim() && !m.content.includes('[object Promise]')
        )}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={
          messages.filter(
            (m) => m.content && m.content.trim() && !m.content.includes('[object Promise]')
          ).length === 0
            ? styles.emptyList
            : styles.messagesList
        }
        ListEmptyComponent={renderEmptyState}
        onContentSizeChange={() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }}
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
          onPress={handleSend}
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
    backgroundColor: '#000',
  },
  header: {
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#1a1a1a',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    padding: 16,
    backgroundColor: '#2a1a1a',
    margin: 16,
    borderRadius: 8,
  },
  errorText: {
    color: '#f88',
    fontSize: 14,
    marginBottom: 8,
  },
  retryButton: {
    backgroundColor: '#0ff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  retryButtonText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyList: {
    flexGrow: 1,
  },
  messagesList: {
    padding: 16,
    paddingBottom: 8,
  },
  messageContainer: {
    marginBottom: 12,
  },
  userMessageContainer: {
    alignItems: 'flex-end',
  },
  assistantMessageContainer: {
    alignItems: 'flex-start',
  },
  messageBubble: {
    maxWidth: '80%',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 18,
  },
  userBubble: {
    backgroundColor: '#0ff',
  },
  assistantBubble: {
    backgroundColor: '#2a2a2a',
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  userText: {
    color: '#000',
  },
  assistantText: {
    color: '#fff',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyStateText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    lineHeight: 20,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 16 : 16,
    backgroundColor: '#1a1a1a',
    borderTopWidth: 1,
    borderTopColor: '#333',
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    backgroundColor: '#2a2a2a',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 15,
    maxHeight: 100,
    marginRight: 12,
  },
  sendButton: {
    backgroundColor: '#0ff',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    minWidth: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '600',
  },
});
