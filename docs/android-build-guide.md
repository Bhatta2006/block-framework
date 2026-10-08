# Android Build Guide (M4)

Three routes to get the generated app onto a real phone, in order of
reliability for the demo.

## Route 1: EAS Build (recommended if you have an Expo account)

**Reliability:** Highest. Expo's cloud builders handle SDK, signing, and
caching. **Cost:** Free tier includes 30 builds/month. **Setup:** ~10 min.

### Steps

1. Install the EAS CLI (once):

   ```bash
   npm install -g eas-cli
   ```

2. Log in (needs your Expo account):

   ```bash
   eas login
   ```

3. In the exported app directory:

   ```bash
   cd /path/to/unzipped/app
   eas build:configure
   ```

   This creates `eas.json`. Choose "Android" when prompted.

4. Build an installable APK (not AAB — APK installs directly):

   ```bash
   eas build --platform android --profile preview
   ```

   The `preview` profile builds an APK. (The default `production` profile
   builds an AAB for Play Store.)

5. When the build finishes, EAS gives you a download URL or QR code.
   Download the APK to the phone and install (allow "install unknown apps").

### For CI / automation

Set `EXPO_TOKEN` (from https://expo.dev/accounts/[account]/settings/access-tokens)
as an environment variable, then `eas build --platform android --profile preview --non-interactive`.

## Route 2: Local Gradle build (no Expo account needed)

**Reliability:** High, if Android Studio is set up. **Cost:** Free.
**Setup:** ~30 min (Android Studio install). **Build time:** 5–15 min first build.

### Prerequisites

- Android Studio (includes Android SDK + Java)
- Set `ANDROID_HOME` (e.g., `~/Android/Sdk` on Linux, `%LOCALAPPDATA%\Android\Sdk` on Windows)

### Steps

1. In the exported app directory, generate native projects:

   ```bash
   npx expo prebuild --platform android
   ```

   (Verified working in M4 — creates the `android/` directory.)

2. Build a debug APK (installable, no signing key needed):

   ```bash
   cd android
   ./gradlew assembleDebug
   ```

   The APK lands at `android/app/build/outputs/apk/debug/app-debug.apk`.

3. Install via ADB:
   ```bash
   adb install app/build/outputs/apk/debug/app-debug.apk
   ```

### Release APK (needs a signing key)

1. Generate a key (once):

   ```bash
   keytool -genkey -v -keystore my-release-key.keystore -alias my-key-alias -keyalg RSA -keysize 2048 -validity 10000
   ```

2. Add to `android/gradle.properties`:

   ```properties
   MYAPP_RELEASE_STORE_FILE=my-release-key.keystore
   MYAPP_RELEASE_KEY_ALIAS=my-key-alias
   MYAPP_RELEASE_STORE_PASSWORD=***
   MYAPP_RELEASE_KEY_PASSWORD=***
   ```

3. Build:
   ```bash
   cd android && ./gradlew assembleRelease
   ```

## Route 3: Expo Go (demo fallback, zero build)

**Reliability:** Highest for a live demo (no build step to fail).
**Limitation:** Not installable; needs network; phone must have Expo Go app.

### Steps

1. In the exported app directory:

   ```bash
   npx expo start
   ```

2. Scan the QR code with the Expo Go app (Android/iOS).

3. The app loads over the network. Both devices must be on the same Wi-Fi,
   or use `npx expo start --tunnel` (slower but works across networks).

## Comparison

| Route        | Reliability | Speed     | Cost      | Setup  | Needs account |
| ------------ | ----------- | --------- | --------- | ------ | ------------- |
| EAS Build    | ★★★★★       | 10–20 min | Free tier | 10 min | Yes           |
| Local Gradle | ★★★★☆       | 5–15 min  | Free      | 30 min | No            |
| Expo Go      | ★★★★★       | Instant   | Free      | 2 min  | No            |

**Demo recommendation:** Use **Expo Go** as the primary demo path (zero failure
modes), with a pre-built APK (via EAS or Gradle) on the phone as the "real
installable app" moment. Build the APK the day before, not live.
