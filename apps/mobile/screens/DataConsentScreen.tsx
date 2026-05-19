/**
 * DataConsentScreen
 *
 * Accessible from Settings → Data & Consent.
 * Shows current consent status and allows the user to withdraw or re-enable.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { useConsent } from '../contexts/ConsentContext';

interface DataConsentScreenProps {
  onBack: () => void;
  onPrivacyPolicy?: () => void;
  onTermsOfService?: () => void;
}

export default function DataConsentScreen({
  onBack,
  onPrivacyPolicy,
  onTermsOfService,
}: DataConsentScreenProps) {
  const { hasConsent, consentAcceptedAt, consentRevokedAt, accept, revoke } = useConsent();

  const [loading, setLoading] = useState(false);

  // Re-accept checkboxes (only shown when consent is revoked)
  const [check1, setCheck1] = useState(false);
  const [check2, setCheck2] = useState(false);
  const [check3, setCheck3] = useState(false);
  const allChecked = check1 && check2 && check3;

  const formatDate = (iso: string | null) => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  const handleWithdraw = () => {
    Alert.alert(
      'Withdraw Consent',
      'If you withdraw consent you will not be able to create new recordings or upload audio until you re-enable it.\n\nYour existing data will remain.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Withdraw',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              await revoke();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to revoke consent.');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleReEnable = async () => {
    if (!allChecked) return;
    setLoading(true);
    try {
      await accept();
      setCheck1(false);
      setCheck2(false);
      setCheck3(false);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to accept consent.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Data & Consent</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Status */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Current Status</Text>

          <View style={styles.statusRow}>
            <View
              style={[styles.statusBadge, hasConsent ? styles.statusActive : styles.statusRevoked]}
            >
              <Text style={styles.statusText}>{hasConsent ? 'Active' : 'Revoked'}</Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Accepted</Text>
            <Text style={styles.infoValue}>{formatDate(consentAcceptedAt)}</Text>
          </View>

          {consentRevokedAt && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Revoked</Text>
              <Text style={styles.infoValue}>{formatDate(consentRevokedAt)}</Text>
            </View>
          )}
        </View>

        {/* Active consent — allow withdrawal */}
        {hasConsent && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Withdraw Consent</Text>
            <Text style={styles.explainer}>
              If you withdraw consent, Twin will stop accepting new recordings and audio uploads.
              You can re-enable consent at any time.
            </Text>
            <TouchableOpacity
              style={styles.dangerButton}
              onPress={handleWithdraw}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#f44" />
              ) : (
                <Text style={styles.dangerButtonText}>Withdraw Consent</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Revoked — allow re-accept */}
        {!hasConsent && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Re-enable Consent</Text>
            <Text style={styles.explainer}>
              Processing requires consent. Check all boxes below to re-enable recording and uploads.
            </Text>

            <TouchableOpacity
              style={styles.checkRow}
              onPress={() => setCheck1(!check1)}
              activeOpacity={0.7}
            >
              <View style={[styles.checkbox, check1 && styles.checkboxChecked]}>
                {check1 && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.checkLabel}>
                I have permission to record participants where required.
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.checkRow}
              onPress={() => setCheck2(!check2)}
              activeOpacity={0.7}
            >
              <View style={[styles.checkbox, check2 && styles.checkboxChecked]}>
                {check2 && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.checkLabel}>
                I understand my audio may be uploaded and processed to generate transcripts and
                insights.
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.checkRow}
              onPress={() => setCheck3(!check3)}
              activeOpacity={0.7}
            >
              <View style={[styles.checkbox, check3 && styles.checkboxChecked]}>
                {check3 && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.checkLabel}>
                I understand third-party processors may handle this data as described in the Privacy
                Policy.
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.cta, !allChecked && styles.ctaDisabled]}
              onPress={handleReEnable}
              disabled={!allChecked || loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={[styles.ctaText, !allChecked && styles.ctaTextDisabled]}>
                  Re-enable Consent
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Legal links */}
        <View style={styles.linkRow}>
          <TouchableOpacity onPress={onPrivacyPolicy || (() => {})}>
            <Text style={styles.linkText}>Privacy Policy</Text>
          </TouchableOpacity>
          <Text style={styles.linkSeparator}>·</Text>
          <TouchableOpacity onPress={onTermsOfService || (() => {})}>
            <Text style={styles.linkText}>Terms of Service</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
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
  backButton: { padding: 8 },
  backButtonText: { color: '#0ff', fontSize: 16 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  headerSpacer: { width: 60 },
  content: { padding: 20 },
  section: { marginBottom: 28 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  statusRow: { marginBottom: 12 },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusActive: { backgroundColor: '#0f0' },
  statusRevoked: { backgroundColor: '#f44' },
  statusText: { fontSize: 13, fontWeight: '700', color: '#000' },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 10,
    marginBottom: 2,
  },
  infoLabel: { color: '#fff', fontSize: 15 },
  infoValue: { color: '#888', fontSize: 14 },
  explainer: { color: '#aaa', fontSize: 14, lineHeight: 20, marginBottom: 16 },
  dangerButton: {
    backgroundColor: '#1a1a1a',
    paddingVertical: 16,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f44',
  },
  dangerButtonText: { color: '#f44', fontSize: 16, fontWeight: '600' },
  // Re-accept checkboxes (reuse ConsentScreen styles)
  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#555',
    marginRight: 14,
    marginTop: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: '#0ff', borderColor: '#0ff' },
  checkmark: { fontSize: 14, fontWeight: 'bold', color: '#000' },
  checkLabel: { flex: 1, fontSize: 15, color: '#ddd', lineHeight: 22 },
  cta: {
    backgroundColor: '#0ff',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  ctaDisabled: { backgroundColor: '#333' },
  ctaText: { fontSize: 17, fontWeight: '700', color: '#000' },
  ctaTextDisabled: { color: '#666' },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 40,
  },
  linkText: { fontSize: 14, color: '#0ff', textDecorationLine: 'underline' },
  linkSeparator: { fontSize: 14, color: '#555', marginHorizontal: 12 },
});
