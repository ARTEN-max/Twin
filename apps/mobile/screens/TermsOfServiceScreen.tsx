/* global process */
/**
 * TermsOfServiceScreen
 *
 * Loads the live terms of service URL in a WebView so updates
 * are always reflected without a new app release.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { WebView } from 'react-native-webview';

const TERMS_URL =
  process.env.EXPO_PUBLIC_TERMS_URL ||
  'https://twin-a-i.github.io/Twin/apps/mobile/legal/terms-of-service.html';

interface TermsOfServiceScreenProps {
  onBack: () => void;
}

export default function TermsOfServiceScreen({ onBack }: TermsOfServiceScreenProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Terms of Service</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading && !error && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#0ff" />
        </View>
      )}

      {error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Could not load Terms of Service.</Text>
          <Text style={styles.errorSub}>Check your connection and try again.</Text>
        </View>
      ) : (
        <WebView
          source={{ uri: TERMS_URL }}
          style={styles.webview}
          onLoadEnd={() => setLoading(false)}
          onError={() => {
            setLoading(false);
            setError(true);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#1a1a1a',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    color: '#0ff',
    fontSize: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerSpacer: {
    width: 60,
  },
  webview: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    top: 100,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
    zIndex: 1,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  errorSub: {
    color: '#888',
    fontSize: 14,
  },
});
