import type { ExpoConfig } from 'expo/config';

/**
 * SoloTrav Android app configuration.
 * Secrets never go in this file: keys come from environment variables at build time (see docs/ANDROID.md).
 * Only restricted, public client keys (Maps SDK key restricted to this package + SHA-1) are embedded in the app.
 */
const applicationId = process.env.ANDROID_APPLICATION_ID ?? 'com.solotrav.app';

const config: ExpoConfig = {
  name: 'SoloTrav',
  slug: 'solotrav',
  scheme: 'solotrav',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  platforms: ['android'],
  experiments: { typedRoutes: false },
  android: {
    package: applicationId,
    versionCode: Number(process.env.ANDROID_VERSION_CODE ?? 1),
    adaptiveIcon: {
      backgroundColor: '#1769FF',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    // Foreground location is requested when the user starts tracking. ACCESS_BACKGROUND_LOCATION is deliberately NOT
    // declared: recording with the screen off uses a visible foreground service (least privilege, simpler Play review).
    permissions: [
      'ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION',
      'FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_LOCATION', 'POST_NOTIFICATIONS', 'CAMERA', 'READ_MEDIA_IMAGES', 'READ_MEDIA_VIDEO',
    ],
    // The app never records audio and never draws over other apps.
    blockedPermissions: ['android.permission.RECORD_AUDIO', 'android.permission.SYSTEM_ALERT_WINDOW'],
    config: { googleMaps: { apiKey: process.env.GOOGLE_MAPS_ANDROID_KEY ?? '' } },
    intentFilters: [
      { action: 'VIEW', autoVerify: false, data: [{ scheme: 'solotrav' }], category: ['BROWSABLE', 'DEFAULT'] },
    ],
  },
  plugins: [
    './plugins/withReleaseSigning.js',
    'expo-router',
    ['expo-splash-screen', { image: './assets/splash-icon.png', imageWidth: 200, resizeMode: 'contain', backgroundColor: '#1769FF' }],
    'expo-sqlite',
    'expo-secure-store',
    'expo-web-browser',
    [
      'expo-location',
      {
        locationWhenInUsePermission: 'SoloTrav uses your location to record a journey you start, and to show how far you are from a destination.',
        isAndroidBackgroundLocationEnabled: false,
        isAndroidForegroundServiceEnabled: true,
      },
    ],
    ['expo-image-picker', { photosPermission: 'Choose photos and videos to share in your posts.', cameraPermission: 'Take photos for your trips and posts.' }],
    ['expo-notifications', { color: '#1769FF' }],
  ],
  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    mapsConfigured: Boolean(process.env.GOOGLE_MAPS_ANDROID_KEY),
    eas: { projectId: process.env.EAS_PROJECT_ID },
  },
};

export default config;
