/* global process, console */
/**
 * SettingsScreen
 *
 * Sections:
 *  - Account: email, sign out
 *  - Legal: Privacy Policy, Terms of Service, Support Email
 *  - Privacy & Data: Data & Consent, Delete Account
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  TextInput,
} from 'react-native';
import {
  signOut,
  deleteUser as deleteFirebaseUser,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription } from '../contexts/SubscriptionContext';
import { deleteAccountApi } from '@komuchi/shared';

const SUPPORT_EMAIL = process.env.EXPO_PUBLIC_SUPPORT_EMAIL || '';

interface SettingsScreenProps {
  onBack: () => void;
  onDataConsent: () => void;
  onPrivacyPolicy: () => void;
  onTermsOfService: () => void;
  onUpgrade?: () => void;
}

export default function SettingsScreen({
  onBack,
  onDataConsent,
  onPrivacyPolicy,
  onTermsOfService,
  onUpgrade,
}: SettingsScreenProps) {
  const { user } = useAuth();
  const { isPro, loading: subLoading } = useSubscription();
  const [signingOut, setSigningOut] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [reauthPassword, setReauthPassword] = useState('');
  const [showReauth, setShowReauth] = useState(false);

  // ─── Sign out ───
  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          setSigningOut(true);
          try {
            await signOut(auth);
          } catch (err) {
            console.error('Sign out error:', err);
            Alert.alert('Error', 'Failed to sign out. Please try again.');
            setSigningOut(false);
          }
        },
      },
    ]);
  };

  // ─── Delete account ───
  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') return;

    setDeletingAccount(true);
    try {
      // 1. Delete all user data on the backend
      await deleteAccountApi(user!.uid);

      // 2. Delete Firebase user
      try {
        await deleteFirebaseUser(auth.currentUser!);
      } catch (fbErr: any) {
        if (fbErr.code === 'auth/requires-recent-login') {
          setShowDeleteModal(false);
          setShowReauth(true);
          setDeletingAccount(false);
          return;
        }
        throw fbErr;
      }

      // User deleted — onAuthStateChanged will navigate to auth screens
    } catch (err: any) {
      console.error('Delete account error:', err);
      Alert.alert('Error', err.message || 'Failed to delete account. Please try again.');
    } finally {
      setDeletingAccount(false);
      setShowDeleteModal(false);
      setDeleteConfirmText('');
    }
  };

  const handleReauthAndDelete = async () => {
    if (!reauthPassword) {
      Alert.alert('Error', 'Please enter your password.');
      return;
    }

    setDeletingAccount(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser || !currentUser.email) throw new Error('No user');

      const credential = EmailAuthProvider.credential(currentUser.email, reauthPassword);
      await reauthenticateWithCredential(currentUser, credential);

      // Now delete backend data + Firebase user
      await deleteAccountApi(currentUser.uid);
      await deleteFirebaseUser(currentUser);
    } catch (err: any) {
      console.error('Reauth + delete error:', err);
      Alert.alert(
        'Error',
        err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential'
          ? 'Incorrect password. Please try again.'
          : err.message || 'Failed to delete account.'
      );
    } finally {
      setDeletingAccount(false);
      setShowReauth(false);
      setReauthPassword('');
    }
  };

  // ─── Delete confirmation modal (inline overlay) ───
  if (showDeleteModal) {
    return (
      <View style={styles.container}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Delete Account</Text>
            <Text style={styles.modalBody}>
              This will permanently delete your account, all recordings, transcripts, and debriefs.
              This action cannot be undone.
            </Text>
            <Text style={styles.modalBody}>
              Type <Text style={styles.bold}>DELETE</Text> to confirm:
            </Text>
            <TextInput
              style={styles.modalInput}
              value={deleteConfirmText}
              onChangeText={setDeleteConfirmText}
              placeholder="DELETE"
              placeholderTextColor="#555"
              autoCapitalize="characters"
              autoCorrect={false}
              textContentType="oneTimeCode"
              autoComplete="off"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => {
                  setShowDeleteModal(false);
                  setDeleteConfirmText('');
                }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalDeleteBtn,
                  deleteConfirmText !== 'DELETE' && styles.modalDeleteBtnDisabled,
                ]}
                onPress={handleDeleteAccount}
                disabled={deleteConfirmText !== 'DELETE' || deletingAccount}
              >
                {deletingAccount ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalDeleteText}>Delete Forever</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    );
  }

  // ─── Reauth modal ───
  if (showReauth) {
    return (
      <View style={styles.container}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Re-authenticate</Text>
            <Text style={styles.modalBody}>
              For security, please enter your password to confirm account deletion.
            </Text>
            <TextInput
              style={styles.modalInput}
              value={reauthPassword}
              onChangeText={setReauthPassword}
              placeholder="Password"
              placeholderTextColor="#555"
              secureTextEntry
              textContentType="oneTimeCode"
              autoComplete="off"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => {
                  setShowReauth(false);
                  setReauthPassword('');
                }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalDeleteBtn}
                onPress={handleReauthAndDelete}
                disabled={!reauthPassword || deletingAccount}
              >
                {deletingAccount ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalDeleteText}>Confirm & Delete</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    );
  }

  // ─── Main settings ───
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* ─── Twin Pro ─── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Twin Pro</Text>
          {subLoading ? (
            <View style={styles.row}>
              <ActivityIndicator size="small" color="#0ff" />
            </View>
          ) : isPro ? (
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Plan</Text>
              <Text style={[styles.rowValue, { color: '#0ff' }]}>Pro ✓</Text>
            </View>
          ) : (
            <TouchableOpacity style={styles.upgradeButton} onPress={onUpgrade}>
              <Text style={styles.upgradeButtonText}>Upgrade to Twin Pro</Text>
              <Text style={styles.upgradeButtonSub}>$4.99/mo · 7-day free trial</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ─── Account ─── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>

          <View style={styles.row}>
            <Text style={styles.rowLabel}>Email</Text>
            <Text style={styles.rowValue} numberOfLines={1}>
              {user?.email ?? '—'}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.signOutButton}
            onPress={handleSignOut}
            disabled={signingOut}
          >
            {signingOut ? (
              <ActivityIndicator color="#f44" />
            ) : (
              <Text style={styles.signOutText}>Sign Out</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* ─── Legal ─── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Legal</Text>

          <TouchableOpacity style={styles.row} onPress={onPrivacyPolicy}>
            <Text style={styles.rowLabel}>Privacy Policy</Text>
            <Text style={styles.rowChevron}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.row} onPress={onTermsOfService}>
            <Text style={styles.rowLabel}>Terms of Service</Text>
            <Text style={styles.rowChevron}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.row}
            onPress={() => {
              if (!SUPPORT_EMAIL) {
                Alert.alert('Not Available', 'Support email has not been configured.');
                return;
              }
              Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() =>
                Alert.alert('Error', 'Could not open email client.')
              );
            }}
          >
            <Text style={styles.rowLabel}>Contact Support</Text>
            <Text style={styles.rowValue} numberOfLines={1}>
              {SUPPORT_EMAIL || '—'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ─── Privacy & Data ─── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Privacy & Data</Text>

          <TouchableOpacity style={styles.row} onPress={onDataConsent}>
            <Text style={styles.rowLabel}>Data & Consent</Text>
            <Text style={styles.rowChevron}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.row, styles.dangerRow]}
            onPress={() => setShowDeleteModal(true)}
          >
            <Text style={styles.dangerRowLabel}>Delete Account</Text>
            <Text style={styles.rowChevron}>›</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Twin v1.0.0</Text>
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
  scroll: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  section: { marginBottom: 28 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  row: {
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 10,
    marginBottom: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowLabel: { color: '#fff', fontSize: 16 },
  rowValue: {
    color: '#888',
    fontSize: 15,
    flex: 1,
    textAlign: 'right',
    marginLeft: 16,
  },
  rowChevron: { color: '#555', fontSize: 20, marginLeft: 8 },
  dangerRow: { borderWidth: 1, borderColor: '#f44' },
  dangerRowLabel: { color: '#f44', fontSize: 16 },
  upgradeButton: {
    backgroundColor: '#0ff',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  upgradeButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
  upgradeButtonSub: {
    color: '#333',
    fontSize: 12,
    marginTop: 2,
  },
  signOutButton: {
    backgroundColor: '#1a1a1a',
    paddingVertical: 16,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  signOutText: { color: '#f44', fontSize: 17, fontWeight: '600' },
  footer: { alignItems: 'center', marginTop: 20 },
  footerText: { color: '#555', fontSize: 12 },
  // ── Modal styles ──
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 360,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
  },
  modalBody: {
    fontSize: 14,
    color: '#aaa',
    lineHeight: 20,
    marginBottom: 12,
  },
  bold: { fontWeight: '700', color: '#fff' },
  modalInput: {
    backgroundColor: '#2a2a2a',
    borderRadius: 10,
    padding: 14,
    color: '#fff',
    fontSize: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#444',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#333',
  },
  modalCancelText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  modalDeleteBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#c00',
  },
  modalDeleteBtnDisabled: { backgroundColor: '#555' },
  modalDeleteText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
