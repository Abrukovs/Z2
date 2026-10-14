/* eslint-disable @typescript-eslint/no-require-imports */
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient({ log: ['error'] });

// Делаем stdout небуферизованным (flush после каждой строки)
// Иначе при перенаправлении в файл лог не обновляется до заполнения буфера 4KB
if (process.stdout._handle) {
  process.stdout._handle.setBlocking(true);
}

const API_KEY = '${OPENROUTER_API_KEY:-}';
const MODEL = 'nvidia/nemotron-3-ultra-550b-a55b:free';
const TIMEOUT_MS = 60000; // 60 сек жёсткий таймаут (Nemotron 550B медленный)

// Виды спорта, для которых работает парадокс (cross-check Nemotron)
// Теннис и баскетбол — Nemotron компетентен, парадокс подтверждён
// Бейсбол — только Z.ai, без cross-check (Nemotron некомпетентен в MLB)
const PARADOX_SPORTS = new Set(['tennis', 'basketball', 'football', 'hockey', 'esports', 'volleyball']);
const SKIP_SPORTS = new Set(['baseball']); // только Z.ai

function fetchWithTimeout(url, options, ms) {
  // Используем AbortSignal.timeout для надёжного прерывания fetch
  // Promise.race не прерывает сам fetch, AbortSignal — прерывает
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timeout));
}

// Системный промпт с объяснением парадокса
function buildSystemPrompt(sportKey) {
  return `Ты спортивный аналитик. Твоя задача — критически оценить пик другой ИИ-модели (Z.ai) и дать второе мнение.

ВАЖНО — ПАРАДОКС СТАВОК:
Эмпирически выявлено: когда ты (Nemotron) НЕ СОГЛАСЕН с пиком Z.ai, пик выигрывает в 56%+ случаев.
Это значит: твоя критика — ценный сигнал. Если видишь реальный изъян — не соглашайся (disagree).
Но не disagree ради disagree — только если действительно есть основания.

СПЕЦИФИКА ПО ВИДАМ СПОРТА:
- Теннис: обращай внимание на форму игрока, покрытие (хард/грунт/трава), личные встречи, усталость
- Баскетбол: форма команд, травмы лидеров, мотивация (плейофф vs регулярка), advantage площадки
- Футбол: составы, мотивация, погодные условия, история встреч
- Хоккей: вратари, усталость, бэк-ту-бэк матчи, физическая игра

ПРАВИЛА:
- Не соглашайся автоматически
- ВСЕГДА отвечай agree=true или agree=false (НИКОГДА null)
- Если сомневаешься — выбери false (disagree)
- Обоснование краткое, 1-2 предложения на русском

Формат ответа: {"agree": true/false, "confidence": 0-100, "reasoning": "..."}`;
}

async function crossCheckPick(pick) {
  const prompt = `Оцени спортивный пик:
Матч: ${pick.team1} vs ${pick.team2}
Спорт: ${pick.sport} (${pick.league})
Рынок: ${pick.market}
Рекомендация: ${pick.selection}
Коэф: ${pick.odds}
Уверенность ИИ: ${pick.confidenceScore}%

Ответи ТОЛЬКО JSON: {"agree": true/false, "confidence": 0-100, "reasoning": "кратко по-русски"}. ВАЖНО: agree только true или false, НИКОГДА null!`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: buildSystemPrompt(pick.sportKey) },
          { role: 'user', content: prompt }
        ],
        temperature: 0.4,
        max_tokens: 1000,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      console.log(`  HTTP ${res.status}`);
      return null;
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    let cleaned = content.trim().replace(/```json|```/g, '').trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) cleaned = match[0];

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (jsonErr) {
      // Nemotron может обрезать reasoning на max_tokens → невалидный JSON
      // Fallback: извлекаем agree и confidence regex'ом
      console.log(`  JSON parse failed, trying regex fallback...`);
      const agreeMatch = cleaned.match(/"agree"\s*:\s*(true|false)/i);
      const confMatch = cleaned.match(/"confidence"\s*:\s*(\d+)/i);
      const reasonMatch = cleaned.match(/"reasoning"\s*:\s*"([^"]*)/i);
      if (!agreeMatch) {
        console.log(`  Could not extract agree from: ${cleaned.slice(0, 150)}`);
        return null;
      }
      parsed = {
        agree: agreeMatch[1].toLowerCase() === 'true',
        confidence: confMatch ? Number(confMatch[1]) : 50,
        reasoning: reasonMatch ? reasonMatch[1] : '(обрезано)',
      };
      console.log(`  Regex fallback OK: agree=${parsed.agree}`);
    }
    const agree = parsed.agree === true ? 'agree' : 'disagree';
    const confidence = Math.max(0, Math.min(100, Number(parsed.confidence) || 50));

    let adjusted = pick.confidenceScore;
    if (agree === 'agree') adjusted = Math.min(100, adjusted + 10);
    else if (agree === 'disagree') adjusted = Math.max(0, adjusted - 15);

    return { agree, confidence, reasoning: String(parsed.reasoning || '').slice(0, 500), adjusted };
  } catch (e) {
    clearTimeout(timeout);
    if (e.name === 'AbortError') {
      console.log(`  TIMEOUT (${TIMEOUT_MS}ms)`);
    } else {
      console.log(`  Error: ${e.message}`);
    }
    return null;
  }
}

