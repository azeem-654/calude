#!/usr/bin/env bash
# Build an Android app.
#   ./build.sh customer|support debug|release [versionCode] [versionName]
# debug   → an .apk anyone can install by tapping it (for trying it on a phone)
# release → the .aab Google Play wants, plus a signed .apk, when ANDROID_KEYSTORE_*
#           are set (README.md, "Signing"); unsigned without them.
# Needs Java 21 and ANDROID_HOME (or the GitHub workflow, which has both).
set -euo pipefail
APP=${1:?customer or support}; KIND=${2:-debug}; VC=${3:-1}; VN=${4:-1.0}
cd "$(dirname "$0")/$APP"
npx cap sync android
# Push alerts only when this build can receive them: asking the plugin without
# google-services.json crashes the app (src/services/nativeApp.ts reads "; push").
CFG=android/app/src/main/assets/capacitor.config.json
if [ -s android/app/google-services.json ]; then
  sed -i.bak -E 's/\(([a-z]+); android\)/(\1; android; push)/' "$CFG" && rm -f "$CFG.bak"
fi
cd android
chmod +x gradlew
if [ "$KIND" = release ]; then
  ./gradlew --no-daemon -q bundleRelease assembleRelease -PversionCode="$VC" -PversionName="$VN"
  ls -la app/build/outputs/bundle/release/ app/build/outputs/apk/release/
else
  ./gradlew --no-daemon -q assembleDebug -PversionCode="$VC" -PversionName="$VN"
  ls -la app/build/outputs/apk/debug/
fi
