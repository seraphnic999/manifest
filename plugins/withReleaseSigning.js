const fs = require("fs");
const path = require("path");
const { withAppBuildGradle, withGradleProperties } = require("@expo/config-plugins");

// Signs release builds with a real keystore instead of the shared Android
// debug key.
//
// Expo's generated build.gradle ships this, and it is easy to never notice:
//
//     release {
//         // Caution! In production, you need to generate your own keystore file.
//         signingConfig signingConfigs.debug
//     }
//
// The debug keystore is the one every Android SDK install ships with, so its
// certificate is identical on every machine on earth (CN=Android Debug, and
// SHA1withRSA, which modern tooling flags as weak). An APK signed with it
// identifies nobody, and Play Protect responds by making the user push through
// a "scan this app?" prompt on every sideload. A uniquely-signed APK does not
// get that treatment.
//
// This is a PLUGIN rather than a hand-edit of android/app/build.gradle because
// android/ is generated and gitignored: editing it directly works right up
// until the next `expo prebuild` (even a non-clean one re-runs every plugin's
// mods, and a `--clean` one wipes the file outright), at which point the
// release config silently disappears and builds go back to the debug key with
// no error. The keystore itself therefore also lives OUTSIDE android/, at
// android-keystore/, for the same reason.
//
// Both the keystore and its credentials are gitignored (the whole
// android-keystore/ directory, via .gitignore). Losing them means never being
// able to ship an update that installs over an existing install — see
// android-keystore/KEYSTORE_INFO.txt.

const PROPS_FILE = "android-keystore/keystore.properties";

const KEYS = [
  "MANIFEST_RELEASE_STORE_FILE",
  "MANIFEST_RELEASE_KEY_ALIAS",
  "MANIFEST_RELEASE_STORE_PASSWORD",
  "MANIFEST_RELEASE_KEY_PASSWORD",
];

function readCredentials(projectRoot) {
  const file = path.join(projectRoot, PROPS_FILE);
  if (!fs.existsSync(file)) return null;
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/.exec(line);
    if (m) out[m[1]] = m[2];
  }
  return KEYS.every((k) => out[k]) ? out : null;
}

function withReleaseSigning(config) {
  // Read once, at plugin evaluation time, so the warning below is printed
  // exactly once per prebuild rather than per mod.
  const creds = readCredentials(config._internal?.projectRoot ?? process.cwd());

  if (!creds) {
    // Loud, because the failure is otherwise invisible: the build succeeds and
    // produces an APK that just happens to be signed with the wrong key.
    console.warn(
      `\n  ⚠  ${PROPS_FILE} not found — release builds will fall back to the\n` +
        `     ANDROID DEBUG KEY. The APK will still install, but Play Protect\n` +
        `     will prompt to scan it and it will not install over a properly\n` +
        `     signed build. See android-keystore/KEYSTORE_INFO.txt.\n`,
    );
    return config;
  }

  config = withGradleProperties(config, (cfg) => {
    for (const key of KEYS) {
      const existing = cfg.modResults.find((i) => i.type === "property" && i.key === key);
      if (existing) existing.value = creds[key];
      else cfg.modResults.push({ type: "property", key, value: creds[key] });
    }
    return cfg;
  });

  config = withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== "groovy") return cfg;
    let src = cfg.modResults.contents;

    const marker = "// @generated withReleaseSigning";
    if (src.includes(marker)) return cfg;

    // Add a release signingConfig next to the debug one Expo generates.
    src = src.replace(
      /(signingConfigs\s*\{)/,
      `$1
        ${marker}
        release {
            storeFile file(MANIFEST_RELEASE_STORE_FILE)
            storePassword MANIFEST_RELEASE_STORE_PASSWORD
            keyAlias MANIFEST_RELEASE_KEY_ALIAS
            keyPassword MANIFEST_RELEASE_KEY_PASSWORD
        }`,
    );

    // Point the release buildType at it. Anchored on the exact default line so
    // that if Expo ever changes the template this throws instead of quietly
    // leaving the debug key in place.
    const before = src;
    src = src.replace(
      /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/,
      "$1signingConfig signingConfigs.release",
    );
    if (src === before) {
      throw new Error(
        "[withReleaseSigning] could not find `signingConfig signingConfigs.debug` in the " +
          "release buildType. The Expo template has changed — update this plugin rather " +
          "than shipping a debug-signed release.",
      );
    }

    cfg.modResults.contents = src;
    return cfg;
  });

  return config;
}

module.exports = withReleaseSigning;
