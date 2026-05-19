import Constants from 'expo-constants';

export function getExpoPublicEnv(key: string, fallback = ''): string {
  const processValue = typeof process !== 'undefined' ? process.env?.[key] : undefined;
  if (processValue) return processValue;

  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  const extraValue = extra?.[key];
  return typeof extraValue === 'string' ? extraValue : fallback;
}
