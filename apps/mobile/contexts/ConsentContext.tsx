/**
 * ConsentContext
 *
 * Fetches and caches the user's consent status from the backend.
 * Exposes helpers to accept / revoke consent and a boolean `hasConsent`.
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getMe,
  acceptConsent as acceptConsentApi,
  revokeConsent as revokeConsentApi,
  type MeResponse,
} from '@twin/shared';
import { useAuth } from './AuthContext';

const CONSENT_KEY = 'twin:consent';

interface ConsentContextValue {
  /** True while fetching /api/me */
  loading: boolean;
  /** True when consent has been accepted and not revoked */
  hasConsent: boolean;
  /** Raw consent timestamps */
  consentAcceptedAt: string | null;
  consentRevokedAt: string | null;
  /** Accept consent (calls backend) */
  accept: () => Promise<void>;
  /** Revoke consent (calls backend) */
  revoke: () => Promise<void>;
  /** Re-fetch consent status */
  refresh: () => Promise<void>;
}

const ConsentContext = createContext<ConsentContextValue>({
  loading: true,
  hasConsent: false,
  consentAcceptedAt: null,
  consentRevokedAt: null,
  accept: async () => {},
  revoke: async () => {},
  refresh: async () => {},
});

export function ConsentProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [consentAcceptedAt, setConsentAcceptedAt] = useState<string | null>(null);
  const [consentRevokedAt, setConsentRevokedAt] = useState<string | null>(null);

  const hasConsent = !!consentAcceptedAt && !consentRevokedAt;

  const fetchConsent = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const me: MeResponse = await getMe(user.uid);
      setConsentAcceptedAt(me.consentAcceptedAt);
      setConsentRevokedAt(me.consentRevokedAt);
      // Sync to local cache
      await AsyncStorage.setItem(
        CONSENT_KEY,
        JSON.stringify({ acceptedAt: me.consentAcceptedAt, revokedAt: me.consentRevokedAt })
      );
    } catch (err) {
      console.warn('Failed to fetch /api/me, reading local cache:', err);
      // Fall back to locally cached consent
      const cached = await AsyncStorage.getItem(CONSENT_KEY);
      if (cached) {
        const { acceptedAt, revokedAt } = JSON.parse(cached);
        setConsentAcceptedAt(acceptedAt);
        setConsentRevokedAt(revokedAt);
      } else {
        setConsentAcceptedAt(null);
        setConsentRevokedAt(null);
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchConsent();
  }, [fetchConsent]);

  const accept = useCallback(async () => {
    if (!user) return;
    const now = new Date().toISOString();
    try {
      const res = await acceptConsentApi(user.uid);
      setConsentAcceptedAt(res.consentAcceptedAt);
      setConsentRevokedAt(res.consentRevokedAt);
      await AsyncStorage.setItem(
        CONSENT_KEY,
        JSON.stringify({ acceptedAt: res.consentAcceptedAt, revokedAt: res.consentRevokedAt })
      );
    } catch (err) {
      console.warn('API unavailable, saving consent locally:', err);
      setConsentAcceptedAt(now);
      setConsentRevokedAt(null);
      await AsyncStorage.setItem(CONSENT_KEY, JSON.stringify({ acceptedAt: now, revokedAt: null }));
    }
  }, [user]);

  const revoke = useCallback(async () => {
    if (!user) return;
    const now = new Date().toISOString();
    try {
      const res = await revokeConsentApi(user.uid);
      setConsentAcceptedAt(res.consentAcceptedAt);
      setConsentRevokedAt(res.consentRevokedAt);
      await AsyncStorage.setItem(
        CONSENT_KEY,
        JSON.stringify({ acceptedAt: res.consentAcceptedAt, revokedAt: res.consentRevokedAt })
      );
    } catch (err) {
      console.warn('API unavailable, saving revocation locally:', err);
      setConsentRevokedAt(now);
      await AsyncStorage.setItem(
        CONSENT_KEY,
        JSON.stringify({ acceptedAt: consentAcceptedAt, revokedAt: now })
      );
    }
  }, [user, consentAcceptedAt]);

  return (
    <ConsentContext.Provider
      value={{
        loading,
        hasConsent,
        consentAcceptedAt,
        consentRevokedAt,
        accept,
        revoke,
        refresh: fetchConsent,
      }}
    >
      {children}
    </ConsentContext.Provider>
  );
}

export function useConsent(): ConsentContextValue {
  return useContext(ConsentContext);
}
