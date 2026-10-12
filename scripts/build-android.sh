#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/env.sh
mode="${1:-release}"
abis="${2:-arm64-v8a}"
case "$mode" in release|preview) ;; *) echo 'Usage: build-android.sh [release|preview] [arm64-v8a,x86_64]' >&2; exit 2;; esac
if [[ ! "$abis" =~ ^(arm64-v8a|x86_64)(,(arm64-v8a|x86_64))*$ ]]; then echo 'Supported ABIs: arm64-v8a, x86_64' >&2; exit 2; fi
command -v node >/dev/null
command -v java >/dev/null
if [[ -z "${ANDROID_HOME:-}" ]]; then echo 'Set ANDROID_HOME or LIME_ANDROID_SDK_DIR.' >&2; exit 1; fi
if [[ ! -d node_modules ]]; then echo 'Run npm ci first.' >&2; exit 1; fi
if [[ "$mode" == release && ! -f "${LIME_SIGNING_PROPERTIES:-.local/signing/keystore.properties}" ]]; then
  echo 'Set LIME_SIGNING_PROPERTIES to a private keystore.properties file; use preview for a standalone development build.' >&2
  exit 1
fi
version="$(node -p "require('./package.json').version")"
args=("-PreactNativeArchitectures=$abis")
if [[ "$mode" == preview ]]; then args+=('-PLIME_PREVIEW=true'); fi
(cd android && ./gradlew assembleRelease "${args[@]}" --no-daemon --max-workers=4)
out="artifacts/$mode"
mkdir -p "$out"
IFS=',' read -r -a abi_list <<< "$abis"
for abi in "${abi_list[@]}"; do
  cp "android/app/build/outputs/apk/release/app-$abi-release.apk" "$out/lime-$version-$abi.apk"
done
(cd "$out" && sha256sum lime-"$version"-*.apk > SHA256SUMS)
echo "Standalone APKs: $out (mode: $mode)"
