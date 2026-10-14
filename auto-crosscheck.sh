#!/bin/bash
cd /home/z/my-project
while true; do
  REMAINING=$(node -e 'const{PrismaClient}=require("@prisma/client");const db=new PrismaClient({log:["error"]});(async()=>{const r=await db.storedPick.count({where:{crossCheckAgree:null}});console.log(r);await db.$disconnect();})();' 2>/dev/null)
  if [ "$REMAINING" = "0" ] || [ -z "$REMAINING" ]; then
    echo "$(date +%H:%M:%S) ALL DONE"
    break
  fi
  echo "$(date +%H:%M:%S) Remaining: $REMAINING, starting..."
  node run-crosscheck.js >> /tmp/cc-autorestart.log 2>&1
  echo "$(date +%H:%M:%S) Script ended, waiting 5s before restart..."
  sleep 5
done
