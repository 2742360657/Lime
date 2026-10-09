#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"
cd "$LIME_PROJECT_ROOT"
LIME_BUILD_KIND="${1:-preview}"
LIME_BUILD_ARCH="${2:-arm64-v8a}"
case "$LIME_BUILD_ARCH" in arm64-v8a|x86_64) ;; *) printf '%s\n' 'Supported architectures: arm64-v8a, x86_64' >&2; exit 2;; esac
case "$LIME_BUILD_KIND" in
  debug) LIME_GRADLE_TASK=:app:assembleDebug;;
  preview) LIME_GRADLE_TASK=:app:assemblePreview;;
  release)
    test -f "$LIME_KEYSTORE_DIR/keystore.properties" || { printf '%s\n' 'Configure a private release signing directory first.' >&2; exit 2; }
    LIME_GRADLE_TASK=:app:assembleRelease;;
  *) printf '%s\n' 'Usage: scripts/android-build.sh [debug|preview|release] [arm64-v8a|x86_64]' >&2; exit 2;;
esac
# Standard development key; generated locally and never committed.
mkdir -p .local/signing
if [[ ! -f .local/signing/debug.keystore ]]; then
  keytool -genkeypair -keystore .local/signing/debug.keystore -storepass android \
    -keypass android -alias androiddebugkey -dname 'CN=Android Debug,O=Android,C=US' \
    -keyalg RSA -keysize 2048 -validity 10000 >/dev/null 2>&1
  chmod 600 .local/signing/debug.keystore
fi
npm run typecheck
./android/gradlew -p android "$LIME_GRADLE_TASK" "-PreactNativeArchitectures=$LIME_BUILD_ARCH" --max-workers=4 --no-daemon
mkdir -p artifacts/apks
LIME_APK_PATH="artifacts/apks/lime-$LIME_BUILD_KIND-$LIME_BUILD_ARCH.apk"
cp "android/app/build/outputs/apk/$LIME_BUILD_KIND/app-$LIME_BUILD_KIND.apk" "$LIME_APK_PATH"
python3 - "$LIME_APK_PATH" "$LIME_BUILD_KIND" "$LIME_BUILD_ARCH" <<'PY'
import hashlib,json,os,re,subprocess,sys
from pathlib import Path
apk,kind,arch=sys.argv[1:]
commit=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
dirty=bool(subprocess.check_output(['git','status','--porcelain'],text=True).strip())
expected='app.lime.personalassistant'+('' if kind=='release' else '.dev')
tools=Path(os.environ['ANDROID_HOME'])/'build-tools'/'36.0.0'
badging=subprocess.check_output([str(tools/'aapt'),'dump','badging',apk],text=True)
identity=re.search(r"package: name='([^']+)'",badging).group(1)
assert identity==expected, 'Built APK identity differs from configuration'
signing=subprocess.check_output([str(tools/'apksigner'),'verify','--print-certs',apk],text=True)
fingerprint=re.search(r'Signer #1 certificate SHA-256 digest: (\S+)',signing).group(1)
metadata={'commit':commit,'dirty':dirty,'kind':kind,'architecture':arch,'application_id':identity,'signing_sha256':fingerprint,'apk':apk,'sha256':hashlib.sha256(Path(apk).read_bytes()).hexdigest()}
Path(apk+'.json').write_text(json.dumps(metadata,indent=2)+'\n')
print('APK and build metadata written to artifacts/apks/')
PY
