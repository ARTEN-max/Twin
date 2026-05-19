const appJson = require('./app.json');

const baseExpoConfig = appJson.expo;

function envOrFallback(key, fallback = '') {
  return process.env[key] || fallback;
}

module.exports = () => ({
  ...baseExpoConfig,
  extra: {
    ...baseExpoConfig.extra,
    EXPO_PUBLIC_API_BASE_URL: envOrFallback(
      'EXPO_PUBLIC_API_BASE_URL',
      baseExpoConfig.extra?.EXPO_PUBLIC_API_BASE_URL
    ),
    EXPO_PUBLIC_FIREBASE_API_KEY: envOrFallback(
      'EXPO_PUBLIC_FIREBASE_API_KEY',
      baseExpoConfig.extra?.EXPO_PUBLIC_FIREBASE_API_KEY
    ),
    EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: envOrFallback(
      'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
      baseExpoConfig.extra?.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN
    ),
    EXPO_PUBLIC_FIREBASE_PROJECT_ID: envOrFallback(
      'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
      baseExpoConfig.extra?.EXPO_PUBLIC_FIREBASE_PROJECT_ID
    ),
    EXPO_PUBLIC_FIREBASE_APP_ID: envOrFallback(
      'EXPO_PUBLIC_FIREBASE_APP_ID',
      baseExpoConfig.extra?.EXPO_PUBLIC_FIREBASE_APP_ID
    ),
    EXPO_PUBLIC_PRIVACY_POLICY_URL: envOrFallback(
      'EXPO_PUBLIC_PRIVACY_POLICY_URL',
      baseExpoConfig.extra?.EXPO_PUBLIC_PRIVACY_POLICY_URL
    ),
    EXPO_PUBLIC_TERMS_URL: envOrFallback(
      'EXPO_PUBLIC_TERMS_URL',
      baseExpoConfig.extra?.EXPO_PUBLIC_TERMS_URL
    ),
    EXPO_PUBLIC_SUPPORT_EMAIL: envOrFallback(
      'EXPO_PUBLIC_SUPPORT_EMAIL',
      baseExpoConfig.extra?.EXPO_PUBLIC_SUPPORT_EMAIL
    ),
    EXPO_PUBLIC_REVENUECAT_API_KEY: envOrFallback(
      'EXPO_PUBLIC_REVENUECAT_API_KEY',
      baseExpoConfig.extra?.EXPO_PUBLIC_REVENUECAT_API_KEY
    ),
  },
});
