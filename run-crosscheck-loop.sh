#!/bin/bash
# ===== Cross-check loop: один пик = один процесс node =====
# Полная изоляция процессов — решает проблему утечки ресурсов
cd /home/z/my-project

LOG=/tmp/crosscheck-loop.log
MAX_ITERATIONS=100
i=0

echo "=== Cross-check loop started $(date) ===" >> $LOG

while [ $i -lt $MAX_ITERATIONS ]; do
  i=$((i+1))

  # Запускаем one-pick процесс
  OUTPUT=$(node run-one-crosscheck.js 2>&1)
  echo "[$(date '+%H:%M:%S')] $OUTPUT" >> $LOG

  # Если нет unchecked пиков — выходим
  if echo "$OUTPUT" | grep -q "NO_UNCHECKED"; then
    echo "[$(date '+%H:%M:%S')] ALL DONE — no unchecked picks left" >> $LOG
    break
  fi

  # Небольшая пауза между пиками (чтобы не перегружать API)
  sleep 3
done

echo "=== Loop finished after $i iterations ===" >> $LOG
