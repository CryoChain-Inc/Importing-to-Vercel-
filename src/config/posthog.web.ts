import Constants from 'expo-constants';
import posthogJs from 'posthog-js';

type PostHogExtra = {
  posthogProjectToken?: string;
  posthogHost?: string;
};

const extra = Constants.expoConfig?.extra as PostHogExtra | undefined;
const projectToken = extra?.posthogProjectToken;
const host = extra?.posthogHost;

// Web-only client (Metro picks this over posthog.ts on web), so native keeps posthog-react-native alone.
// posthog-js records the DOM for session replay and sends logs with browser-safe requests.
if (projectToken && host) {
  posthogJs.init(projectToken, {
    // Production goes through the /ingest rewrite in vercel.json so ad blockers don't drop it; dev has no proxy.
    api_host: __DEV__ ? host : '/ingest',
    ui_host: 'https://us.posthog.com',
    capture_exceptions: true,
    logs: { serviceName: 'cryochain-web' },
  });
}

export const posthog = projectToken && host ? posthogJs : undefined;
