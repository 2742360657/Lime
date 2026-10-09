#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

// Reapply project development settings after an intentional Expo prebuild.
const gradlePath = 'android/app/build.gradle';
let gradle = readFileSync(gradlePath, 'utf8');
if (!gradle.includes("applicationIdSuffix '.dev'")) {
  const anchor = /(buildTypes\s*\{\s*debug\s*\{)/;
  if (!anchor.test(gradle)) throw new Error('Cannot locate Android debug build type.');
  gradle = gradle.replace(anchor, "$1\n            applicationIdSuffix '.dev'\n            versionNameSuffix '-dev'\n            resValue 'string', 'dev_app_name', '酸橙 Dev'");
}
if (!gradle.includes('preview {')) {
  gradle = gradle.replace(/(buildTypes\s*\{)/, `$1
        preview {
            initWith release
            applicationIdSuffix '.dev'
            versionNameSuffix '-preview'
            resValue 'string', 'dev_app_name', '酸橙 Dev'
            signingConfig signingConfigs.debug
            matchingFallbacks = ['release']
        }`);
}
writeFileSync(gradlePath, gradle);

const manifestPath = 'android/app/src/debug/AndroidManifest.xml';
let manifest = readFileSync(manifestPath, 'utf8');
if (!manifest.includes('android:label="@string/dev_app_name"')) {
  manifest = manifest.replace('<application ', '<application android:label="@string/dev_app_name" ');
  manifest = manifest.replace('tools:replace="android:usesCleartextTraffic"', 'tools:replace="android:usesCleartextTraffic,android:label"');
}
writeFileSync(manifestPath, manifest);

const wrapperPath = 'android/gradle/wrapper/gradle-wrapper.properties';
let wrapper = readFileSync(wrapperPath, 'utf8');
wrapper = wrapper.replace(/^distributionUrl=.*$/m, 'distributionUrl=https\\://services.gradle.org/distributions/gradle-8.14.5-bin.zip');
const checksum = 'distributionSha256Sum=6f74b601422d6d6fc4e1f9a1ab6522f642c2fdcbc15ae33ebd30ba3d7198e854';
wrapper = /^distributionSha256Sum=/m.test(wrapper)
  ? wrapper.replace(/^distributionSha256Sum=.*$/m, checksum)
  : wrapper.trimEnd() + '\n' + checksum + '\n';
writeFileSync(wrapperPath, wrapper);
console.log('Development package identity and supported Gradle version are configured.');

mkdirSync('android/app/src/preview', { recursive: true });
writeFileSync('android/app/src/preview/AndroidManifest.xml', `<manifest xmlns:android="http://schemas.android.com/apk/res/android" xmlns:tools="http://schemas.android.com/tools">
<application android:label="@string/dev_app_name" android:usesCleartextTraffic="true" tools:replace="android:label" />
</manifest>\n`);
