#!/bin/bash
# Собрать Android APK на сервере `sh` и поставить на телефон.
#   ./apk.sh                — запушить текущее состояние, собрать, скачать, установить
#   ./apk.sh --no-install   — только собрать и скачать
#   ./apk.sh --clean        — форсировать expo prebuild (после правок нативного конфига)
#
# Сборка идёт на сервере (12 ядер, тёплые кэши gradle): инкремент — около минуты вместо десятков
# минут на маке. Канал до сервера узкий (~1 МБ/с), поэтому APK приезжает rsync-дельтой: между
# сборками меняется в основном JS-бандл, остальные 80 МБ повторно не передаются.
# Сборка живёт на сервере отдельным процессом, так что обрыв ssh её не убивает — скрипт просто
# переподключается к логу.
set -uo pipefail

REPO="/Users/kirill/t3code"
HOST="sh"
REMOTE_RSYNC="/home/sh/.local/usr/bin/rsync"
REMOTE_LOG="/home/sh/logs/apk.log"
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
took() { echo "$(( ($(date +%s) - $1) / 60 ))м $(( ($(date +%s) - $1) % 60 ))с"; }

BRANCH=$(git branch --show-current)
[ -n "$BRANCH" ] || { echo "detached HEAD, переключись на ветку"; exit 1; }

# Ветка едет в форк best-effort: в общем дереве соседние сессии могут увести её вперёд, и это не
# повод не собирать. Собирается всегда снимок того, что прямо сейчас лежит на диске.
say "push fork/$BRANCH"
git push -q fork "HEAD:refs/heads/$BRANCH" 2>/dev/null \
  || say "ветка на форке разошлась, пушить придётся руками — на сборку это не влияет"

# Снимок собираем во временном индексе, настоящий индекс пользователя не трогаем.
# .claude/worktrees исключён явно: там чужие рабочие деревья на гигабайты.
REF="apk/$BRANCH"
say "снимок дерева в fork/$REF"
export GIT_INDEX_FILE="$REPO/.git/tmp-apk-index"
rm -f "$GIT_INDEX_FILE"
git read-tree HEAD && git add -A -- . ':!.claude/worktrees' || { echo "снимок не собрался"; exit 1; }
TREE=$(git write-tree)
unset GIT_INDEX_FILE
rm -f "$REPO/.git/tmp-apk-index"
SHA=$(git commit-tree "$TREE" -p HEAD -m "apk snapshot")
git push -qf fork "$SHA:refs/heads/$REF" || { echo "пуш снимка не прошёл"; exit 1; }

# Сборку запускаем отвязанной от ssh-сессии, иначе обрыв канала убивает её на середине.
T_BUILD=$(date +%s)
say "сборка на $HOST ($REF)"
scp -q "$REPO/scripts/remote-apk-build.sh" "$HOST:.t3-apk-remote.sh" || exit 1
ssh "$HOST" "rm -f $REMOTE_LOG; setsid nohup bash ~/.t3-apk-remote.sh '$REF' '$CLEAN' > $REMOTE_LOG 2>&1 < /dev/null & disown" \
  || { echo "не удалось запустить сборку"; exit 1; }

SEEN=0
IDLE=0
while :; do
  CHUNK=$(ssh -o ConnectTimeout=10 "$HOST" "tail -n +$((SEEN + 1)) $REMOTE_LOG 2>/dev/null")
  if [ $? -ne 0 ]; then
    IDLE=$((IDLE + 1))
    [ $IDLE -gt 20 ] && { echo "сервер не отвечает минуту, сдаюсь"; exit 1; }
    sleep 3; continue
  fi
  IDLE=0
  if [ -n "$CHUNK" ]; then
    printf '%s\n' "$CHUNK"
    SEEN=$((SEEN + $(printf '%s\n' "$CHUNK" | wc -l)))
    LAST="$CHUNK"
  else
    # Лог замер: либо сборка ещё думает (hermesc молчит минутами), либо процесс умер молча.
    ssh -o ConnectTimeout=10 "$HOST" 'kill -0 $(cat ~/logs/apk.pid 2>/dev/null) 2>/dev/null' \
      || { echo "сборка на сервере пропала, лог: $REMOTE_LOG"; exit 1; }
  fi
  case "${LAST:-}" in
    *"BUILD SUCCESSFUL"*) break ;;
    *"BUILD FAILED"*) exit 1 ;;
  esac
  sleep 3
done
say "сборка заняла $(took $T_BUILD)"

APK_PATH=$(ssh "$HOST" "grep '^APK_PATH=' $REMOTE_LOG | tail -1 | cut -d= -f2")
APK_SHA=$(ssh "$HOST" "grep '^APK_SHA=' $REMOTE_LOG | tail -1 | cut -d= -f2")
[ -n "$APK_PATH" ] || { echo "сервер не сказал, где APK"; exit 1; }

T_DL=$(date +%s)
say "скачиваю дельтой"
mkdir -p "$(dirname "$OUT")"
rsync --rsync-path="$REMOTE_RSYNC" --partial --inplace --progress -h \
      "$HOST:$APK_PATH" "$OUT" || exit 1

# Оборванная передача оставляет правдоподобный, но битый файл — телефон на нём спотыкается странно.
if [ -n "$APK_SHA" ] && [ "$(shasum -a 1 "$OUT" | cut -d' ' -f1)" != "$APK_SHA" ]; then
  echo "APK приехал битым, перезапусти ./apk.sh"; exit 1
fi
say "скачано за $(took $T_DL), $(du -h "$OUT" | cut -f1)"

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

say "всего $(took $T0)"
