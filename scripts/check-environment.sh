#!/usr/bin/env bash
# Verify the existing workstation; no installs, builds, services or device actions.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"
cd "$LIME_PROJECT_ROOT"
for lime_command in node npm java git python3 adb; do
  command -v "$lime_command" >/dev/null || { printf 'Missing tool: %s\n' "$lime_command" >&2; exit 1; }
done
node <<'JS'
const fs = require('node:fs');
const expected = JSON.parse(fs.readFileSync('toolchain.json', 'utf8'));
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
if (process.versions.node !== expected.node) throw new Error(`Node ${expected.node} required, found ${process.versions.node}`);
if (pkg.name !== lock.name || pkg.version !== lock.packages[''].version) throw new Error('Package metadata differs from lock');
const wrapper = fs.readFileSync('android/gradle/wrapper/gradle-wrapper.properties', 'utf8');
if (!wrapper.includes(`gradle-${expected.gradle}-`)) throw new Error('Gradle wrapper differs from toolchain');
if (fs.readFileSync('.node-version', 'utf8').trim() !== expected.node) throw new Error('Node version file differs from toolchain');
console.log(`Node ${expected.node}, Gradle wrapper ${expected.gradle}, package/lock: OK`);
JS
lime_java_version="$(java -version 2>&1)"
if [[ "$lime_java_version" != *'version "17.'* ]]; then
  printf '%s\n' 'JDK 17 is required.' >&2
  exit 1
fi
lime_sdk_version="$(python3 -c 'import json;print(json.load(open("toolchain.json"))["android_build_tools"])')"
lime_sdk_platform="$(python3 -c 'import json;print(json.load(open("toolchain.json"))["android_compile_sdk"])')"
lime_sdk_ndk="$(python3 -c 'import json;print(json.load(open("toolchain.json"))["android_ndk"])')"
for lime_sdk_file in "${ANDROID_HOME:?Configure Android SDK}/build-tools/$lime_sdk_version/aapt" \
  "$ANDROID_HOME/build-tools/$lime_sdk_version/apksigner" \
  "$ANDROID_HOME/platforms/android-$lime_sdk_platform/android.jar" \
  "$ANDROID_HOME/ndk/$lime_sdk_ndk/source.properties"; do
  test -f "$lime_sdk_file" || { printf 'Missing SDK component: %s\n' "$lime_sdk_file" >&2; exit 1; }
done
npm ls --depth=0 --offline >/dev/null
printf 'JDK 17, Android SDK %s, NDK %s, installed dependencies: OK\n' "$lime_sdk_platform" "$lime_sdk_ndk"
printf 'Active checkout: %s\n' "$LIME_PROJECT_ROOT"
printf '%s\n' 'No installs, builds, servers or device actions performed.'
