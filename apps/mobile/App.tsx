/* global setTimeout */
import React, { useState, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import TwinLogo from './components/TwinLogo';

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

import TabBar, { type Tab } from './components/TabBar';
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
  const [currentTab, setCurrentTab] = useState<Tab>('Today');
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

  const handleTabChange = (tab: Tab) => {
    setCurrentTab(tab);
    if (tab === 'Today') {
      setCurrentScreen('Recordings');
      setScreenParams(undefined);
    } else if (tab === 'Chat') {
      setCurrentScreen('Chat');
      setScreenParams(undefined);
    }
  };

  const handleRecordingComplete = (recordingId: string) => {
    navigate('RecordingDetail', { recordingId });
    if (recordingsRefreshRef.current) {
      setTimeout(() => {
        recordingsRefreshRef.current?.();
      }, 1000);
    }
  };

  const showTabBar = currentScreen === 'Recordings' || currentScreen === 'Chat';
  const showRecordingPill = currentScreen !== 'NewRecording';

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
        return <ChatScreen onPaywall={(reason) => showPaywall(reason)} />;
      case 'RecordingDetail':
        if (screenParams && 'recordingId' in screenParams) {
          return (
            <RecordingDetailScreen
              recordingId={screenParams.recordingId}
              onBack={() => {
                navigate('Recordings');
                setCurrentTab('Today');
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
              setCurrentTab('Today');
            }}
            onPaywall={(reason) => showPaywall(reason)}
          />
        );
      case 'VoiceProfile':
        return (
          <VoiceProfileScreen
            onBack={() => {
              navigate('Recordings');
              setCurrentTab('Today');
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
              setCurrentTab('Today');
            }}
          />
        );
      case 'Settings':
        return (
          <SettingsScreen
            onBack={() => {
              navigate('Recordings');
              setCurrentTab('Today');
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
      {showTabBar && <TabBar activeTab={currentTab} onTabChange={handleTabChange} />}
    </>
  );
}

// ─── Splash ──────────────────────────────────────────────────

function SplashScreen() {
  return (
    <View style={styles.splash}>
      <TwinLogo size={140} />
      <ActivityIndicator size="large" color="#0ff" style={{ marginTop: 24 }} />
    </View>
  );
}

// ─── Root ────────────────────────────────────────────────────

function RootNavigator() {
  const { user, loading: authLoading } = useAuth();

  if (authLoading) return <SplashScreen />;
  if (!user) return <AuthStack />;

  // User is signed in — wrap in ConsentProvider and show ConsentGate
  return (
    <SubscriptionProvider>
      <ConsentProvider>
        <ConsentGate />
      </ConsentProvider>
    </SubscriptionProvider>
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

  if (consentLoading) return <SplashScreen />;
  if (!hasConsent) {
    // If showing legal pages from consent screen, render them
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
    backgroundColor: '#000',
  },
  content: {
    flex: 1,
  },
  splash: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
});
