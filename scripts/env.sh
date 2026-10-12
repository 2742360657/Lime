#!/usr/bin/env bash
# source scripts/env.sh: reuse system tools or the single user toolchain.
LIME_PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
if [[ -f "$LIME_PROJECT_ROOT/.local/dev.env" ]]; then
  source "$LIME_PROJECT_ROOT/.local/dev.env"
fi
LIME_TOOLCHAIN_ROOT="${LIME_TOOLCHAIN_ROOT:-$HOME/.local/share/toolchains}"
for LIME_TOOL in node jdk17 android-sdk; do
  if [[ -d "$LIME_TOOLCHAIN_ROOT/$LIME_TOOL" ]]; then
    case "$LIME_TOOL" in
      node) LIME_NODE_DIR="${LIME_NODE_DIR:-$LIME_TOOLCHAIN_ROOT/node}" ;;
      jdk17) LIME_JDK_DIR="${LIME_JDK_DIR:-$LIME_TOOLCHAIN_ROOT/jdk17}" ;;
      android-sdk) LIME_ANDROID_SDK_DIR="${LIME_ANDROID_SDK_DIR:-$LIME_TOOLCHAIN_ROOT/android-sdk}" ;;
    esac
  fi
done
if [[ -n "${LIME_NODE_DIR:-}" ]]; then export PATH="$LIME_NODE_DIR/bin:$PATH"; fi
if [[ -n "${LIME_JDK_DIR:-}" ]]; then export JAVA_HOME="$LIME_JDK_DIR"; export PATH="$JAVA_HOME/bin:$PATH"; fi
if [[ -n "${LIME_ANDROID_SDK_DIR:-}" ]]; then export ANDROID_HOME="$LIME_ANDROID_SDK_DIR"; export ANDROID_SDK_ROOT="$ANDROID_HOME"; fi
if [[ -n "${ANDROID_HOME:-}" ]]; then export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"; fi
export GRADLE_USER_HOME="${LIME_GRADLE_CACHE:-$HOME/.cache/gradle}"
export npm_config_cache="${LIME_NPM_CACHE:-$HOME/.cache/npm}"
if [[ -n "${LIME_SIGNING_PROPERTIES:-}" ]]; then export LIME_SIGNING_PROPERTIES; fi
unset LIME_TOOL
