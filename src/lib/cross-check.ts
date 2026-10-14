// ===== Cross-check модуль: второе мнение от Nemotron через OpenRouter =====
// Z.ai генерирует пики (основной LLM) → Nemotron проверяет каждый пик
// ПАРАДОКС: когда Nemotron НЕ согласен с Z.ai → пики выигрывают в 56%+ случаев
// Бейдж: Z (всегда зелёный) + N (зелёный=agree, красный=disagree)
//
// ВАЖНО: Cross-check работает НЕ для всех видов спорта:
// - Теннис, баскетбол, футбол, хоккей, киберспорт, волейбол → cross-check (парадокс)
// - Бейсбол → только Z.ai (Nemotron некомпетентен в MLB)

import type { Pick } from './picks-service';
import { db } from '@/lib/db';
import { getTeamsFormContext } from './standings-service';

// Z.ai SDK для бесплатного веб-поиска новостей
let zaiInstance: any = null;
async function getZai() {
  if (!zaiInstance) {
    const ZAI = (await import('z-ai-web-dev-sdk')).default;
    zaiInstance = await ZAI.create();
  }
  return zaiInstance;
}

/**
 * ИСКАТЬ НОВОСТИ О МАТЧЕ через бесплатный Z.ai веб-поиск.
 * Nemotron не имеет доступа к интернету — даём ему контекст:
 * - Текущий тренер (не путает Реброва с Мальдерой!)
 * - Травмы ключевых игроков
 * - Последние результаты
 * - Форма команд
 */
async function fetchMatchNews(team1: string, team2: string, league: string): Promise<string> {
  try {
    const zai = await getZai();
    const query = `${team1} ${team2} ${league} 2026 news injuries coach form`;
    const results = await zai.functions.invoke('web_search', { query, num: 5 });

    if (!results || !Array.isArray(results) || results.length === 0) return '';

    // Берём top 5 результатов, извлекаем сниппеты
    const snippets = results
      .slice(0, 5)
      .map((r: any, i: number) => `${i + 1}. ${r.name || ''}\n${r.snippet || ''}`)
      .join('\n\n')
      .slice(0, 2000); // лимим длину

    console.log(`[cross-check] Новости загружены для ${team1} vs ${team2} (${results.length} результатов)`);
    return snippets;
  } catch (e) {
    console.error('[cross-check] Ошибка загрузки новостей:', e);
    return '';
  }
}

export type CrossCheckAgree = 'agree' | 'disagree';

// Виды спорта, для которых работает парадокс (Nemotron компетентен)
const PARADOX_SPORTS = new Set(['tennis', 'basketball', 'football', 'hockey', 'esports', 'volleyball']);
// Только Z.ai, без cross-check
const SKIP_SPORTS = new Set(['baseball']);

export interface CrossCheckResult {
  agree: CrossCheckAgree;
  confidence: number;       // 0-100 — уверенность второй модели
  reasoning: string;        // краткое обоснование (по-русски)
  model: string;            // какая модель использовалась
  adjustedScore: number;    // итоговый скор с учётом cross-check
  checkedAt: string;        // ISO timestamp
  reasoningTokens?: number; // сколько токенов потрачено на reasoning
}

// ВАЖНО: читаем ключ ПРИ ВЫЗОВЕ функции, не при загрузке модуля
// Next.js с Turbopack может не передать env vars при запуске
function getApiKey(): string {
  return process.env.OPENROUTER_API_KEY || '';
}
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
// nvidia/nemotron-3-ultra-550b-a55b:free — мощная reasoning модель (550B параметров)
const DEFAULT_MODEL = process.env.CROSSCHECK_MODEL || 'nvidia/nemotron-3-ultra-550b-a55b:free';

// Проверка: нужно ли cross-check'ить этот вид спорта
export function shouldCrossCheck(sportKey: string): boolean {
  return PARADOX_SPORTS.has(sportKey) && !SKIP_SPORTS.has(sportKey);
}

// In-memory cache для одной сессии (чтобы не дублировать запросы)
const crossCheckCache = new Map<string, CrossCheckResult>();

/**
 * Выполнить cross-check пика через Nemotron.
 * Возвращает null если API недоступен, ключ не настроен, или вид спорта в skip-списке (бейсбол).
 */
