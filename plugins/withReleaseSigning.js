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
//
// NOTE for future edits to this file: the build.gradle mod below short-circuits
// on its own `// @generated` marker, so editing this file and re-running a
// plain (non-clean) `expo prebuild` does NOT re-apply the change — the old
// injected block is left in place. A `--clean` prebuild forces regeneration,
// but this project has several other hand-maintained native/ edits (see
// docs/HANDOFF.md) that don't survive `--clean` either, so treat that as a
// deliberate, audited step, not a routine one.

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
    // This warning alone used to be the only signal — too weak, since a
    // prebuild warning scrolls away and the build then happily produces a
    // debug-signed release with no further indication anything was wrong.
    // The taskGraph guard injected below is the real enforcement; this is
    // just an earlier, friendlier nudge.
    console.warn(
      `\n  ⚠  ${PROPS_FILE} not found — a release build will REFUSE to run\n` +
        `     (see the taskGraph guard in android/app/build.gradle) rather than\n` +
        `     silently falling back to the debug key. See android-keystore/KEYSTORE_INFO.txt.\n`,
    );
  } else {
    config = withGradleProperties(config, (cfg) => {
      for (const key of KEYS) {
        const existing = cfg.modResults.find((i) => i.type === "property" && i.key === key);
        if (existing) existing.value = creds[key];
        else cfg.modResults.push({ type: "property", key, value: creds[key] });
      }
      return cfg;
    });
  }

  // Runs unconditionally, whether or not creds were found above: the release
  // signingConfig and the taskGraph guard both need to exist in build.gradle
  // regardless, so that a build with no credentials fails loudly at the
  // *release build* step (via the guard) rather than either not existing at
  // all or crashing on an "unknown property" during project evaluation.
  config = withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== "groovy") return cfg;
    let src = cfg.modResults.contents;

    const marker = "// @generated withReleaseSigning";
    if (src.includes(marker)) return cfg;

    // Add a release signingConfig next to the debug one Expo generates.
    // Wrapped in hasProperty — not just storeFile file(MANIFEST_RELEASE_STORE_FILE)
    // unconditionally — because without it, a missing keystore.properties
    // (so gradle.properties never gets these keys) blows up *every* Gradle
    // invocation, debug builds included, with an opaque "Could not get
    // unknown property" during project evaluation instead of the guard's
    // actionable message at the point it actually matters (a release build).
    src = src.replace(
      /(signingConfigs\s*\{)/,
      `$1
        ${marker}
        release {
            if (project.hasProperty('MANIFEST_RELEASE_STORE_FILE')) {
                storeFile file(MANIFEST_RELEASE_STORE_FILE)
                storePassword MANIFEST_RELEASE_STORE_PASSWORD
                keyAlias MANIFEST_RELEASE_KEY_ALIAS
                keyPassword MANIFEST_RELEASE_KEY_PASSWORD
            }
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

    // A release "successfully" signed with the debug key looks fine and
    // installs nowhere useful (Android refuses to install an update whose
    // cert doesn't match what's already on the device) — so refuse to run a
    // release build at all when the real credentials aren't present, instead
    // of letting the hasProperty guard above just quietly no-op.
    //
    // NOT appended at the very end of the file: this project's Firebase/FCM
    // wiring requires `apply plugin: 'com.google.gms.google-services'` to be
    // the LAST line in app/build.gradle (Google's own requirement), so the
    // guard is inserted just before Expo's own trailing "Apply static values
    // from `gradle.properties`..." boilerplate instead — anchored the same
    // way as the signingConfig anchors above, throwing rather than silently
    // appending in the wrong place if Expo's template moves it.
    const guardAnchor = "// Apply static values from `gradle.properties` to the `android.packagingOptions`";
    const guardAnchorAt = src.indexOf(guardAnchor);
    if (guardAnchorAt === -1) {
      throw new Error(
        "[withReleaseSigning] could not find the `// Apply static values from " +
          "\`gradle.properties\`...` anchor to insert the release-signing taskGraph guard " +
          "before. The Expo template has changed — update this plugin's anchor.",
      );
    }
    const guard = `// @generated withReleaseSigning-guard
gradle.taskGraph.whenReady { graph ->
    def releasing = graph.allTasks.any {
        it.name == 'assembleRelease' || it.name == 'packageRelease' || it.name == 'bundleRelease'
    }
    if (releasing && !project.hasProperty('MANIFEST_RELEASE_STORE_FILE')) {
        throw new GradleException(
            "Release signing credentials are missing.\\n" +
            "Expected android-keystore/keystore.properties (see android-keystore/KEYSTORE_INFO.txt).\\n" +
            "Refusing to build a release that would be signed with the shared Android debug key."
        )
    }
}

`;
    src = src.slice(0, guardAnchorAt) + guard + src.slice(guardAnchorAt);

    cfg.modResults.contents = src;
    return cfg;
  });

  return config;
}

module.exports = withReleaseSigning;
