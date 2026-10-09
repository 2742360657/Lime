#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"
: "${ANDROID_HOME:?Configure the Android SDK in .local/dev.env}"
: "${ANDROID_AVD_HOME:?Configure LIME_AVD_DIR in .local/dev.env}"
LIME_EMULATOR_NAME="${LIME_AVD_NAME:-lime_api36}"
test -r /dev/kvm && test -w /dev/kvm
test -f "$ANDROID_AVD_HOME/$LIME_EMULATOR_NAME.ini"
exec "$ANDROID_HOME/emulator/emulator" -avd "$LIME_EMULATOR_NAME" -port 5554 \
  -no-window -no-audio -no-snapshot -no-boot-anim -no-metrics \
  -gpu software -accel on -cores 4 -memory 4096 -camera-back none -camera-front none
