/**
 * Firebase Configuration
 *
 * Initializes the Firebase app and Auth with React Native persistence.
 * Reads config from EXPO_PUBLIC_* environment variables.
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import * as FirebaseAuth from 'firebase/auth';
import type { Persistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getExpoPublicEnv } from './expoPublicEnv';

const firebaseConfig = {
  apiKey: getExpoPublicEnv('EXPO_PUBLIC_FIREBASE_API_KEY'),
  authDomain: getExpoPublicEnv('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN'),
  projectId: getExpoPublicEnv('EXPO_PUBLIC_FIREBASE_PROJECT_ID'),
  appId: getExpoPublicEnv('EXPO_PUBLIC_FIREBASE_APP_ID'),
};

const missingFirebaseKeys = Object.entries(firebaseConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

console.log('[Firebase] Config loaded:', {
  projectId: firebaseConfig.projectId || '(empty)',
  hasApiKey: !!firebaseConfig.apiKey,
  missingKeys: missingFirebaseKeys,
});

if (missingFirebaseKeys.length > 0) {
  console.warn(
    `[Firebase] Missing config keys: ${missingFirebaseKeys.join(', ')}. ` +
      'Auth tokens may be unavailable, which will cause API authentication failures.'
  );
}

const resolvedFirebaseConfig =
  missingFirebaseKeys.length === 0
    ? firebaseConfig
    : {
        // Keep the app bootable even if config injection breaks in a build.
        apiKey: firebaseConfig.apiKey || 'missing-api-key',
        authDomain: firebaseConfig.authDomain || 'invalid.firebaseapp.com',
        projectId: firebaseConfig.projectId || 'missing-project-id',
        appId: firebaseConfig.appId || '1:0:web:missing-app-id',
      };

// Initialize Firebase app (only once)
const app = getApps().length === 0 ? initializeApp(resolvedFirebaseConfig) : getApp();

// Initialize Auth with React Native persistence via AsyncStorage
const getReactNativePersistence = (
  FirebaseAuth as typeof FirebaseAuth & {
    getReactNativePersistence: (storage: typeof AsyncStorage) => Persistence;
  }
).getReactNativePersistence;

// Fast Refresh can re-run this module after auth has already been initialized.
// Reuse the existing instance instead of throwing.
export const auth = (() => {
  try {
    return FirebaseAuth.initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch (error) {
    const code = (error as { code?: string } | undefined)?.code;
    if (code === 'auth/already-initialized') {
      return FirebaseAuth.getAuth(app);
    }
    throw error;
  }
})();

export default app;
