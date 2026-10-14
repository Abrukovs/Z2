#!/bin/bash
# ===== Утренний runner: ГЕНЕРАЦИЯ → CROSS-CHECK =====
# Работает с 4:00 до 14:00 МСК (раньше начинаем — ловим вечерние и ночные матчи)
# 1. Сначала генерирует пики (через API сервера)
# 2. Потом проверяет по одному пикy каждые 30 мин
# К 13:00 все пики с бейджами Z+N
# ВАЖНО: матчи US Open night session начинаются в 02:00 МСК — 
# runner в 4:00 уже поймает завтрашние ночные матчи

cd /home/z/my-project

while true; do
  HOUR_MSK=$(TZ=Europe/Moscow date +%H)
  
  # Проверяем что сейчас между 4:00 и 14:00 МСК
  if [ "$HOUR_MSK" -lt 4 ] || [ "$HOUR_MSK" -ge 14 ]; then
    # Вне окна — спим 30 минут
    sleep 1800
    continue
  fi
  
  # Проверяем есть ли пики на сегодня ВООБЩЕ
  TODAY=$(TZ=Europe/Moscow date +%Y-%m-%d)
  TOTAL_TODAY=$(node -e "
    const{PrismaClient}=require('@prisma/client');
    const db=new PrismaClient({log:['error']});
    db.storedPick.count({where:{pickDate:'$TODAY'}}).then(r=>{
      console.log(r);
      db.\$disconnect();
    });
  " 2>/dev/null)
  
  # Если пиков нет — сначала ГЕНЕРИРУЕМ
  if [ "$TOTAL_TODAY" = "0" ] || [ -z "$TOTAL_TODAY" ]; then
    echo "$(TZ=Europe/Moscow date '+%H:%M:%S') No picks for today. Generating..."
    # Генерация через API сервера (force=1)
    curl -s --max-time 120 "http://localhost:3000/api/picks?force=1" > /dev/null 2>&1
    echo "$(TZ=Europe/Moscow date '+%H:%M:%S') Generation done. Waiting 10s..."
    sleep 10
    
    # Проверяем что пики появились
    TOTAL_TODAY=$(node -e "
      const{PrismaClient}=require('@prisma/client');
      const db=new PrismaClient({log:['error']});
      db.storedPick.count({where:{pickDate:'$TODAY'}}).then(r=>{
        console.log(r);
        db.\$disconnect();
      });
    " 2>/dev/null)
    
    if [ "$TOTAL_TODAY" = "0" ] || [ -z "$TOTAL_TODAY" ]; then
      echo "$(TZ=Europe/Moscow date '+%H:%M:%S') Generation failed (server may be down). Waiting 30 min."
      sleep 1800
      continue
    fi
    
    echo "$(TZ=Europe/Moscow date '+%H:%M:%S') Generated $TOTAL_TODAY picks. Starting cross-check..."
  fi
  
  # Проверяем есть ли НЕПРОВЕРЕННЫЕ пики
  REMAINING=$(node -e "
    const{PrismaClient}=require('@prisma/client');
    const db=new PrismaClient({log:['error']});
    db.storedPick.count({where:{crossCheckAgree:null}}).then(r=>{
      console.log(r);
      db.\$disconnect();
    });
  " 2>/dev/null)

  if [ "$REMAINING" = "0" ] || [ -z "$REMAINING" ]; then
    # Все проверены — спим 30 минут (проверим снова, вдруг новые появились)
    echo "$(TZ=Europe/Moscow date '+%H:%M:%S') All picks checked. Sleeping 30 min."
    sleep 1800
    continue
  fi

  echo "$(TZ=Europe/Moscow date '+%H:%M:%S') $REMAINING unchecked picks. Checking ONE..."
  
  # Проверяем ОДИН пик
  ./morning-crosscheck.sh
  
  # Ждём 30 минут до следующего пика
  echo "Waiting 30 min..."
  sleep 1800
done
