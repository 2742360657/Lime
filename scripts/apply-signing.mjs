#!/usr/bin/env node
// Reapply portable signing after an intentional, reviewed Expo prebuild.
import { readFileSync, writeFileSync } from 'node:fs';
const file = 'android/app/build.gradle';
let source = readFileSync(file, 'utf8');
source = source.replace("storeFile file('debug.keystore')", "storeFile rootProject.file('../.local/signing/debug.keystore')");
if (!source.includes("project.findProperty('LIME_KEYSTORE_DIR')")) {
  const anchor = "            keyPassword 'android'\n        }";
  if (!source.includes(anchor)) throw new Error('Unexpected signing configuration; review the native diff.');
  const release = `
        release {
            def keystoreDir = project.findProperty('LIME_KEYSTORE_DIR') ?: System.getenv('LIME_KEYSTORE_DIR') ?: rootProject.file('../.local/signing').absolutePath
            def keystoreProps = new Properties()
            def keystorePropsFile = new File(keystoreDir, 'keystore.properties')
            if (keystorePropsFile.exists()) {
                keystorePropsFile.withInputStream { keystoreProps.load(it) }
            }
            storeFile new File(keystoreDir, keystoreProps.getProperty('storeFile', 'lime-release.keystore'))
            storePassword keystoreProps.getProperty('storePassword', '')
            keyAlias keystoreProps.getProperty('keyAlias', '')
            keyPassword keystoreProps.getProperty('keyPassword', '')
        }`;
  source = source.replace(anchor, anchor + release);
}
source = source.replace('signingConfig signingConfigs.debug\n            def enableShrinkResources', 'signingConfig signingConfigs.release\n            def enableShrinkResources');
writeFileSync(file, source);
console.log('Local signing paths configured; no credentials embedded.');
