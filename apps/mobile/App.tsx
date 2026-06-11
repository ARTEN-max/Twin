import React, { useState, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import AnimatedSplash from './components/AnimatedSplash';

// Auth
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ConsentProvider, useConsent } from './contexts/ConsentContext';
import { SubscriptionProvider } from './contexts/SubscriptionContext';
import { RecordingProvider } from './contexts/RecordingContext';

// Auth screens
import SignInScreen from './screens/SignInScreen';
import SignUpScreen from './screens/SignUpScreen';
import ForgotPasswordScreen from './screens/ForgotPasswordScreen';

// App screens
import RecordingsScreen from './screens/RecordingsScreen';
import RecordingDetailScreen from './screens/RecordingDetailScreen';
import NewRecordingScreen from './screens/NewRecordingScreen';
import ChatScreen from './screens/ChatScreen';
import VoiceProfileScreen from './screens/VoiceProfileScreen';
import SettingsScreen from './screens/SettingsScreen';
import DataConsentScreen from './screens/DataConsentScreen';
import ConsentScreen from './screens/ConsentScreen';
import PrivacyPolicyScreen from './screens/PrivacyPolicyScreen';
import TermsOfServiceScreen from './screens/TermsOfServiceScreen';
import PaywallScreen from './screens/PaywallScreen';

import RecordingPill from './components/RecordingPill';
import type { RootStackParamList, AuthStackParamList } from './navigation/types';

// ─── Auth Stack ──────────────────────────────────────────────

type AuthScreen = keyof AuthStackParamList;

function AuthStack() {
  const [screen, setScreen] = useState<AuthScreen>('SignIn');

  switch (screen) {
    case 'SignIn':
      return (
        <SignInScreen
          onGoToSignUp={() => setScreen('SignUp')}
          onGoToForgotPassword={() => setScreen('ForgotPassword')}
        />
      );
    case 'SignUp':
      return <SignUpScreen onGoToSignIn={() => setScreen('SignIn')} />;
    case 'ForgotPassword':
      return <ForgotPasswordScreen onGoToSignIn={() => setScreen('SignIn')} />;
    default:
      return (
        <SignInScreen
          onGoToSignUp={() => setScreen('SignUp')}
          onGoToForgotPassword={() => setScreen('ForgotPassword')}
        />
      );
  }
}

// ─── App Stack ───────────────────────────────────────────────

type Screen = keyof RootStackParamList;
type ScreenParams = RootStackParamList[Screen];

function AppStack() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('Recordings');
  const [paywallReason, setPaywallReason] = useState<string | undefined>();
  const [screenParams, setScreenParams] = useState<ScreenParams>(undefined);
  const recordingsRefreshRef = useRef<(() => void) | null>(null);

  const navigate = (screen: Screen, params?: ScreenParams) => {
    setCurrentScreen(screen);
    setScreenParams(params);
  };

  const showPaywall = (reason?: string) => {
    setPaywallReason(reason);
    navigate('Paywall');
  };

  const handleRecordingComplete = (recordingId: string) => {
    navigate('RecordingDetail', { recordingId });
    if (recordingsRefreshRef.current) {
      setTimeout(() => {
        recordingsRefreshRef.current?.();
      }, 1000);
    }
  };

  const showRecordingPill = currentScreen !== 'NewRecording';
  const showChatFab = currentScreen === 'Recordings';

  const renderScreen = () => {
    switch (currentScreen) {
      case 'Recordings':
        return (
          <RecordingsScreen
            onSelectRecording={(recordingId) => navigate('RecordingDetail', { recordingId })}
            onNewRecording={() => navigate('NewRecording')}
            onVoiceProfile={() => navigate('VoiceProfile')}
            onSettings={() => navigate('Settings')}
            onMount={(refreshFn) => {
              recordingsRefreshRef.current = refreshFn;
            }}
          />
        );
      case 'Chat':
        return (
          <ChatScreen
            onBack={() => navigate('Recordings')}
            onPaywall={(reason) => showPaywall(reason)}
          />
        );
      case 'RecordingDetail':
        if (screenParams && 'recordingId' in screenParams) {
          return (
            <RecordingDetailScreen
              recordingId={screenParams.recordingId}
              onBack={() => {
                navigate('Recordings');
              }}
              onDeleted={() => {
                // Refresh recordings list after deletion
                if (recordingsRefreshRef.current) {
                  setTimeout(() => recordingsRefreshRef.current?.(), 300);
                }
              }}
            />
          );
        }
        return null;
      case 'NewRecording':
        return (
          <NewRecordingScreen
            onComplete={handleRecordingComplete}
            onCancel={() => {
              navigate('Recordings');
            }}
            onPaywall={(reason) => showPaywall(reason)}
          />
        );
      case 'VoiceProfile':
        return (
          <VoiceProfileScreen
            onBack={() => {
              navigate('Recordings');
            }}
            onPaywall={() => showPaywall('voice_reenroll')}
          />
        );
      case 'Paywall':
        return (
          <PaywallScreen
            reason={paywallReason}
            onClose={() => {
              navigate('Recordings');
            }}
          />
        );
      case 'Settings':
        return (
          <SettingsScreen
            onBack={() => {
              navigate('Recordings');
            }}
            onDataConsent={() => navigate('DataConsent')}
            onPrivacyPolicy={() => navigate('PrivacyPolicy')}
            onTermsOfService={() => navigate('TermsOfService')}
            onUpgrade={() => showPaywall()}
          />
        );
      case 'DataConsent':
        return (
          <DataConsentScreen
            onBack={() => navigate('Settings')}
            onPrivacyPolicy={() => navigate('PrivacyPolicy')}
            onTermsOfService={() => navigate('TermsOfService')}
          />
        );
      case 'PrivacyPolicy':
        return (
          <PrivacyPolicyScreen
            onBack={() => {
              // Simple: always go back to Settings (most common entry point)
              navigate('Settings');
            }}
          />
        );
      case 'TermsOfService':
        return (
          <TermsOfServiceScreen
            onBack={() => {
              // Simple: always go back to Settings (most common entry point)
              navigate('Settings');
            }}
          />
        );
      default:
        return (
          <RecordingsScreen
            onSelectRecording={(id) => navigate('RecordingDetail', { recordingId: id })}
            onNewRecording={() => navigate('NewRecording')}
            onVoiceProfile={() => navigate('VoiceProfile')}
            onSettings={() => navigate('Settings')}
            onMount={(refreshFn) => {
              recordingsRefreshRef.current = refreshFn;
            }}
          />
        );
    }
  };

  return (
    <>
      <View style={styles.content}>{renderScreen()}</View>
      {showRecordingPill && <RecordingPill onTap={() => navigate('NewRecording')} />}
      {showChatFab && (
        <TouchableOpacity
          style={styles.chatFab}
          onPress={() => navigate('Chat')}
          activeOpacity={0.85}
          accessibilityLabel="Open Chat"
        >
          <View style={styles.chatFabBubble} />
          <View style={styles.chatFabTail} />
        </TouchableOpacity>
      )}
    </>
  );
}

