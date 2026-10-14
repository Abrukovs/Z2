#!/bin/bash
# ===== Авто-push на GitHub =====
# Запускается каждые 30 минут через cron
# Коммитит все изменения и пушит на GitHub

cd /home/z/my-project

# Проверяем есть ли изменения
if git diff --quiet && git diff --cached --quiet && [ -z "$(git ls-files --others --exclude-standard)" ]; then
  # Нет изменений — выходим
  exit 0
fi

# Добавляем все изменения
git add -A

# Коммитим с датой/временем
TIMESTAMP=$(TZ=Europe/Moscow date '+%Y-%m-%d %H:%M МСК')
git commit -m "Авто-сохранение: $TIMESTAMP" --no-gpg-sign 2>/dev/null

# Пушим на GitHub
git push origin main 2>&1 | tail -5

echo "[$TIMESTAMP] Push на GitHub выполнен"
