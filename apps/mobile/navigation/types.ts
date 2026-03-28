/**
 * Navigation Types
 *
 * Type-safe navigation routes for the mobile app.
 */

// Auth stack (shown when not signed in)
export type AuthStackParamList = {
  SignIn: undefined;
  SignUp: undefined;
  ForgotPassword: undefined;
};

// App stack (shown when signed in)
export type RootStackParamList = {
  Recordings: undefined;
  RecordingDetail: { recordingId: string };
  NewRecording: undefined;
  Chat: undefined;
  VoiceProfile: undefined;
  Settings: undefined;
  DataConsent: undefined;
  Consent: undefined;
  PrivacyPolicy: undefined;
  TermsOfService: undefined;
};
