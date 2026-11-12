import { Platform } from 'react-native';
import Constants from 'expo-constants';
import PostHog from 'posthog-react-native';

type PostHogExtra = {
  posthogProjectToken?: string;
  posthogHost?: string;
};

const extra = Constants.expoConfig?.extra as PostHogExtra | undefined;
const projectToken = extra?.posthogProjectToken;
const host = extra?.posthogHost;

if (__DEV__ && !projectToken) {
  throw new Error('EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN is configured');
}

if (__DEV__ && !host) {
  throw new Error('EXPO_PUBLIC_POSTHOG_HOST variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once EXPO_PUBLIC_POSTHOG_HOST is configured');
}

/** Shared PostHog client for all Expo targets. */
export const posthog = projectToken && host
  ? new PostHog(projectToken, {
    host,
    captureAppLifecycleEvents: true,
    errorTracking: {
      autocapture: {
        uncaughtExceptions: true,
        unhandledRejections: true,
      },
    },
    // Replay records the native screen only; the web build has no recorder.
    enableSessionReplay: Platform.OS !== 'web',
    // The logs endpoint's CORS preflight only allows Content-Type, so a browser can't send the gzip header.
    disableCompression: Platform.OS === 'web',
    preloadFeatureFlags: true,
    logs: {
      serviceName: 'cryochain-mobile',
    },
  })
  : undefined;

// The SDK's uncaught-exception hook needs React Native's ErrorUtils, which web lacks; rejections are covered.
if (posthog && Platform.OS === 'web') {
  window.addEventListener('error', (e) => posthog.captureException(e.error ?? new Error(e.message)));
}
