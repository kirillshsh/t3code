#!/bin/bash
# Собрать Android APK на сервере `sh` и поставить на телефон.
#   ./apk.sh                — запушить текущее состояние, собрать, скачать, установить
#   ./apk.sh --no-install   — только собрать и скачать
#   ./apk.sh --clean        — форсировать expo prebuild (после правок нативного конфига)
#
# Сборка идёт на сервере (12 ядер, тёплые кэши gradle), поэтому инкремент занимает минуты,
# а не десятки минут. Канал до сервера узкий (~1 МБ/с), поэтому APK приезжает rsync-дельтой:
# между сборками меняется в основном JS-бандл, остальные 80 МБ не передаются повторно.
set -uo pipefail

REPO="/Users/kirill/t3code"
HOST="sh"
REMOTE_RSYNC="/home/sh/.local/usr/bin/rsync"
OUT="/Users/kirill/t3code-backup/t3code-latest.apk"
PKG="com.t3tools.t3code"

INSTALL=1
CLEAN=""
for a in "$@"; do
  case "$a" in
    --no-install) INSTALL=0 ;;
    --clean) CLEAN=1 ;;
    *) echo "неизвестный флаг: $a"; exit 1 ;;
  esac
done

export PATH="/Users/kirill/Library/Android/sdk/platform-tools:$PATH"
cd "$REPO" || exit 1
T0=$(date +%s)
say() { echo "[$(date +%H:%M:%S)] $*"; }

BRANCH=$(git branch --show-current)
[ -n "$BRANCH" ] || { echo "detached HEAD, переключись на ветку"; exit 1; }

# Ветка форка едет всегда: собирается только то, что попало на GitHub.
say "push fork/$BRANCH"
git push -q fork "HEAD:refs/heads/$BRANCH" 2>&1 | tail -2

# Незакоммиченное собираем снимком в отдельной ветке, не трогая индекс пользователя.
# .claude/worktrees исключён явно: там чужие рабочие деревья на гигабайты.
if [ -n "$(git status --porcelain -- . ':!.claude/worktrees')" ]; then
  REF="wip/$BRANCH"
  say "дерево грязное, снимок в fork/$REF"
  export GIT_INDEX_FILE="$REPO/.git/tmp-apk-index"
  git read-tree HEAD
  git add -A -- . ':!.claude/worktrees'
  TREE=$(git write-tree)
  unset GIT_INDEX_FILE
  rm -f "$REPO/.git/tmp-apk-index"
  SHA=$(git commit-tree "$TREE" -p HEAD -m "apk snapshot")
  git push -qf fork "$SHA:refs/heads/$REF" || exit 1
else
  REF="$BRANCH"
fi

say "сборка на $HOST ($REF)"
ssh "$HOST" 'bash -s' -- "$REF" "$CLEAN" < "$REPO/scripts/remote-apk-build.sh" | tee /tmp/t3-apk-build.log
grep -q "BUILD SUCCESSFUL" /tmp/t3-apk-build.log || exit 1
APK_PATH=$(grep '^APK_PATH=' /tmp/t3-apk-build.log | tail -1 | cut -d= -f2)

say "скачиваю дельтой"
mkdir -p "$(dirname "$OUT")"
rsync --rsync-path="$REMOTE_RSYNC" --partial --inplace --info=progress2 \
      "$HOST:$APK_PATH" "$OUT" || exit 1
say "APK: $OUT ($(du -h "$OUT" | cut -f1))"

if [ "$INSTALL" = 1 ]; then
  # USB быстрее Wi-Fi, а один и тот же телефон часто виден обоими транспортами.
  DEV=$(adb devices | awk '$2=="device" && $1 !~ /:/ {print $1; exit}')
  [ -n "$DEV" ] || DEV=$(adb devices | awk '$2=="device" {print $1; exit}')
  if [ -z "$DEV" ]; then
    say "телефон не подключён, APK лежит в $OUT"
  else
    say "adb install на $DEV"
    adb -s "$DEV" install -r "$OUT" || exit 1
    adb -s "$DEV" shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
    say "установлено и запущено"
  fi
fi

say "всего $(( ($(date +%s) - T0) / 60 ))м $(( ($(date +%s) - T0) % 60 ))с"
