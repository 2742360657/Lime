#!/usr/bin/env bash
# Test-only updater with an older identity; never publish this artifact.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/env.sh
qa_version="${1:?Usage: build-update-qa.sh VERSION CODE}"
qa_code="${2:?Usage: build-update-qa.sh VERSION CODE}"
mkdir -p .local artifacts/update-qa
saved_config="$(mktemp "$PWD/.local/qa-app-config.XXXXXX")"
cp app.json "$saved_config"
trap 'cp "$saved_config" "$project_path/app.json"; rm -f "$saved_config"' EXIT
project_path="$PWD"
python - "$qa_version" "$qa_code" <<'PY'
import json
from pathlib import Path
import re
import sys
assert re.fullmatch(r'\d+\.\d+\.\d+', sys.argv[1])
assert 0 < int(sys.argv[2]) < 2100000000
p=Path('app.json');d=json.loads(p.read_text());d['expo']['version']=sys.argv[1];d['expo']['android']['versionCode']=int(sys.argv[2]);p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
PY
(cd android && ./gradlew :app:assembleRelease :app:assembleReleaseAndroidTest -PreactNativeArchitectures=x86_64 --no-daemon --max-workers="${WORKSPACE_JOBS:-4}")
cp android/app/build/outputs/apk/release/app-x86_64-release.apk artifacts/update-qa/lime-updater-qa.apk
cp android/app/build/outputs/apk/androidTest/release/app-release-androidTest.apk artifacts/update-qa/verifier-test.apk
