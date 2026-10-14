#!/bin/bash
# ===== Утренний cross-check: по 1 пикy каждые 30 минут =====
# Запускается в 7:00 МСК, проверяет по одному пику за раз
# К 13:00 все пики проверены (6 часов = 12 слотов для ~5 пиков)
# Это избегает rate limit Nemotron:free
#
# ВАЖНО: Бейсбол — только Z.ai (skip). Теннис/баскетбол — cross-check (парадокс).

cd /home/z/my-project

# Проверяем один пик за раз
PICK_ID=$(node -e "
const{PrismaClient}=require('@prisma/client');
const db=new PrismaClient({log:['error']});
(async()=>{
  const today=new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Moscow'});
  const p=await db.storedPick.findFirst({
    where:{pickDate:today,crossCheckAgree:null},
    select:{id:true,team1:true},
    orderBy:{createdAt:'asc'}
  });
  if(p){console.log(p.id);}
  else{console.log('NONE');}
  await db.\$disconnect();
})();
" 2>/dev/null)

if [ "$PICK_ID" = "NONE" ] || [ -z "$PICK_ID" ]; then
  echo "$(date '+%H:%M:%S') No unchecked picks for today"
  exit 0
fi

echo "$(date '+%H:%M:%S') Checking pick: $PICK_ID"

# Запускаем cross-check для ОДНОГО пика (Nemotron, парадокс-промпт)
node -e "
const{PrismaClient}=require('@prisma/client');
const db=new PrismaClient({log:['error']});
const API_KEY='${OPENROUTER_API_KEY:-}';
const MODEL='nvidia/nemotron-3-ultra-550b-a55b:free';
const SKIP_SPORTS=new Set(['baseball']);

const SYS_PROMPT='Ты спортивный аналитик. Критически оцени пик Z.ai. ПАРАДОКС: когда ты НЕ согласен (disagree), пик выигрывает в 56%+ случаев. Твоя критика — ценный сигнал. Не соглашайся автоматически, но и не disagree без оснований. ВСЕГДА agree=true или false (НИКОГДА null). Если сомневаешься — false. Формат: {\"agree\":bool,\"confidence\":0-100,\"reasoning\":\"кратко по-русски\"}';

async function check(pick){
  const prompt='Оцени спортивный пик:\\nМатч: '+pick.team1+' vs '+pick.team2+'\\nСпорт: '+pick.sport+' ('+pick.league+')\\nРынок: '+pick.market+'\\nВыбор: '+pick.selection+'\\nКоэф: '+pick.odds+'\\nУверенность Z.ai: '+pick.confidenceScore+'%\\n\\nJSON: {\"agree\":true/false,\"confidence\":0-100,\"reasoning\":\"кратко по-русски\"}';
  try{
    const res=await fetch('https://openrouter.ai/api/v1/chat/completions',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+API_KEY},
      body:JSON.stringify({model:MODEL,messages:[{role:'system',content:SYS_PROMPT},{role:'user',content:prompt}],temperature:0.4,max_tokens:800}),
      signal:AbortSignal.timeout(45000)
    });
    if(!res.ok){console.log('HTTP '+res.status);return null;}
    const data=await res.json();
    const c=data.choices?.[0]?.message?.content;
    if(!c)return null;
    let cl=c.trim().replace(/\`\`\`json|\`\`\`/g,'').trim();
    const m=cl.match(/{[\\s\\S]*}/);
    if(m)cl=m[0];
    const p=JSON.parse(cl);
    const agree=p.agree===true?'agree':'disagree';
    const conf=Math.max(0,Math.min(100,Number(p.confidence)||50));
    let adj=pick.confidenceScore;
    if(agree==='agree')adj=Math.min(100,adj+10);
    else adj=Math.max(0,adj-15);
    return{agree,conf,reasoning:String(p.reasoning||'').slice(0,500),adj};
  }catch(e){console.log('Err:'+e.message);return null;}
}

(async()=>{
  const p=await db.storedPick.findUnique({where:{id:'$PICK_ID'},select:{id:true,team1:true,team2:true,sportKey:true,sport:true,league:true,market:true,selection:true,odds:true,confidenceScore:true}});
  if(!p){console.log('Pick not found');process.exit(0);}
  // БЕЙСБОЛ — skip (только Z.ai)
  if(SKIP_SPORTS.has(p.sportKey)){
    await db.storedPick.update({where:{id:p.id},data:{crossCheckedAt:new Date(),crossCheckModel:'skipped-baseball',crossCheckAgree:'agree',crossCheckConfidence:0,crossCheckReasoning:'Бейсбол: только Z.ai, без cross-check (Nemotron некомпетентен в MLB)',crossCheckScore:p.confidenceScore}});
    console.log('SKIP BASEBALL (Z only): '+p.team1);
    process.exit(0);
  }
  process.stdout.write(p.team1+' ['+p.sportKey+']: ');
  const r=await check(p);
  if(r){
    await db.storedPick.update({where:{id:p.id},data:{crossCheckedAt:new Date(),crossCheckModel:MODEL,crossCheckAgree:r.agree,crossCheckConfidence:r.conf,crossCheckReasoning:r.reasoning,crossCheckScore:r.adj}});
    console.log(r.agree+' ('+r.conf+')');
  }else{
    await db.storedPick.update({where:{id:p.id},data:{crossCheckedAt:new Date(),crossCheckModel:MODEL,crossCheckAgree:'disagree',crossCheckConfidence:0,crossCheckReasoning:'Пропущен: таймаут или ошибка API (помечено disagree)',crossCheckScore:p.confidenceScore}});
    console.log('SKIP (marked disagree)');
  }
  await db.\$disconnect();
})();
" 2>&1