// ─── Root ────────────────────────────────────────────────────

function RootNavigator() {
  const { user, loading: authLoading } = useAuth();

  return (
    <View style={styles.root}>
      <View style={styles.content}>
        {!authLoading && !user && <AuthStack />}
        {!authLoading && user && (
          <SubscriptionProvider>
            <ConsentProvider>
              <ConsentGate />
            </ConsentProvider>
          </SubscriptionProvider>
        )}
      </View>
      <AnimatedSplash active={authLoading} />
    </View>
  );
}

/**
 * ConsentGate
 * Shows a loading indicator while fetching consent, then either
 * the ConsentScreen or the full AppStack.
 */
function ConsentGate() {
  const { loading: consentLoading, hasConsent } = useConsent();
  const [showPrivacyPolicy, setShowPrivacyPolicy] = React.useState(false);
  const [showTermsOfService, setShowTermsOfService] = React.useState(false);

  const renderContent = () => {
    if (consentLoading) return null;

    if (!hasConsent) {
      if (showPrivacyPolicy) {
        return <PrivacyPolicyScreen onBack={() => setShowPrivacyPolicy(false)} />;
      }
      if (showTermsOfService) {
        return <TermsOfServiceScreen onBack={() => setShowTermsOfService(false)} />;
      }
      return (
        <ConsentScreen
          onPrivacyPolicy={() => setShowPrivacyPolicy(true)}
          onTermsOfService={() => setShowTermsOfService(true)}
        />
      );
    }

    return (
      <RecordingProvider>
        <AppStack />
      </RecordingProvider>
    );
  };

  return (
    <View style={styles.root}>
      <View style={styles.content}>{renderContent()}</View>
      <AnimatedSplash active={consentLoading} />
    </View>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <View style={styles.container}>
        <StatusBar style="light" />
        <RootNavigator />
      </View>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0908',
  },
  root: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  chatFab: {
    position: 'absolute',
    bottom: 32,
    right: 20,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#C9A84C',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#C9A84C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 8,
  },
  chatFabBubble: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    bottom: 16,
    borderRadius: 8,
    backgroundColor: '#0a0908',
    opacity: 0.85,
  },
  chatFabTail: {
    position: 'absolute',
    bottom: 10,
    left: 14,
    width: 0,
    height: 0,
    borderStyle: 'solid',
    borderLeftWidth: 7,
    borderTopWidth: 7,
    borderLeftColor: 'transparent',
    borderTopColor: '#0a0908',
    opacity: 0.85,
  },
});
