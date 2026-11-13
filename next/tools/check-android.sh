#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TOOLS="${NOTKA_TOOLS:-/mnt/d/Tools/Notka}"
export JAVA_HOME="$TOOLS/jdk"
export PATH="$JAVA_HOME/bin:$PATH"
export GRADLE_USER_HOME="$TOOLS/next/gradle-home"
export ANDROID_HOME="$TOOLS/next/android-sdk"
export ANDROID_USER_HOME="$TOOLS/next/android-user"
export NOTKA_BUILD_ROOT="$TOOLS/next/build"
export NOTKA_NEXT_KEYSTORE="$TOOLS/next/keys/notka-next.p12"
if [[ -f "$TOOLS/next/keys/password.txt" ]]; then
  export NOTKA_NEXT_KEY_PASSWORD="$(cat "$TOOLS/next/keys/password.txt")"
fi
args=(--no-daemon --project-cache-dir "$TOOLS/next/project-cache" --console=plain)
if [[ "${NOTKA_LOCAL_MAVEN:-0}" == 1 ]]; then
  args+=(-I "$ROOT/tools/local-maven.init.gradle.kts" -Dorg.gradle.internal.http.socketTimeout=1200000 -Dorg.gradle.internal.http.connectionTimeout=1200000)
fi
cd "$ROOT"
exec "$TOOLS/next/gradle-8.9/bin/gradle" "${args[@]}" "$@"
