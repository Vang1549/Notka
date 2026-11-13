#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TOOLS="${NOTKA_TOOLS:-/mnt/d/Tools/Notka}"
export JAVA_HOME="$TOOLS/jdk"
export ANDROID_HOME="$TOOLS/next/android-sdk"
export NOTKA_NEXT_KEYSTORE="$TOOLS/next/keys/notka-next.p12"
export NOTKA_NEXT_KEY_PASSWORD="$(cat "$TOOLS/next/keys/password.txt")"
exec "$TOOLS/venv/bin/python" "$ROOT/tools/release.py" --stage "$TOOLS/next/build/app/outputs/apk/release/app-release.apk" --notes "${1:?Pass a release notes text file}"
