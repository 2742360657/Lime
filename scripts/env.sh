#!/usr/bin/env bash
# Source this file: it configures build tools, never a product backend.
LIME_PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
if [[ -f "$LIME_PROJECT_ROOT/.local/dev.env" ]]; then
  source "$LIME_PROJECT_ROOT/.local/dev.env"
fi
if [[ -n "${LIME_EXPECTED_MOUNT:-}" ]]; then
  if ! mountpoint -q "$LIME_EXPECTED_MOUNT" || [[ "$LIME_PROJECT_ROOT" != "$LIME_EXPECTED_MOUNT"/* ]]; then
    printf '%s\n' 'Required development data mount is unavailable or does not contain this checkout.' >&2
    return 1 2>/dev/null || exit 1
  fi
fi
if [[ -n "${LIME_TOOLCHAIN_HOME:-}" ]]; then
  LIME_ANDROID_SDK_DIR="${LIME_ANDROID_SDK_DIR:-$LIME_TOOLCHAIN_HOME/android-sdk}"
  LIME_JDK_DIR="${LIME_JDK_DIR:-$LIME_TOOLCHAIN_HOME/tools/jdk17}"
  LIME_NODE_DIR="${LIME_NODE_DIR:-$LIME_TOOLCHAIN_HOME/tools/node}"
fi
if [[ -n "${LIME_ANDROID_SDK_DIR:-}" ]]; then
  export ANDROID_HOME="$LIME_ANDROID_SDK_DIR"
  export ANDROID_SDK_ROOT="$LIME_ANDROID_SDK_DIR"
fi
if [[ -n "${LIME_JDK_DIR:-}" ]]; then export JAVA_HOME="$LIME_JDK_DIR"; fi
if [[ -n "${JAVA_HOME:-}" ]]; then export PATH="$JAVA_HOME/bin:$PATH"; fi
if [[ -n "${ANDROID_HOME:-}" ]]; then
  export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
fi
if [[ -n "${LIME_NODE_DIR:-}" ]]; then export PATH="$LIME_NODE_DIR/bin:$PATH"; fi
export GRADLE_USER_HOME="${LIME_GRADLE_CACHE:-$LIME_PROJECT_ROOT/.local/cache/gradle}"
export npm_config_cache="${LIME_NPM_CACHE:-$LIME_PROJECT_ROOT/.local/cache/npm}"
export LIME_KEYSTORE_DIR="${LIME_KEYSTORE_DIR:-$LIME_PROJECT_ROOT/.local/signing}"
export ORG_GRADLE_PROJECT_LIME_KEYSTORE_DIR="$LIME_KEYSTORE_DIR"
