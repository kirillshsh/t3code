#!/bin/bash
# Metro для dev-client сборки: JS-правки прилетают на телефон за секунды, без пересборки APK.
#   ./dev.sh          — поднять Metro и раздать его телефону
#   ./dev.sh --clear  — то же, но сбросить кэш бандлера (если Metro отдаёт старьё)
#
# Один раз ставится сама dev-сборка: ./apk.sh --dev. Пересобирать её нужно только когда меняется
# нативная часть — app.config.ts, plugins/, зависимости.
set -uo pipefail

export PATH="/Users/kirill/Library/Android/sdk/platform-tools:$PATH"
cd /Users/kirill/t3code/apps/mobile || exit 1

CLEAR=""
[ "${1:-}" = "--clear" ] && CLEAR="--clear"

# USB надёжнее: reverse отдаёт телефону порт Metro прямо с мака, и Wi-Fi вообще не нужен.
# --localhost тут нельзя: на macOS Metro сядет только на ::1, а adb reverse ходит на 127.0.0.1.
DEV=$(adb devices | awk '$2=="device" && $1 !~ /:/ {print $1; exit}')
if [ -n "$DEV" ]; then
  adb -s "$DEV" reverse tcp:8081 tcp:8081 >/dev/null 2>&1 \
    && echo "порт 8081 проброшен на $DEV" \
    || echo "reverse не прошёл, телефон возьмёт Metro по сети"
else
  echo "телефон по USB не виден — телефон должен быть в той же сети, что и мак"
fi

echo "открой на телефоне «T3 Code Dev». r в этом окне — перезагрузить приложение."
APP_VARIANT=development exec pnpm exec expo start --dev-client --scheme t3code-dev --lan $CLEAR