export async function crossCheckPick(pick: Pick): Promise<CrossCheckResult | null> {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn('[cross-check] OPENROUTER_API_KEY не задан — пропускаю');
    return null;
  }

  // Бейсбол — только Z.ai, без cross-check
  if (SKIP_SPORTS.has(pick.sportKey)) {
    console.log(`[cross-check] ${pick.sportKey} skip (Z only): ${pick.id}`);
    return null;
  }

  // Кэш по id пика
  const cacheKey = pick.id;
  const cached = crossCheckCache.get(cacheKey);
  if (cached) return cached;

  // Загружаем standings для enrichment (W-L статистика команд)
  const formContext = await getTeamsFormContext(pick.sportKey, pick.team1, pick.team2);

  // ЗАГРУЖАЕМ НОВОСТИ через бесплатный Z.ai веб-поиск
  // Nemotron не имеет доступа к интернету — даём ему контекст:
  // тренер, травмы, форма, последние результаты
  const newsContext = await fetchMatchNews(pick.team1, pick.team2, pick.league);

  const prompt = buildPrompt(pick, formContext, newsContext);
  const model = DEFAULT_MODEL;

  try {
    const startTime = Date.now();
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://stavka-dnya.local',
        'X-Title': 'Stavka Dnya Cross-Check',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: `Ты спортивный аналитик и эксперт по ставкам. Твоя задача — критически оценить пик другой ИИ-модели (Z.ai) и дать второе мнение.

ВАЖНО — ПАРАДОКС СТАВОК:
Эмпирически выявлено: когда ты (Nemotron) НЕ СОГЛАСЕН с пиком Z.ai, пик выигрывает в 56%+ случаев.
Это значит: твоя критика — ценный сигнал. Если видишь реальный изъян — не соглашайся (disagree).
Но не disagree ради disagree — только если действительно есть основания.

СПЕЦИФИКА ПО ВИДАМ СПОРТА:
- Теннис: форма игрока, покрытие (хард/грунт/трава), личные встречи, усталость
- Баскетбол: форма команд, травмы лидеров, мотивация (плейофф vs регулярка), advantage площадки
- Футбол: составы, мотивация, погода, история встреч
- Хоккей: вратари, усталость, бэк-ту-бэк, физическая игра

ПРАВИЛА:
- Не соглашайся автоматически
- ВСЕГДА отвечай agree=true или agree=false (НИКОГДА null)
- Если сомневаешься — выбери false (disagree)
- Обоснование краткое, 1-2 предложения на русском

Формат ответа:
{
  "agree": true | false,
  "confidence": число от 0 до 100,
  "reasoning": "краткое обоснование на русском"
}`,
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.4,
        // Nemotron 550B — мощная reasoning модель, нужно больше токенов
        // ~500 на reasoning + ~150 на ответ + запас
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      console.error(`[cross-check] HTTP ${response.status} для пика ${pick.id}`);
      return null;
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message;
    const content = message?.content;
    // reasoning модели могут вернуть reasoning в отдельном поле
    const reasoningText = message?.reasoning || '';

    if (!content) {
      console.error('[cross-check] пустой ответ от модели (возможно не хватило токенов на reasoning)');
      if (reasoningText) {
        console.error('[cross-check] reasoning был:', reasoningText.slice(0, 200));
      }
      return null;
    }

    const parsed = parseJsonResponse(content);
    if (!parsed) {
      console.error('[cross-check] не удалось распарсить JSON:', content.slice(0, 200));
      return null;
    }

    const agree: CrossCheckAgree =
      parsed.agree === true ? 'agree' : 'disagree';

    const confidence = Math.max(0, Math.min(100, Number(parsed.confidence) || 50));
    const reasoning = String(parsed.reasoning || '').slice(0, 500);

    // Корректировка итогового скора
    const originalScore = pick.confidenceScore;
    let adjustedScore = originalScore;
    if (agree === 'agree') {
      // Оба согласны → +10 (макс 100)
      adjustedScore = Math.min(100, originalScore + 10);
    } else if (agree === 'disagree') {
      // Расхождение → -15 (мин 0)
      adjustedScore = Math.max(0, originalScore - 15);
    }
    // uncertain больше нет — только agree или disagree

    // Извлекаем количество reasoning токенов
    const reasoningTokens = data.usage?.completion_tokens_details?.reasoning_tokens || 0;

    const result: CrossCheckResult = {
      agree,
      confidence,
      reasoning,
      model,
      adjustedScore,
      checkedAt: new Date().toISOString(),
      reasoningTokens,
    };

    crossCheckCache.set(cacheKey, result);

    const elapsed = Date.now() - startTime;
    console.log(
      `[cross-check] ${pick.id}: ${agree} (conf=${confidence}, orig=${originalScore}→${adjustedScore}, reasoning=${reasoningTokens}tok) за ${elapsed}мс`,
    );

    return result;
  } catch (error) {
    console.error('[cross-check] ошибка:', error);
    return null;
  }
}

