#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/env.sh
mode="${1:-release}"
abis="${2:-arm64-v8a}"
case "$mode" in debug) task=assembleDebug;; preview) task=assemblePreview;; release) task=assembleRelease;; *) echo 'Usage: android-build.sh [debug|preview|release] [arm64-v8a,x86_64]' >&2; exit 2;; esac
if [[ ! "$abis" =~ ^(arm64-v8a|x86_64)(,(arm64-v8a|x86_64))*$ ]]; then echo 'Supported ABIs: arm64-v8a, x86_64' >&2; exit 2; fi
if [[ -z "${ANDROID_HOME:-}" || ! -d node_modules ]]; then echo 'Configure the SDK and run npm ci first.' >&2; exit 1; fi
if [[ "$mode" == release && ! -f "${LIME_SIGNING_PROPERTIES:-.local/signing/keystore.properties}" ]]; then echo 'Private release signing required; configure LIME_SIGNING_PROPERTIES.' >&2; exit 1; fi
if [[ "$mode" != release && ! -f .local/signing/debug.keystore ]]; then
  mkdir -p .local/signing
  keytool -genkeypair -noprompt -keystore .local/signing/debug.keystore -storepass android -keypass android -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 10000 -dname 'CN=Android Debug,O=Android,C=US' >/dev/null 2>&1
  chmod 600 .local/signing/debug.keystore
fi
(cd android && ./gradlew "$task" "-PreactNativeArchitectures=$abis" --no-daemon --max-workers=4)
version="$(node -p "require('./package.json').version")"
out="artifacts/$mode";mkdir -p "$out"
IFS=',' read -r -a abi_list <<< "$abis"
for abi in "${abi_list[@]}"; do cp "android/app/build/outputs/apk/$mode/app-$abi-$mode.apk" "$out/lime-ai-$version-$abi.apk"; done
(cd "$out" && sha256sum lime-ai-"$version"-*.apk > SHA256SUMS)
echo "Standalone AI edition APKs: $out"
