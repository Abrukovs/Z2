/* eslint-disable @typescript-eslint/no-require-imports */
// ===== Cross-check ONE pick then exit =====
// Полная изоляция: один пик = один процесс node
// ВАЖНО: загружает свежие новости через Z.ai (бесплатный веб-поиск)
// и передаёт их Nemotron — чтобы он знал текущего тренера, травмы, форму

const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient({ log: ['error'] });

if (process.stdout._handle) process.stdout._handle.setBlocking(true);

const API_KEY = '${OPENROUTER_API_KEY:-}';
const MODEL = 'nvidia/nemotron-3-ultra-550b-a55b:free';
const TIMEOUT_MS = 90000;
const SKIP_SPORTS = new Set(['baseball']);

// ИСКАТЬ НОВОСТИ через бесплатный Z.ai веб-поиск
async function fetchMatchNews(team1, team2, league) {
  try {
    const ZAI = (await import('z-ai-web-dev-sdk')).default;
    const zai = await ZAI.create();
    const query = `${team1} ${team2} ${league} 2026 news injuries coach form`;
    const results = await zai.functions.invoke('web_search', { query, num: 5 });
    if (!results || !Array.isArray(results) || results.length === 0) return '';
    const snippets = results.slice(0, 5)
      .map((r, i) => `${i + 1}. ${r.name || ''}\n${r.snippet || ''}`)
      .join('\n\n').slice(0, 2000);
    console.log(`[news] Загружено ${results.length} новостей`);
    return snippets;
  } catch (e) {
    console.error('[news] Ошибка:', e.message);
    return '';
  }
}

function buildSystemPrompt() {
  return `Ты спортивный аналитик. Критически оцени пик Z.ai. ПАРАДОКС: когда ты НЕ согласен (disagree), пик выигрывает в 56%+ случаев. Твоя критика — ценный сигнал. Не соглашайся автоматически, но и не disagree без оснований. ВСЕГДА agree=true или false (НИКОГДА null). Если сомневаешься — false. Формат: {"agree":bool,"confidence":0-100,"reasoning":"кратко по-русски"}`;
}

async function main() {
  // Берём ОДИН unchecked пик (не бейсбол — бейсбол пропускаем отдельно)
  const pick = await db.storedPick.findFirst({
    where: { crossCheckAgree: null },
    select: { id: true, team1: true, team2: true, sport: true, sportKey: true, league: true, market: true, selection: true, odds: true, confidenceScore: true, pickDate: true },
    orderBy: { pickDate: 'asc' },
  });

  if (!pick) {
    console.log('NO_UNCHECKED');
    await db.$disconnect();
    return;
  }

  // Бейсбол — skip
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
    console.log(`SKIP_BASEBALL: ${pick.team1} vs ${pick.team2}`);
    await db.$disconnect();
    return;
  }

  console.log(`CHECK: ${pick.sportKey} | ${pick.team1} vs ${pick.team2}`);

  // ЗАГРУЖАЕМ СВЕЖИЕ НОВОСТИ через Z.ai (бесплатно!)
  const newsContext = await fetchMatchNews(pick.team1, pick.team2, pick.league);

  const prompt = `Матч: ${pick.team1} vs ${pick.team2}
Спорт: ${pick.sport} (${pick.league})
Рынок: ${pick.market}
Выбор: ${pick.selection}
Коэф: ${pick.odds}
Уверенность Z.ai: ${pick.confidenceScore}%
${newsContext ? `\n=== СВЕЖИЕ НОВОСТИ (из веб-поиска) ===\n${newsContext}\n\nИспользуй эти новости — не полагайся на устаревшие знания!` : ''}

JSON: {"agree":true/false,"confidence":0-100,"reasoning":"кратко по-русски"}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const start = Date.now();
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: buildSystemPrompt() },
          { role: 'user', content: prompt },
        ],
        temperature: 0.4,
        max_tokens: 2000, // увеличено: Nemotron тратит ~500 на reasoning + ~150 на ответ
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      console.log(`HTTP ${res.status}`);
      // Помечаем disagree
      await db.storedPick.update({
        where: { id: pick.id },
        data: {
          crossCheckedAt: new Date(),
          crossCheckModel: MODEL,
          crossCheckAgree: 'disagree',
          crossCheckConfidence: 0,
          crossCheckReasoning: `HTTP ${res.status} (помечено disagree)`,
          crossCheckScore: pick.confidenceScore,
        },
      });
      await db.$disconnect();
      return;
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      console.log('Empty response');
      await db.storedPick.update({
        where: { id: pick.id },
        data: {
          crossCheckedAt: new Date(),
          crossCheckModel: MODEL,
          crossCheckAgree: 'disagree',
          crossCheckConfidence: 0,
          crossCheckReasoning: 'Пустой ответ (помечено disagree)',
          crossCheckScore: pick.confidenceScore,
        },
      });
      await db.$disconnect();
      return;
    }

    let cleaned = content.trim().replace(/```json|```/g, '').trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) cleaned = match[0];

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // Fallback regex для обрезанного JSON
      const agreeMatch = cleaned.match(/"agree"\s*:\s*(true|false)/i);
      const confMatch = cleaned.match(/"confidence"\s*:\s*(\d+)/i);
      const reasonMatch = cleaned.match(/"reasoning"\s*:\s*"([^"]*)/i);
      if (!agreeMatch) {
        console.log(`PARSE_FAIL: ${cleaned.slice(0, 100)}`);
        await db.storedPick.update({
          where: { id: pick.id },
          data: {
            crossCheckedAt: new Date(),
            crossCheckModel: MODEL,
            crossCheckAgree: 'disagree',
            crossCheckConfidence: 0,
            crossCheckReasoning: 'Не удалось распарсить (помечено disagree)',
            crossCheckScore: pick.confidenceScore,
          },
        });
        await db.$disconnect();
        return;
      }
      parsed = {
        agree: agreeMatch[1].toLowerCase() === 'true',
        confidence: confMatch ? Number(confMatch[1]) : 50,
        reasoning: reasonMatch ? reasonMatch[1] : '(обрезано)',
      };
    }

    const agree = parsed.agree === true ? 'agree' : 'disagree';
    const confidence = Math.max(0, Math.min(100, Number(parsed.confidence) || 50));
    const adjusted = agree === 'agree'
      ? Math.min(100, pick.confidenceScore + 10)
      : Math.max(0, pick.confidenceScore - 15);

    await db.storedPick.update({
      where: { id: pick.id },
      data: {
        crossCheckedAt: new Date(),
        crossCheckModel: MODEL,
        crossCheckAgree: agree,
        crossCheckConfidence: confidence,
        crossCheckReasoning: String(parsed.reasoning || '').slice(0, 500),
        crossCheckScore: adjusted,
      },
    });

    const elapsed = Date.now() - start;
    console.log(`RESULT: ${agree} (conf=${confidence}, ${elapsed}ms)`);
  } catch (e) {
    clearTimeout(timeout);
    const errMsg = e.name === 'AbortError' ? `TIMEOUT (${TIMEOUT_MS}ms)` : e.message;
    console.log(`ERROR: ${errMsg}`);
    // Помечаем disagree
    await db.storedPick.update({
      where: { id: pick.id },
      data: {
        crossCheckedAt: new Date(),
        crossCheckModel: MODEL,
        crossCheckAgree: 'disagree',
        crossCheckConfidence: 0,
        crossCheckReasoning: `${errMsg} (помечено disagree)`,
        crossCheckScore: pick.confidenceScore,
      },
    });
  }

  await db.$disconnect();
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
