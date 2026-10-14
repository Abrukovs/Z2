#!/bin/bash
# Обновляет результаты матчей по одной дате за раз
# С перезапуском сервера между датами (избегает OOM)

cd /home/z/my-project

DATES="20260802 20260803 20260804 20260805 20260806 20260807 20260808 20260809 20260810 20260811 20260812 20260813 20260814 20260815 20260816 20260817"

for date in $DATES; do
  echo "$(date '+%H:%M:%S') === Processing $date ==="
  
  # Проверяем что сервер жив
  if ! curl -s --max-time 5 http://localhost:3000/ > /dev/null 2>&1; then
    echo "  Server down, restarting..."
    pkill -9 -f "next" 2>/dev/null
    sleep 2
    nohup setsid /home/z/my-project/start-dev.sh < /dev/null > /home/z/my-project/dev.log 2>&1 &
    disown
    sleep 12
  fi
  
  # Запускаем stats API (триггерит updatePendingResults для этой даты)
  RESULT=$(curl -s --max-time 30 http://localhost:3000/api/stats 2>/dev/null)
  
  if [ -n "$RESULT" ]; then
    UPDATED=$(echo "$RESULT" | python3 -c "
import json,sys
try:
    d=json.load(sys.stdin)
    ci=d.get('checkInfo',{})
    print('checked:'+str(ci.get('checked',0))+' updated:'+str(ci.get('updated',0)))
except:
    print('error')
" 2>/dev/null)
    echo "  $UPDATED"
  else
    echo "  No response (server may have crashed)"
  fi
  
  sleep 5
done

echo ""
echo "=== Final stats ==="
# Restart server one more time
pkill -9 -f "next" 2>/dev/null
sleep 2
nohup setsid /home/z/my-project/start-dev.sh < /dev/null > /home/z/my-project/dev.log 2>&1 &
disown
sleep 12

curl -s --max-time 30 http://localhost:3000/api/stats 2>/dev/null | python3 -c "
import json,sys
d=json.load(sys.stdin)
print('Total:',d.get('total'))
print('Settled:',d.get('settled'))
print('Won:',d.get('won'),'| Lost:',d.get('lost'))
print('byDay:',len(d.get('byDay',[])))
" 2>/dev/null

echo ""
echo "$(date '+%H:%M:%S') DONE"