async function main() {
  const picks = await db.storedPick.findMany({
    where: { crossCheckAgree: null },
    select: { id: true, team1: true, team2: true, sport: true, sportKey: true, league: true, market: true, selection: true, odds: true, confidenceScore: true, pickDate: true },
    orderBy: { pickDate: 'asc' },
  });

  // Сортируем: бейсбол первым (быстро пропустится), потом остальные
  picks.sort((a, b) => {
    const aSkip = SKIP_SPORTS.has(a.sportKey) ? 0 : 1;
    const bSkip = SKIP_SPORTS.has(b.sportKey) ? 0 : 1;
    if (aSkip !== bSkip) return aSkip - bSkip;
    return a.pickDate.localeCompare(b.pickDate);
  });

  console.log(`Remaining: ${picks.length} picks`);
  console.log(`Paradox sports (cross-check): ${[...PARADOX_SPORTS].join(', ')}`);
  console.log(`Skip sports (Z only): ${[...SKIP_SPORTS].join(', ')}\n`);

  let processed = 0;
  let skipped = 0;
  let baseballSkipped = 0;

  for (const pick of picks) {
    // ПРОПУСКАЕМ ТОЛЬКО БЕЙСБОЛ — только Z.ai, без cross-check
    // Nemotron компетентен в теннисе/баскетболе/футболе → парадокс работает
    if (SKIP_SPORTS.has(pick.sportKey)) {
      await db.storedPick.update({
        where: { id: pick.id },
        data: {
          crossCheckedAt: new Date(),
          crossCheckModel: 'skipped-baseball',
          crossCheckAgree: 'agree',
          crossCheckConfidence: 0,
          crossCheckReasoning: 'Бейсбол: только Z.ai, без cross-check (Nemotron некомпетентен в MLB)',
          crossCheckScore: pick.confidenceScore,
        },
      });
      console.log(`${new Date().toLocaleTimeString()} SKIP BASEBALL: ${pick.team1} vs ${pick.team2} (Z only)`);
      baseballSkipped++;
      continue;
    }

    process.stdout.write(`${new Date().toLocaleTimeString()} ${pick.team1} vs ${pick.team2}: `);

    const result = await crossCheckPick(pick);

    if (result) {
      await db.storedPick.update({
        where: { id: pick.id },
        data: {
          crossCheckedAt: new Date(),
          crossCheckModel: MODEL,
          crossCheckAgree: result.agree,
          crossCheckConfidence: result.confidence,
          crossCheckReasoning: result.reasoning,
          crossCheckScore: result.adjusted,
        },
      });
      console.log(`${result.agree} (conf=${result.confidence})`);
      processed++;
    } else {
      // Помечаем как disagree (не uncertain!) — пользователь просил только agree/disagree
      // Ошибка/таймаут = пик не прошёл проверку, трактуем как несогласие
      await db.storedPick.update({
        where: { id: pick.id },
        data: {
          crossCheckedAt: new Date(),
          crossCheckModel: MODEL,
          crossCheckAgree: 'disagree',
          crossCheckConfidence: 0,
          crossCheckReasoning: 'Пропущен: таймаут или ошибка API (помечено disagree)',
          crossCheckScore: pick.confidenceScore,
        },
      });
      console.log('SKIP (marked disagree)');
      skipped++;
    }

    await new Promise(r => setTimeout(r, 2000));
  }

  console.log(`\nDONE: ${processed} processed, ${skipped} skipped (errors), ${baseballSkipped} baseball skipped (Z only)`);
  await db.$disconnect();
}

process.on('uncaughtException', (e) => { console.error('Uncaught:', e.message, e.stack); });
process.on('unhandledRejection', (e) => { console.error('Unhandled:', e); });
process.on('SIGTERM', () => { console.log('SIGTERM received, exiting...'); process.exit(0); });
process.on('SIGINT', () => { console.log('SIGINT received, exiting...'); process.exit(0); });
process.on('SIGHUP', () => { console.log('SIGHUP received (ignoring)'); });
process.on('SIGPIPE', () => { console.log('SIGPIPE received (ignoring)'); });

// Keepalive — чтобы процесс не закрывался
setInterval(() => {}, 1000000);

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
