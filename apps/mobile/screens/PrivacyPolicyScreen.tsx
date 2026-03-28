/* global process */
/**
 * PrivacyPolicyScreen
 *
 * In-app Privacy Policy page.
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';

interface PrivacyPolicyScreenProps {
  onBack: () => void;
}

export default function PrivacyPolicyScreen({ onBack }: PrivacyPolicyScreenProps) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy Policy</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Privacy Policy (Twin)</Text>
        <Text style={styles.lastUpdated}>Last updated: March 14, 2026</Text>

        <Text style={styles.body}>
          This Privacy Policy explains how Twin ("Twin," "we," "us") collects, uses, and protects
          information when you use our mobile application and related services (the "Service").
        </Text>

        <Text style={styles.sectionTitle}>1. What Twin does</Text>
        <Text style={styles.body}>
          Twin lets you record audio you choose to record, upload it for processing, and receive
          transcripts, speaker labels, summaries, and conversation "debrief" insights. Twin may also
          allow you to chat with your day using your saved recordings and transcripts as context.
        </Text>

        <Text style={styles.sectionTitle}>2. Information we collect</Text>
        <Text style={styles.subsectionTitle}>A) Account information</Text>
        <Text style={styles.body}>
          If you create an account, we collect:{'\n'}• Email address{'\n'}• A unique user identifier
          from our authentication provider
        </Text>

        <Text style={styles.subsectionTitle}>B) Audio and derived content</Text>
        <Text style={styles.body}>
          When you choose to record:{'\n'}• Audio recordings you upload{'\n'}• Transcripts generated
          from your audio{'\n'}• Speaker segmentation/labels (for example, "Speaker 1", "Speaker 2")
          {'\n'}• Debriefs, summaries, and other generated outputs{'\n'}• Metadata such as recording
          timestamps, duration, and processing status
        </Text>

        <Text style={styles.subsectionTitle}>C) Consent and preferences</Text>
        <Text style={styles.body}>
          We store:{'\n'}• Whether you accepted consent to process recordings{'\n'}• Whether you
          revoked consent{'\n'}• Your app preferences (for example, retention settings if enabled)
        </Text>

        <Text style={styles.subsectionTitle}>D) Diagnostics (optional but typical)</Text>
        <Text style={styles.body}>
          We may collect basic diagnostic information such as:{'\n'}• App crashes and performance
          logs{'\n'}• Device type and OS version{'\n'}
          {'\n'}This helps us improve reliability.
        </Text>

        <Text style={styles.sectionTitle}>3. How we use your information</Text>
        <Text style={styles.body}>
          We use your information to:{'\n'}• Provide the Service (upload, process, and display
          transcripts/debriefs){'\n'}• Maintain your recording history and day timeline{'\n'}•
          Respond to support requests{'\n'}• Improve performance, reliability, and user experience
          {'\n'}• Prevent abuse and secure the Service
        </Text>

        <Text style={styles.sectionTitle}>4. Recording consent and your responsibilities</Text>
        <Text style={styles.body}>
          Twin only records when you explicitly start and stop recording. You are responsible for
          using Twin lawfully. Only record conversations when you have permission and where allowed
          by law.
        </Text>
        <Text style={styles.body}>
          You can withdraw consent in the app settings. If consent is withdrawn, Twin will stop
          processing new recordings until consent is re-enabled.
        </Text>

        <Text style={styles.sectionTitle}>5. How we share information</Text>
        <Text style={styles.body}>We do not sell your personal information.</Text>
        <Text style={styles.body}>
          We share data only with service providers needed to operate Twin, such as:{'\n'}•{' '}
          <Text style={styles.bold}>Google Firebase</Text> — authentication and user identity{'\n'}•{' '}
          <Text style={styles.bold}>Deepgram</Text> — audio transcription (speech-to-text){'\n'}•{' '}
          <Text style={styles.bold}>OpenAI</Text> — transcription fallback (Whisper) and
          debrief/chat generation (GPT-4){'\n'}• Cloud and infrastructure providers (hosting,
          storage, databases)
        </Text>
        <Text style={styles.body}>
          These providers process data on our behalf under contractual obligations and are
          prohibited from using your data for any other purpose, including training their own
          models.
        </Text>

        <Text style={styles.sectionTitle}>6. Data retention</Text>
        <Text style={styles.body}>
          We retain your recordings and derived content until:{'\n'}• You delete a recording in the
          app, or{'\n'}• You delete your account, or{'\n'}• We delete data based on retention
          settings (if you enable auto-delete)
        </Text>
        <Text style={styles.body}>
          You can delete individual recordings and their derived data within the app. You can also
          delete your account from within the app, which deletes associated data.
        </Text>

        <Text style={styles.sectionTitle}>7. Security</Text>
        <Text style={styles.body}>
          We take reasonable steps to protect your information, including access controls and secure
          transmission. However, no method of transmission or storage is 100 percent secure.
        </Text>

        <Text style={styles.sectionTitle}>8. Your choices and rights</Text>
        <Text style={styles.body}>
          You can:{'\n'}• View and delete recordings{'\n'}• Withdraw consent for processing{'\n'}•
          Delete your account in-app{'\n'}• Contact us to request help accessing or deleting your
          data
        </Text>
        <Text style={styles.body}>
          To request support, email:{' '}
          {process.env.EXPO_PUBLIC_SUPPORT_EMAIL || '[support@yourdomain.com]'}
        </Text>

        <Text style={styles.sectionTitle}>9. Children</Text>
        <Text style={styles.body}>
          Twin is not intended for children under 13. If you believe a child has provided personal
          information, contact us and we will delete it.
        </Text>

        <Text style={styles.sectionTitle}>10. Changes to this policy</Text>
        <Text style={styles.body}>
          We may update this policy from time to time. If changes are material, we will update the
          "Last updated" date.
        </Text>

        <Text style={styles.sectionTitle}>11. Contact</Text>
        <Text style={styles.body}>
          Questions? Contact: {process.env.EXPO_PUBLIC_SUPPORT_EMAIL || '[support@yourdomain.com]'}.
        </Text>
      </ScrollView>
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
  scroll: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  lastUpdated: {
    fontSize: 14,
    color: '#888',
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
    marginTop: 24,
    marginBottom: 12,
  },
  body: {
    fontSize: 16,
    color: '#ccc',
    lineHeight: 24,
    marginBottom: 16,
  },
  subsectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
    marginTop: 12,
    marginBottom: 8,
  },
  bold: {
    fontWeight: '700',
    color: '#fff',
  },
});
