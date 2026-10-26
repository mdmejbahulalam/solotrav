# Android app (Expo, React Native)

Package: `com.solotrav.app` (override with `ANDROID_APPLICATION_ID`). Not Expo Go compatible: foreground-service location needs a **development build**.

## Build environment
- JDK 17 or newer (Android Studio's bundled JBR works), `JAVA_HOME` set.
- Android SDK with the platform/build-tools that React Native 0.88 / Expo SDK 58 request (the Gradle build downloads what it needs if licences are accepted: `sdkmanager --licenses`). `ANDROID_HOME` set.
- Keep the project path short on Windows (260-char limit with native builds); e.g. clone to `C:\st`.

## Debug APK
```bash
cd apps/mobile
export EXPO_PUBLIC_SUPABASE_URL=...  EXPO_PUBLIC_SUPABASE_ANON_KEY=...  GOOGLE_MAPS_ANDROID_KEY=...
npx expo prebuild --platform android       # generates android/ (git-ignored)
cd android && ./gradlew assembleDebug      # → app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/debug/app-debug.apk
npm run start                              # Metro for the dev client
```
Or with EAS: `eas build -p android --profile development`.

## Release APK / AAB
A release build bundles the JavaScript into the app, so it runs on a phone without Metro or a PC.

1. Create a keystore **outside the repository** and back it up. If you lose it you can never ship an update to the same installed app:
   `keytool -genkeypair -v -storetype PKCS12 -keystore C:\Users\<you>\keys\solotrav-release.keystore -alias solotrav -keyalg RSA -keysize 2048 -validity 10000`
   (`keytool` is in Android Studio's `jbr\bin`). Choose the passwords yourself.
2. Put the signing values in your **user-level** `~/.gradle/gradle.properties` (never in the repo):
   ```
   SOLOTRAV_UPLOAD_STORE_FILE=C:/Users/<you>/keys/solotrav-release.keystore
   SOLOTRAV_UPLOAD_STORE_PASSWORD=...
   SOLOTRAV_UPLOAD_KEY_ALIAS=solotrav
   SOLOTRAV_UPLOAD_KEY_PASSWORD=...
   ```
   `plugins/withReleaseSigning.js` (listed in `app.config.ts`) wires these into the generated project. Without them a release build **stops with an error**; it never falls back to the debug key.
3. Build with the real public app settings in the environment (they are compiled into the bundle): `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, optionally `GOOGLE_MAPS_ANDROID_KEY`. Then `./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a` (APK, `app/build/outputs/apk/release/app-release.apk`) or `./gradlew bundleRelease` (AAB for Google Play).
4. Get the SHA-1 with `keytool -list -v -keystore ...` and add it to the Android Maps key restriction **and** the Google OAuth Android client.
5. Bump `ANDROID_VERSION_CODE` for every upload. Verify the signature with `apksigner verify --print-certs app-release.apk`.

## Permissions (see `app.config.ts`)
Fine/coarse location, foreground service + foreground-service-location, notifications, camera, media read. Blocked: `RECORD_AUDIO`, `SYSTEM_ALERT_WINDOW`. No background-location permission. Play Console will ask for a foreground-service-location declaration: the justification is "user-initiated journey recording shown with a persistent notification".

## Testing GPS
Emulator: Extended controls → Location → *Routes* (play a GPX route) or *Single points*. Device: walk/drive with the app visible and then with the screen off; verify the notification, points count and sync. Mocked-coordinate logic is covered by automated tests; real-device behaviour is **not** covered.

## Troubleshooting
| Symptom | Cause / fix |
|---|---|
| "Location permission is blocked" | Android remembers two denials → *Open settings* in the app, enable Location for SoloTrav |
| Recording stops with the screen off | Battery optimisation. Set SoloTrav to *Unrestricted* battery use; some vendors (Xiaomi, Huawei, Samsung "sleeping apps") kill foreground services |
| Only approximate location | User chose "Approximate"; ask for Precise in settings |
| Map is blank/grey | `GOOGLE_MAPS_ANDROID_KEY` missing or its package/SHA-1 restriction doesn't match the installed build |
| `prebuild` fails with EBUSY on Windows | A shell/IDE has `android/` as its working directory; close it and retry |
| Google sign-in returns to login | OAuth client or Supabase redirect (`solotrav://`) not configured |
| Points stay "to sync" | Offline or backend error; they are safe on the device and retry automatically (Retry sync button) |

## Windows build notes (what actually worked)
- Copy the repo to a short real path (e.g. `D:\st`; `subst` drives fail with "different roots" in RN codegen) and run Gradle there.
- Enable Windows long paths (`LongPathsEnabled=1`, reboot) **and** replace the SDK's `cmake\3.22.1\bin\ninja.exe` (1.10.2) with ninja 1.12+ (tested 1.13.2). The old ninja still fails with "Filename longer than 260 characters" on `react-native-gesture-handler`.
- `JAVA_HOME` = Android Studio's JBR, `android/local.properties` with `sdk.dir`, then `gradlew assembleDebug -x lint -PreactNativeArchitectures=arm64-v8a`.

## Status
A debug APK (arm64-v8a, `com.solotrav.app`, ~80 MB) built successfully with placeholder Supabase values. It has **not been installed or run on a device/emulator**, and real Supabase/Maps keys must be supplied at build time (`EXPO_PUBLIC_*`).

The published release APK contains both arm64-v8a (phones) and x86_64 (emulator) so the same file can be tested on either; build with -PreactNativeArchitectures=arm64-v8a,x86_64.

