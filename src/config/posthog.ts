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

/** Native PostHog client; web uses posthog.web.ts. */
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
    enableSessionReplay: true,
    preloadFeatureFlags: true,
    logs: {
      serviceName: 'cryochain-mobile',
    },
  })
  : undefined;
