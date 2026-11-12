// Extends app.json so the native Google Maps keys come from the environment instead of being committed.
module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    posthogProjectToken: process.env.EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN,
    posthogHost: process.env.EXPO_PUBLIC_POSTHOG_HOST,
  },
  plugins: [
    ...(config.plugins ?? []),
    'expo-localization',
    [
      'react-native-maps',
      { androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_ANDROID_KEY, iosGoogleMapsApiKey: process.env.GOOGLE_MAPS_IOS_KEY },
    ],
  ],
});