/**
 * Массовый cross-check массива пиков.
 * Выполняет запросы последовательно с задержкой (чтобы не превысить rate limit).
 */
export async function crossCheckPicks(
  picks: Pick[],
  options: { delayMs?: number } = {},
): Promise<Map<string, CrossCheckResult>> {
  const results = new Map<string, CrossCheckResult>();
  // gpt-oss-20b:free — reasoning модель, медленнее + free tier rate limit
  // Увеличенная задержка чтобы не получить 429
  const delay = options.delayMs ?? 2000; // 2 сек между запросами

  for (const pick of picks) {
    const result = await crossCheckPick(pick);
    if (result) {
      results.set(pick.id, result);
    }
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return results;
}

/**
 * Сохранить результат cross-check в БД.
 */
export async function saveCrossCheckResult(
  pickId: string,
  result: CrossCheckResult,
): Promise<void> {
  try {
    await db.storedPick.update({
      where: { id: pickId },
      data: {
        crossCheckedAt: new Date(result.checkedAt),
        crossCheckModel: result.model,
        crossCheckAgree: result.agree,
        crossCheckConfidence: result.confidence,
        crossCheckReasoning: result.reasoning,
        crossCheckScore: result.adjustedScore,
      },
    });
    console.log(`[cross-check] saved to DB: ${pickId} (${result.agree})`);
  } catch (error) {
    console.error('[cross-check] ошибка сохранения в БД:', error);
  }
}

// ===== Вспомогательные функции =====

function buildPrompt(pick: Pick, formContext: string = '', newsContext: string = ''): string {
  return `Оцени следующий спортивный пик, сгенерированный другой ИИ-моделью (Z.ai):

**Матч:** ${pick.team1} против ${pick.team2}
**Вид спорта:** ${pick.sport} (${pick.league})
**Время начала:** ${pick.startTime || 'не указано'}
**Рынок:** ${pick.market}
**Рекомендация ИИ:** ${pick.selection}
**Коэффициент:** ${pick.odds}
**Уверенность ИИ:** ${pick.confidenceScore}% (${pick.confidence})
${pick.reasoning ? `**Обоснование ИИ:** ${pick.reasoning}` : ''}
${formContext ? `\n**Текущая форма команд (из турнирной таблицы):**\n${formContext}` : ''}
${newsContext ? `\n=== СВЕЖИЕ НОВОСТИ ИЗ ВЕБ-ПОИСКА (Z.ai) ===\n${newsContext}\n\nВажно: используй эти новости для оценки. Тренер, травмы, форма — всё из свежих источников. Не полагайся на свои устаревшие знания — используй контекст выше!` : ''}

Вопросы для оценки:
1. Согласен ли ты с этой рекомендацией? (agree=true или agree=false, без null)
2. Какова твоя уверенность в исходе? (0-100)
3. Краткое обоснование твоего мнения (1-2 предложения на русском)

Учти:
- Используй данные о форме команд (винрейт, серия) для оценки
- Используй свежие новости выше (тренер, травмы, форма)
- Если данных недостаточно — всё равно выбери true или false
- Если коэффициент явно занижен или переоценен относительно формы команд — disagree
- Если рекомендация разумная и форма подтверждает — agree с confidence близкой к ИИ
- Если фаворит в плохой форме (серия поражений) — это повод для disagree
- Обоснование должно быть кратким и по делу`;
}

function parseJsonResponse(content: string): { agree?: boolean; confidence?: number; reasoning?: string } | null {
  // Удаляем markdown-обёртку если есть
  let cleaned = content.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // Пытаемся найти JSON в тексте
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Очистить кэш (для тестов и ручного перезапуска).
 */
export function clearCrossCheckCache(): void {
  crossCheckCache.clear();
}

/**
 * Получить статистику по cross-check из БД.
 */
export async function getCrossCheckStats(): Promise<{
  total: number;
  checked: number;
  agree: number;
  disagree: number;
  uncertain: number;
  agreeWinRate: number;
  disagreeWinRate: number;
  agreeRoi: number;
  disagreeRoi: number;
  // Nemotron (новая статистика)
  nemotronAgree: number;
  nemotronDisagree: number;
  nemotronAgreeWinRate: number;
  nemotronDisagreeWinRate: number;
  nemotronAgreeRoi: number;
  nemotronDisagreeRoi: number;
  // gpt-oss (старая статистика, историческая)
  gptossAgree: number;
  gptossDisagree: number;
  gptossAgreeWinRate: number;
  gptossDisagreeWinRate: number;
  gptossAgreeRoi: number;
  gptossDisagreeRoi: number;
}> {
  try {
    const all = await db.storedPick.findMany({});

    const calcWinRate = (picks: typeof all) => {
      const settled = picks.filter((p) => p.result === 'won' || p.result === 'lost' || p.result === 'push');
      const won = picks.filter((p) => p.result === 'won').length;
      return settled.length > 0 ? (won / settled.length) * 100 : 0;
    };

    const calcRoi = (picks: typeof all) => {
      let stake = 0;
      let ret = 0;
      for (const p of picks) {
        if (p.result === 'won') {
          stake += 1;
          const odds = parseFloat(p.odds.replace(',', '.'));
          ret += isFinite(odds) ? odds : 1;
        } else if (p.result === 'lost') {
          stake += 1;
        } else if (p.result === 'push') {
          stake += 1;
          ret += 1;
        }
      }
      const profit = ret - stake;
      return stake > 0 ? (profit / stake) * 100 : 0;
    };

    // Общая статистика (все модели)
    const checked = all.filter((p) => p.crossCheckAgree !== null && p.crossCheckAgree !== '').length;
    const agreePicks = all.filter((p) => p.crossCheckAgree === 'agree');
    const disagreePicks = all.filter((p) => p.crossCheckAgree === 'disagree');

    // Nemotron (новая статистика)
    const nemotronPicks = all.filter((p) => p.crossCheckModel?.includes('nemotron'));
    const nAgree = nemotronPicks.filter((p) => p.crossCheckAgree === 'agree');
    const nDisagree = nemotronPicks.filter((p) => p.crossCheckAgree === 'disagree');

    // gpt-oss (старая статистика)
    const gptossPicks = all.filter((p) => p.crossCheckModel?.includes('gpt-oss'));
    const gAgree = gptossPicks.filter((p) => p.crossCheckAgree === 'agree');
    const gDisagree = gptossPicks.filter((p) => p.crossCheckAgree === 'disagree');

    return {
      total: checked,
      checked,
      agree: agreePicks.length,
      disagree: disagreePicks.length,
      uncertain: all.filter((p) => p.crossCheckAgree === 'uncertain').length,
      agreeWinRate: calcWinRate(agreePicks),
      disagreeWinRate: calcWinRate(disagreePicks),
      agreeRoi: calcRoi(agreePicks),
      disagreeRoi: calcRoi(disagreePicks),
      // Nemotron
      nemotronAgree: nAgree.length,
      nemotronDisagree: nDisagree.length,
      nemotronAgreeWinRate: calcWinRate(nAgree),
      nemotronDisagreeWinRate: calcWinRate(nDisagree),
      nemotronAgreeRoi: calcRoi(nAgree),
      nemotronDisagreeRoi: calcRoi(nDisagree),
      // gpt-oss
      gptossAgree: gAgree.length,
      gptossDisagree: gDisagree.length,
      gptossAgreeWinRate: calcWinRate(gAgree),
      gptossDisagreeWinRate: calcWinRate(gDisagree),
      gptossAgreeRoi: calcRoi(gAgree),
      gptossDisagreeRoi: calcRoi(gDisagree),
    };
  } catch (error) {
    console.error('[cross-check] ошибка getCrossCheckStats:', error);
    return {
      total: 0, checked: 0, agree: 0, disagree: 0, uncertain: 0,
      agreeWinRate: 0, disagreeWinRate: 0, agreeRoi: 0, disagreeRoi: 0,
      nemotronAgree: 0, nemotronDisagree: 0, nemotronAgreeWinRate: 0, nemotronDisagreeWinRate: 0,
      nemotronAgreeRoi: 0, nemotronDisagreeRoi: 0,
      gptossAgree: 0, gptossDisagree: 0, gptossAgreeWinRate: 0, gptossDisagreeWinRate: 0,
      gptossAgreeRoi: 0, gptossDisagreeRoi: 0,
    };
  }
}
