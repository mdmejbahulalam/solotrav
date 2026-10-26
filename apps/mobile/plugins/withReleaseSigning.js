const { withAppBuildGradle, withGradleProperties } = require('@expo/config-plugins');

/**
 * R8 shrinking is switched off for release: with it on, the shipped app crashed at startup because WorkManager's
 * Room database class (used by expo-notifications) was stripped. Re-enable only together with verified keep rules.
 */
function withoutMinify(config) {
  return withGradleProperties(config, (cfg) => {
    const key = 'android.enableMinifyInReleaseBuilds';
    const props = cfg.modResults.filter((p) => !(p.type === 'property' && p.key === key));
    props.push({ type: 'property', key, value: 'false' });
    cfg.modResults = props;
    return cfg;
  });
}

/**
 * Release signing for SoloTrav. The generated android/ project signs release builds with the public debug key, which is
 * unsafe to ship. This plugin replaces that with a keystore YOU control, read from Gradle properties kept outside the
 * repository (for example ~/.gradle/gradle.properties):
 *
 *   SOLOTRAV_UPLOAD_STORE_FILE=C:\\path\\to\\solotrav-release.keystore
 *   SOLOTRAV_UPLOAD_STORE_PASSWORD=...
 *   SOLOTRAV_UPLOAD_KEY_ALIAS=solotrav
 *   SOLOTRAV_UPLOAD_KEY_PASSWORD=...
 *
 * If a release build is requested without them, the build stops with an explicit error instead of silently using the debug key.
 */
const MARK = '// solotrav-release-signing';

module.exports = function withReleaseSigning(config) {
  return withoutMinify(withAppBuildGradle(config, (cfg) => {
    let g = cfg.modResults.contents;
    if (g.includes(MARK)) return cfg;

    // 1. a release signing config backed by Gradle properties
    g = g.replace(
      /signingConfigs\s*\{\s*debug\s*\{/,
      `signingConfigs {\n        ${MARK}\n        release {\n            if (project.hasProperty('SOLOTRAV_UPLOAD_STORE_FILE')) {\n                storeFile file(project.property('SOLOTRAV_UPLOAD_STORE_FILE'))\n                storePassword project.property('SOLOTRAV_UPLOAD_STORE_PASSWORD')\n                keyAlias project.property('SOLOTRAV_UPLOAD_KEY_ALIAS')\n                keyPassword project.property('SOLOTRAV_UPLOAD_KEY_PASSWORD')\n            }\n        }\n        debug {`,
    );

    // 2. the release build type uses it (never the debug key)
    g = g.replace(/(release\s*\{[^}]*?)signingConfig signingConfigs\.debug/, '$1signingConfig signingConfigs.release');

    // 3. fail loudly when someone builds a release without the keystore properties
    g += `\n${MARK}-guard\ngradle.taskGraph.whenReady { graph ->\n    if (graph.allTasks.any { it.name.toLowerCase().contains('release') && it.project == project } && !project.hasProperty('SOLOTRAV_UPLOAD_STORE_FILE')) {\n        throw new GradleException('Release signing is not configured. Set SOLOTRAV_UPLOAD_STORE_FILE, SOLOTRAV_UPLOAD_STORE_PASSWORD, SOLOTRAV_UPLOAD_KEY_ALIAS and SOLOTRAV_UPLOAD_KEY_PASSWORD in ~/.gradle/gradle.properties (see docs/ANDROID.md).')\n    }\n}\n`;
    cfg.modResults.contents = g;
    return cfg;
  }));
};
