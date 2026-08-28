#!/bin/bash
# Сборка T3 Code для Android и установка на подключённый телефон.
#   ./build-android.sh          — release APK (автономный, JS внутри) + установка
#   ./build-android.sh debug    — debug APK, JS тянется с Metro (быстрые правки UI)
#   ./build-android.sh release --no-install  — только собрать
set -euo pipefail

REPO="/Users/kirill/t3code"
MOBILE="$REPO/apps/mobile"
KEYSTORE="/Users/kirill/t3code-backup/t3code-signing.keystore"
VARIANT="${1:-release}"

export APP_VARIANT=production
export EXPO_NO_GIT_STATUS=1
export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@21}"
export PATH="/Users/kirill/Library/Android/sdk/platform-tools:$PATH"

cd "$MOBILE"

# android/ в .gitignore и пересоздаётся prebuild-ом; подпись должна пережить это,
# иначе телефон откажется ставить обновление поверх (INSTALL_FAILED_UPDATE_INCOMPATIBLE).
if [ ! -d android ]; then
  npx expo prebuild --platform android
fi
cp "$KEYSTORE" android/app/debug.keystore
echo "sdk.dir=/Users/kirill/Library/Android/sdk" > android/local.properties

cd android
if [ "$VARIANT" = "debug" ]; then
  ./gradlew assembleDebug
  APK="app/build/outputs/apk/debug/app-debug.apk"
else
  ./gradlew assembleRelease
  APK="app/build/outputs/apk/release/app-release.apk"
fi

echo "APK: $MOBILE/android/$APK"
if [ "${2:-}" != "--no-install" ]; then
  adb install -r "$APK"
  echo "Установлено. Запуск:"
  adb shell monkey -p com.t3tools.t3code -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || true
fi

if [ "$VARIANT" = "debug" ]; then
  echo "Для debug-сборки запусти Metro отдельно: cd $MOBILE && npx expo start --dev-client"
fi
