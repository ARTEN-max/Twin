/**
 * PipeTest Screen
 *
 * End-to-end test of the recording upload flow:
 * 1. Record 5 seconds of audio
 * 2. Upload to presigned URL
 * 3. Complete upload
 * 4. Poll for completion
 * 5. Display transcript + debrief
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Button, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import {
  createRecording,
  uploadRecordingFile,
  completeUpload,
  getRecordingStatus,
  getRecordingResult,
  ApiClientError,
} from '@twin/shared';
import { useAuth } from '../contexts/AuthContext';
import { getExpoPublicEnv } from '../lib/expoPublicEnv';

type Status =
  | 'idle'
  | 'requesting-permission'
  | 'recording'
  | 'stopping'
  | 'creating-recording'
  | 'uploading'
  | 'completing-upload'
  | 'polling'
  | 'complete'
  | 'error';

export default function PipeTestScreen() {
  const { user } = useAuth();
  const MOCK_USER_ID = user?.uid ?? 'anonymous';
  const apiBaseUrl = getExpoPublicEnv('EXPO_PUBLIC_API_BASE_URL', 'http://172.20.10.10:3001');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [, setRecording] = useState<Audio.Recording | null>(null);
  const [, setRecordingUri] = useState<string | null>(null);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<any>(null);
  const [debrief, setDebrief] = useState<any>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');

  // Test API connectivity on mount
  useEffect(() => {
    const testConnection = async () => {
      try {
        console.log('Testing API connection to:', apiBaseUrl);
        const response = await fetch(`${apiBaseUrl}/api/health`);
        const data = await response.json();
        console.log('API health check:', data);
      } catch (err) {
        console.error('API health check failed:', err);
        setError(`Cannot reach API server. Check that API is running at ${apiBaseUrl}`);
      }
    };
    testConnection();
  }, [apiBaseUrl]);

  const reset = () => {
    setStatus('idle');
    setError(null);
    setRecording(null);
    setRecordingUri(null);
    setRecordingId(null);
    setTranscript(null);
    setDebrief(null);
    setStatusMessage('');
  };

  const requestPermission = async (): Promise<boolean> => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Microphone permission is required to record audio.');
        return false;
      }
      return true;
    } catch (err) {
      console.error('Error requesting permission:', err);
      setError('Failed to request microphone permission');
      return false;
    }
  };

  const startRecording = async () => {
    try {
      setStatus('requesting-permission');
      setStatusMessage('Requesting microphone permission...');

      const hasPermission = await requestPermission();
      if (!hasPermission) {
        setStatus('error');
        return;
      }

      setStatus('recording');
      setStatusMessage('Recording audio (5 seconds)...');

      // Configure audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      // Create and start recording
      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      setRecording(newRecording);

      // Stop after 5 seconds
      setTimeout(async () => {
        await stopRecording(newRecording);
      }, 5000);
    } catch (err) {
      console.error('Error starting recording:', err);
      setError(err instanceof Error ? err.message : 'Failed to start recording');
      setStatus('error');
    }
  };

  const stopRecording = async (rec: Audio.Recording) => {
    try {
      setStatus('stopping');
      setStatusMessage('Stopping recording...');

      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      if (!uri) {
        throw new Error('No recording URI returned');
      }

      setRecordingUri(uri);
      setRecording(null);

      // Continue with upload flow
      await uploadFlow(uri);
    } catch (err) {
      console.error('Error stopping recording:', err);
      setError(err instanceof Error ? err.message : 'Failed to stop recording');
      setStatus('error');
    }
  };

  const uploadFlow = async (fileUri: string) => {
    try {
      // Step 1: Create recording
      setStatus('creating-recording');
      setStatusMessage('Creating recording...');

      // Determine MIME type based on file extension
      // iOS typically records as .m4a or .caf
      const extension = fileUri.split('.').pop()?.toLowerCase();
      let mimeType = 'audio/m4a'; // Default for iOS
      if (extension === 'caf') {
        mimeType = 'audio/x-caf';
      } else if (extension === 'm4a') {
        mimeType = 'audio/m4a';
      }

      console.log('Calling createRecording with:', {
        userId: MOCK_USER_ID,
        title: 'PipeTest Recording',
        mode: 'general',
        mimeType,
      });
      console.log('API Base URL from env:', apiBaseUrl);

      let createResult;
      try {
        createResult = await createRecording(MOCK_USER_ID, {
          title: 'PipeTest Recording',
          mode: 'general',
          mimeType,
        });
        console.log('createRecording result:', createResult);
      } catch (createError) {
        console.error('createRecording failed:', createError);
        throw new Error(
          `Failed to create recording: ${createError instanceof Error ? createError.message : String(createError)}`
        );
      }

      setRecordingId(createResult.recordingId);
      setStatusMessage(`Recording created: ${createResult.recordingId}`);

      // Step 2: Read file and convert to bytes
      setStatus('uploading');
      setStatusMessage('Reading file and uploading...');

      const base64 = await FileSystem.readAsStringAsync(fileUri, {
        encoding: 'base64',
      });

      // Convert base64 to ArrayBuffer
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Step 3: Upload file
      // Use direct upload endpoint (API proxies to MinIO)
      // This works even if MinIO isn't accessible from the simulator
      setStatus('uploading');
      setStatusMessage('Uploading file via API...');

      try {
        console.log('Uploading via direct API endpoint');
        console.log('Upload details:', {
          recordingId: createResult.recordingId,
          fileSize: bytes.length,
          mimeType,
        });
        await uploadRecordingFile(MOCK_USER_ID, createResult.recordingId, bytes.buffer, mimeType);
        setStatusMessage('Upload complete, starting processing...');
        // Direct upload endpoint automatically calls completeUpload internally
        // So we can skip to polling
      } catch (directUploadError) {
        console.error('Direct upload failed:', directUploadError);
        console.error('Direct upload error details:', {
          message:
            directUploadError instanceof Error
              ? directUploadError.message
              : String(directUploadError),
          name: directUploadError instanceof Error ? directUploadError.name : 'Unknown',
        });
        console.log('Trying presigned URL fallback...');

        // Fallback to presigned URL (if MinIO is accessible from simulator)
        const headers: Record<string, string> = {};

        // Use requiredHeaders if provided, otherwise set Content-Type
        if (createResult.requiredHeaders) {
          Object.assign(headers, createResult.requiredHeaders);
        } else if (createResult.contentType) {
          headers['Content-Type'] = createResult.contentType;
        } else {
          headers['Content-Type'] = mimeType;
        }

        // DO NOT add Authorization header
        // DO NOT use multipart/form-data
        console.log('Uploading to presigned URL:', createResult.uploadUrl);
        console.log('Upload headers:', headers);
        console.log('Upload body size:', bytes.length, 'bytes');

        const uploadResponse = await fetch(createResult.uploadUrl, {
          method: 'PUT',
          body: bytes.buffer,
          headers,
        });

        if (!uploadResponse.ok) {
          const errorText = await uploadResponse.text();
          throw new Error(
            `Upload failed: ${uploadResponse.status} ${uploadResponse.statusText}\n${errorText}`
          );
        }

        setStatusMessage('Upload complete');

        // Step 4: Complete upload (only needed for presigned URL flow)
        setStatus('completing-upload');
        setStatusMessage('Completing upload...');

        await completeUpload(MOCK_USER_ID, createResult.recordingId, {
          fileSize: bytes.length,
        });

        setStatusMessage('Upload completed, starting processing...');
      }

      setStatusMessage('Upload completed, starting processing...');

      // Step 5: Poll for completion
      await pollForCompletion(createResult.recordingId);
    } catch (err) {
      console.error('Error in upload flow:', err);
      console.error('Error details:', {
        message: err instanceof Error ? err.message : String(err),
        name: err instanceof Error ? err.name : 'Unknown',
        stack: err instanceof Error ? err.stack : undefined,
      });
      if (err instanceof ApiClientError) {
        setError(`API Error: ${err.message} (${err.statusCode})`);
      } else {
        const errorMessage = err instanceof Error ? err.message : 'Upload flow failed';
        setError(
          `${errorMessage}${err instanceof TypeError && err.message.includes('Network') ? ' - Check API server and network connectivity' : ''}`
        );
      }
      setStatus('error');
    }
  };

  const pollForCompletion = async (id: string) => {
    setStatus('polling');
    setStatusMessage('Polling for completion...');

    let attempts = 0;
    const maxAttempts = 60; // 5 minutes max (60 * 5s)
    const baseDelay = 1000; // Start with 1 second

    while (attempts < maxAttempts) {
      try {
        const statusResult = await getRecordingStatus(MOCK_USER_ID, id);

        setStatusMessage(`Status: ${statusResult.status} (attempt ${attempts + 1}/${maxAttempts})`);

        if (statusResult.status === 'complete') {
          // Fetch full result with transcript and debrief
          const result = await getRecordingResult(MOCK_USER_ID, id);
          setTranscript(result.transcript);
          setDebrief(result.debrief);
          setStatus('complete');
          setStatusMessage('Processing complete!');
          return;
        }

        if (statusResult.status === 'failed') {
          throw new Error('Recording processing failed');
        }

        // Exponential backoff: 1s, 2s, 4s, 8s, ... max 30s
        const delay = Math.min(baseDelay * Math.pow(2, attempts), 30000);
        await new Promise((resolve) => setTimeout(resolve, delay));
        attempts++;
      } catch (err) {
        console.error('Error polling:', err);
        if (err instanceof ApiClientError && err.statusCode === 404) {
          // Recording not found, might need to wait a bit
          const delay = Math.min(baseDelay * Math.pow(2, attempts), 30000);
          await new Promise((resolve) => setTimeout(resolve, delay));
          attempts++;
          continue;
        }
        throw err;
      }
    }

    throw new Error('Polling timeout: recording did not complete in time');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>PipeTest Screen</Text>
      <Text style={styles.subtitle}>End-to-end upload flow test</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Status</Text>
        <Text style={styles.statusText}>{status}</Text>
        {statusMessage ? <Text style={styles.statusMessage}>{statusMessage}</Text> : null}
        {status === 'recording' || status === 'polling' ? (
          <ActivityIndicator size="small" style={styles.spinner} />
        ) : null}
      </View>

      {error ? (
        <View style={styles.section}>
          <Text style={styles.errorTitle}>Error</Text>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {recordingId ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recording ID</Text>
          <Text style={styles.monoText}>{recordingId}</Text>
        </View>
      ) : null}

      {transcript ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Transcript</Text>
          <Text style={styles.text}>{transcript.text || 'No transcript text available'}</Text>
          {transcript.segments && transcript.segments.length > 0 && (
            <View style={styles.segmentsContainer}>
              <Text style={styles.subtitleSection}>Segments:</Text>
              {transcript.segments.map((segment: any, index: number) => (
                <View key={index} style={styles.segment}>
                  <Text style={styles.segmentTime}>
                    [{segment.start}s - {segment.end}s] {segment.speaker || 'Unknown'}
                  </Text>
                  <Text style={styles.segmentText}>{segment.text}</Text>
                </View>
              ))}
            </View>
          )}
          {transcript.language && (
            <Text style={styles.metaText}>Language: {transcript.language}</Text>
          )}
        </View>
      ) : null}

      {debrief ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Debrief</Text>
          {debrief.markdown ? (
            <Text style={styles.text}>{debrief.markdown}</Text>
          ) : debrief.sections && debrief.sections.length > 0 ? (
            <View>
              {debrief.sections.map((section: any, index: number) => (
                <View key={index} style={styles.debriefSection}>
                  <Text style={styles.debriefSectionTitle}>{section.title}</Text>
                  <Text style={styles.text}>{section.content}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.text}>No debrief content available</Text>
          )}
        </View>
      ) : null}

      <View style={styles.buttonContainer}>
        <Button
          title="Record 5s + Process"
          onPress={startRecording}
          disabled={status !== 'idle' && status !== 'error' && status !== 'complete'}
        />
        {(status === 'error' || status === 'complete') && <View style={styles.buttonSpacer} />}
        {(status === 'error' || status === 'complete') && <Button title="Reset" onPress={reset} />}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  content: {
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
    marginBottom: 24,
  },
  text: {
    fontSize: 14,
    color: '#fff',
    lineHeight: 20,
    marginTop: 8,
  },
  metaText: {
    fontSize: 12,
    color: '#888',
    marginTop: 8,
    fontStyle: 'italic',
  },
  subtitleSection: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginTop: 16,
    marginBottom: 8,
  },
  segmentsContainer: {
    marginTop: 12,
  },
  segment: {
    marginBottom: 12,
    padding: 12,
    backgroundColor: '#2a2a2a',
    borderRadius: 6,
  },
  segmentTime: {
    fontSize: 11,
    color: '#888',
    marginBottom: 4,
    fontFamily: 'monospace',
  },
  segmentText: {
    fontSize: 14,
    color: '#fff',
    lineHeight: 20,
  },
  debriefSection: {
    marginTop: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  debriefSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0ff',
    marginBottom: 8,
  },
  section: {
    marginBottom: 24,
    padding: 16,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  statusText: {
    fontSize: 16,
    color: '#0f0',
    marginBottom: 4,
  },
  statusMessage: {
    fontSize: 14,
    color: '#aaa',
    marginTop: 4,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#f00',
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    color: '#f88',
  },
  monoText: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#ccc',
  },
  spinner: {
    marginTop: 8,
  },
  buttonContainer: {
    marginTop: 24,
  },
  buttonSpacer: {
    height: 12,
  },
});
