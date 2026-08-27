#!/bin/bash
# Сборка Android APK на сервере `sh`. Запускается по stdin из apk.sh, локально не нужен.
#   bash -s <ref>   — ref: ветка форка, которую собираем
#
# Дорогие шаги (pnpm install, expo prebuild) выполняются только когда их вход изменился:
# состояние прошлой сборки лежит в ~/.t3-apk-state. Всё остальное чинит gradle-инкремент.
set -uo pipefail

REF="${1:-android-redesign}"
FORCE_PREBUILD="${2:-}"

export PATH="$HOME/.local/bin:$HOME/.local/usr/bin:$PATH"
export GIT_EXEC_PATH="$HOME/.local/usr/lib/git-core"
export PERL5LIB="$HOME/.local/usr/share/perl5"
source ~/.t3env

REPO="$HOME/t3code"
MOBILE="$REPO/apps/mobile"
STATE="$HOME/.t3-apk-state"
LOGS="$HOME/logs"
mkdir -p "$LOGS"

step() { echo "[$(date +%H:%M:%S)] $*"; }
fail() { echo "BUILD FAILED: $*"; exit 1; }

cd "$REPO" || fail "нет $REPO"

step "fetch fork/$REF"
git fetch --depth=1 -q fork "$REF" || fail "fetch"
git checkout -q -f -B apk FETCH_HEAD || fail "checkout"
step "на коммите $(git log --oneline -1)"

# Отпечатки входов дорогих шагов.
lock_hash() { sha1sum pnpm-lock.yaml 2>/dev/null | cut -c1-12; }
conf_hash() {
  { cat "$MOBILE/app.config.ts" "$MOBILE/package.json" 2>/dev/null
    find "$MOBILE/plugins" -type f 2>/dev/null | sort | xargs cat 2>/dev/null
  } | sha1sum | cut -c1-12
}
LOCK_NOW=$(lock_hash); CONF_NOW=$(conf_hash)
LOCK_OLD=""; CONF_OLD=""
[ -f "$STATE" ] && . "$STATE"

if [ "$LOCK_NOW" != "$LOCK_OLD" ]; then
  step "pnpm install (lockfile изменился)"
  pnpm install --config.confirmModulesPurge=false > "$LOGS/pnpm.log" 2>&1 \
    || pnpm install --ignore-scripts --config.confirmModulesPurge=false >> "$LOGS/pnpm.log" 2>&1 \
    || { tail -20 "$LOGS/pnpm.log"; fail "pnpm install"; }
else
  step "зависимости не менялись, install пропущен"
fi

cd "$MOBILE" || fail "нет $MOBILE"
export APP_VARIANT=production
export EXPO_NO_GIT_STATUS=1

if [ ! -d android ] || [ "$CONF_NOW" != "$CONF_OLD" ] || [ -n "$FORCE_PREBUILD" ]; then
  step "expo prebuild (нативный конфиг изменился)"
  npx expo prebuild --platform android --no-install > "$LOGS/prebuild.log" 2>&1 \
    || { tail -20 "$LOGS/prebuild.log"; fail "prebuild"; }
else
  step "нативный конфиг не менялся, prebuild пропущен"
fi

# Подпись тем же ключом, что и локальные сборки, иначе телефон не поставит обновление поверх.
cp "$HOME/t3code-signing.keystore" android/app/debug.keystore || fail "нет keystore"
echo "sdk.dir=$ANDROID_HOME" > android/local.properties

# gradle.properties пересоздаётся prebuild-ом, поэтому твики применяются каждый раз.
P=android/gradle.properties
sed -i 's/^reactNativeArchitectures=.*/reactNativeArchitectures=arm64-v8a/' "$P"
sed -i 's/^org.gradle.jvmargs=.*/org.gradle.jvmargs=-Xmx10240m -XX:MaxMetaspaceSize=2048m/' "$P"
for kv in "org.gradle.workers.max=12" "org.gradle.caching=true" "org.gradle.parallel=true" \
          "org.gradle.daemon=true" "kotlin.incremental=true" "kotlin.daemon.jvmargs=-Xmx4096m" \
          "org.gradle.configuration-cache=true"; do
  key="${kv%%=*}"
  grep -q "^$key=" "$P" || echo "$kv" >> "$P"
done

cd android
step "gradle assembleRelease"
START=$(date +%s)
./gradlew assembleRelease --parallel --build-cache > "$LOGS/build.log" 2>&1
RC=$?
if [ $RC -ne 0 ] && grep -qi "configuration cache" "$LOGS/build.log"; then
  step "configuration cache подвёл, повтор без него"
  ./gradlew assembleRelease --parallel --build-cache --no-configuration-cache > "$LOGS/build.log" 2>&1
  RC=$?
fi
if [ $RC -ne 0 ]; then
  grep -A12 "What went wrong" "$LOGS/build.log" | head -30
  tail -15 "$LOGS/build.log"
  fail "gradle (полный лог: ~/logs/build.log)"
fi

APK="$MOBILE/android/app/build/outputs/apk/release/app-release.apk"
[ -f "$APK" ] || fail "APK не появился"

# Отпечатки сохраняем только после успеха: упавшая сборка должна повторить свои шаги.
printf 'LOCK_OLD=%s\nCONF_OLD=%s\n' "$LOCK_NOW" "$CONF_NOW" > "$STATE"

step "готово за $(( ($(date +%s) - START) / 60 ))м $(( ($(date +%s) - START) % 60 ))с, $(du -h "$APK" | cut -f1)"
echo "APK_PATH=$APK"
echo "BUILD SUCCESSFUL"
