/**
 * AuthContext
 *
 * Provides Firebase authentication state to the entire app.
 * – Listens to onAuthStateChanged for real-time auth state
 * – Exposes { user, loading } via context
 * – Configures the shared API client with a token provider
 *   so that every API request includes Authorization: Bearer <idToken>
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { setTokenProvider } from '@twin/shared';

interface AuthContextValue {
  /** The currently signed-in Firebase user, or null */
  user: User | null;
  /** True while we're still determining the initial auth state */
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);

      // Configure the shared API client to attach the ID token
      if (firebaseUser) {
        setTokenProvider(async (forceRefresh = false) => {
          // Prefer the live `auth.currentUser` (always reflects the latest
          // Firebase state), but fall back to the user from the listener
          // closure in case `currentUser` is briefly null during rehydration
          // or right after Fast Refresh.
          const userRef = auth.currentUser ?? firebaseUser;
          if (!userRef) return null;
          try {
            return await userRef.getIdToken(forceRefresh);
          } catch (error) {
            console.error('[AuthContext] Failed to get Firebase ID token:', error);
            return null;
          }
        });
      } else {
        setTokenProvider(null);
      }
    });

    return unsubscribe;
  }, []);

  return <AuthContext.Provider value={{ user, loading }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
