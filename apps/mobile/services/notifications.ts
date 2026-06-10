/**
 * Notification Service
 *
 * Handles push notification setup, permissions, and token registration.
 */

import * as Notifications from 'expo-notifications';
import { registerPushToken as registerPushTokenApi } from '@komuchi/shared';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Request notification permissions and return the status
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  return finalStatus === 'granted';
}

/**
 * Get the Expo push token for this device
 * Returns null if push notifications aren't available (e.g., free Apple Developer account)
 */
export async function getExpoPushToken(): Promise<string | null> {
  try {
    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) {
      console.warn('Notification permissions not granted');
      return null;
    }

    // Try to get push token, but don't fail if it's not available (free dev account)
    try {
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID || undefined,
      });
      return tokenData.data;
    } catch (pushError: any) {
      // If push notifications aren't available (free dev account), that's okay
      // We'll use local notifications instead
      const errorMessage = pushError?.message || '';
      const isPushNotAvailable =
        errorMessage.includes('Push Notifications') ||
        errorMessage.includes('aps-environment') ||
        errorMessage.includes('capability') ||
        pushError?.code === 'E_NOTIFICATIONS_UNAVAILABLE';

      if (isPushNotAvailable) {
        // Silently handle - this is expected with free dev accounts
        // Don't log as error, just return null
        return null;
      }
      // For other errors, log and return null
      console.warn('Unexpected error getting push token:', errorMessage);
      return null;
    }
  } catch (error: any) {
    // Final catch - only log if it's not a push capability error
    const errorMessage = error?.message || '';
    if (!errorMessage.includes('aps-environment') && !errorMessage.includes('Push Notifications')) {
      console.warn('Error getting Expo push token:', errorMessage);
    }
    return null;
  }
}

/**
 * Register the device push token with the backend
 */
export async function registerPushToken(userId: string, token: string): Promise<void> {
  try {
    await registerPushTokenApi(userId, token);
  } catch (error) {
    console.error('Error registering push token:', error);
    throw error;
  }
}

/**
 * Send a local notification (works without push token / paid dev account)
 * Useful for testing and as a fallback when push notifications aren't available
 */
export async function sendLocalNotification(
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<void> {
  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) {
    console.warn('Notification permissions not granted, cannot send local notification');
    return;
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: data || {},
      sound: true,
    },
    trigger: null, // Show immediately
  });
}

/**
 * Setup notification listeners for handling taps
 */
export function setupNotificationListeners(onNotificationTap: (data: any) => void): () => void {
  // Handle notification received while app is in foreground
  const receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
    if (__DEV__) console.log('Notification received:', notification);
  });

  // Handle notification tap
  const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
    if (__DEV__) console.log('Notification tapped:', response);
    const data = response.notification.request.content.data;
    onNotificationTap(data);
  });

  // Return cleanup function
  return () => {
    receivedSubscription.remove();
    responseSubscription.remove();
  };
}
