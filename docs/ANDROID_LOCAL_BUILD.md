# Building Manifest for Android locally (no EAS)

This generates a real native Android project from the Expo code and builds
it with your own Android Studio/Gradle setup — no Expo account, no EAS
servers involved. It's a standalone APK you fully control.

## Prerequisites

1. **Android Studio** installed, with:
   - An Android SDK platform installed (SDK 34 recommended, matching
     Expo SDK 51's target)
   - At least one **AVD emulator** created (Android Studio → Device
     Manager → Create Device — a Pixel 7 / API 34 image is a safe choice)
2. **JDK 17** — React Native 0.74 requires it specifically. Check with
   `java -version`. If Android Studio bundles its own JDK (it usually
   does, under `Android Studio → Settings → Build Tools → Gradle → Gradle
   JDK`), that's fine and takes priority for the build even if your
   system `java` is a different version.
3. Environment variables set (add to `~/.zshrc` / `~/.bashrc` or
   equivalent):
   ```
   export ANDROID_HOME=$HOME/Library/Android/sdk   # macOS
   export PATH=$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools
   ```
   (Android Studio → Settings → Appearance & Behavior → System Settings →
   Android SDK shows your actual SDK path if it's not the default above.)
4. `.env` already set up as in the main setup guide — the native build
   reads the same `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   at build time.

## Step 1 — Generate the native Android project

From the repo root:

```
npx expo prebuild -p android
```

This reads `app.json` (including the `expo-image-picker` plugin config
already set up in the repo) and generates a full `android/` folder — a
real Gradle project, not managed by Expo's cloud service. This folder is
git-ignored (see `.gitignore`) since it's fully regenerable from
`app.json` + the installed packages; if you end up hand-editing native
Android files directly (the way Kinetic needed a custom
`metro-transformer.js` and a Gradle `fixFoojay` plugin), you have two
options: commit `android/` at that point so the customization persists,
or better, codify the change as a config plugin so `prebuild` recreates
it correctly every time you regenerate. Not needed unless you hit a
similar native-config issue.

Re-run `npx expo prebuild -p android --clean` any time you add a package
with native code, change `app.json`, or want a fully fresh native project.

## Step 2 — Start your emulator

Either launch it from Android Studio's Device Manager, or from the
command line:
```
emulator -list-avds
emulator -avd <your-avd-name>
```
Wait for it to fully boot before the next step.

## Step 3 — Build and run

**Option A — one command (recommended):**
```
npx expo run:android
```
This compiles the native app, installs it on the running emulator, starts
the Metro bundler, and launches the app automatically. First build is
slow (several minutes — full Gradle build); subsequent builds are much
faster.

**Option B — via Android Studio directly:**
1. Open Android Studio → **Open** → select the generated `android/` folder.
2. Let Gradle sync finish (bottom status bar).
3. Pick your emulator from the device dropdown, click **Run** (▶).
4. In a separate terminal, start Metro so the JS bundle is served:
   ```
   npx expo start --dev-client
   ```
   The app on the emulator connects to this automatically if it's running
   on the same machine.

Either way, you get a real installed app icon on the emulator's home
screen — this is a genuine local build, not Expo Go.

## Common issues

- **Gradle "foojay-resolver" / JDK-discovery network errors**: a known
  friction point with newer Gradle + certain JDK setups (you hit a
  version of this on Kinetic too). If the build fails trying to resolve
  a JDK toolchain over the network, the fix is usually pinning Gradle's
  JDK explicitly (Android Studio → Gradle JDK setting) rather than
  letting it auto-resolve — happy to debug the exact error output with
  you if it comes up.
- **`SDK location not found`**: means `ANDROID_HOME` isn't set, or
  `android/local.properties` is missing — `prebuild` normally creates it;
  if not, create `android/local.properties` with `sdk.dir=/path/to/your/sdk`.
- **Metro can't connect / white screen**: confirm `npx expo start
  --dev-client` is running, and that the emulator can reach `localhost`
  (Android emulators map host `localhost` to `10.0.2.2` automatically for
  Metro's default setup — this is handled by Expo's tooling, but worth
  knowing if you ever see connection-refused errors).
- **Env vars not picked up**: `EXPO_PUBLIC_*` vars are inlined at bundle
  time. If you change `.env`, restart Metro (`npx expo start --dev-client
  -c` to clear cache) rather than just reloading the app.

## What this is NOT

- Not a release/signed build — this produces a debug APK, fine for your
  own emulator/device testing, not for distribution. Release signing is a
  separate step (`android/app/build.gradle` release config + a keystore)
  we haven't set up, and isn't needed until you want a shareable/production
  build.
- Not connected to EAS at all — nothing here touches Expo's build
  servers or requires an Expo account.
