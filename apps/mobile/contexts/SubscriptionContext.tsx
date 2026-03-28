/* global process, console, __DEV__ */
/**
 * SubscriptionContext
 *
 * Wraps RevenueCat to expose the user's subscription tier and purchase flow.
 * - Configured on mount with the RevenueCat API key
 * - User is identified by their Firebase UID so purchases sync server-side
 * - Exposes: isPro, tier, offerings, purchase(), restore()
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import type { PurchasesOfferings, PurchasesPackage } from 'react-native-purchases';
import { useAuth } from './AuthContext';

const RC_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY ?? '';

interface SubscriptionContextValue {
  loading: boolean;
  isPro: boolean;
  offerings: PurchasesOfferings | null;
  purchase: (pkg: PurchasesPackage) => Promise<boolean>;
  restore: () => Promise<boolean>;
  refresh: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextValue>({
  loading: true,
  isPro: false,
  offerings: null,
  purchase: async () => false,
  restore: async () => false,
  refresh: async () => {},
});

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [isPro, setIsPro] = useState(false);
  const [offerings, setOfferings] = useState<PurchasesOfferings | null>(null);

  const checkEntitlement = useCallback(async () => {
    try {
      const info = await Purchases.getCustomerInfo();
      const active = info.entitlements.active['pro'];
      setIsPro(!!active);
    } catch (err) {
      console.warn('RevenueCat entitlement check failed:', err);
    }
  }, []);

  const loadOfferings = useCallback(async () => {
    try {
      const o = await Purchases.getOfferings();
      setOfferings(o);
    } catch (err) {
      console.warn('RevenueCat offerings fetch failed:', err);
    }
  }, []);

  const refresh = useCallback(async () => {
    await Promise.all([checkEntitlement(), loadOfferings()]);
  }, [checkEntitlement, loadOfferings]);

  // Configure RevenueCat once on mount
  useEffect(() => {
    if (!RC_API_KEY) {
      setLoading(false);
      return;
    }
    if (__DEV__) {
      Purchases.setLogLevel(LOG_LEVEL.DEBUG);
    }
    Purchases.configure({ apiKey: RC_API_KEY });
  }, []);

  // Identify user and load entitlements when auth resolves
  useEffect(() => {
    if (!RC_API_KEY) return;

    const init = async () => {
      setLoading(true);
      try {
        if (user?.uid) {
          await Purchases.logIn(user.uid);
        }
        await Promise.all([checkEntitlement(), loadOfferings()]);
      } catch (err) {
        console.warn('RevenueCat init failed:', err);
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [user?.uid, checkEntitlement, loadOfferings]);

  const purchase = useCallback(async (pkg: PurchasesPackage): Promise<boolean> => {
    try {
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      const active = customerInfo.entitlements.active['pro'];
      setIsPro(!!active);
      return !!active;
    } catch (err: unknown) {
      const rcErr = err as { userCancelled?: boolean };
      if (rcErr.userCancelled) return false;
      console.warn('Purchase failed:', err);
      return false;
    }
  }, []);

  const restore = useCallback(async (): Promise<boolean> => {
    try {
      const info = await Purchases.restorePurchases();
      const active = info.entitlements.active['pro'];
      setIsPro(!!active);
      return !!active;
    } catch (err) {
      console.warn('Restore failed:', err);
      return false;
    }
  }, []);

  return (
    <SubscriptionContext.Provider value={{ loading, isPro, offerings, purchase, restore, refresh }}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription(): SubscriptionContextValue {
  return useContext(SubscriptionContext);
}
