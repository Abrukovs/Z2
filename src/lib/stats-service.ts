// ====== Статистика пиков (без расхода LLM-токенов) ======
// Пики сохраняются в SQLite. Результаты подтягиваются из бесплатного ESPN API
// (для ЧМ/WNBA/MLB). Считаем ROI, win rate, прибыль — локально, бесплатно.

import { db } from '@/lib/db';
import type { Pick } from './picks-service';
import {
  getTodayEventsFromApi,
  type SportsEvent,
} from './sports-data';

export type PickResult = 'pending' | 'won' | 'lost' | 'push' | 'no_result';

export interface Stats {
  total: number;
  settled: number;     // с известным результатом (won + lost + push)
  pending: number;     // ожидают результата
  won: number;
  lost: number;
  push: number;
  noResult: number;    // нет авто-результата (теннис/киберспорт без ESPN)
  winRate: number;     // won / settled * 100
  totalStake: number;  // по 1 ед. на каждый settled пик
  totalReturn: number; // возврат (odds * 1 для won, 0 для lost, 1 для push)
  profit: number;      // totalReturn - totalStake
  roi: number;         // profit / totalStake * 100
  bySport: SportStat[];
  byConfidence: ConfidenceStat[];
  byDay: DayStat[];          // динамика прибыли/винрейта по дням (новое)
  streak: { current: number; type: 'won' | 'lost' | 'none'; best: number };  // серии (новое)
  bankrollCurve: BankrollPoint[];  // кривая капитала с просадками (новое)
  bankrollCurveCrossCheck: BankrollPoint[];  // кривая с учётом cross-check (disagree = 2 ставки)
  confidenceDistribution: ConfidenceBucket[];  // распределение по уровню уверенности (новое)
  maxDrawdown: number;  // максимальная просадка в % (новое)
  maxDrawdownCrossCheck: number;  // макс. просадка для cross-check банкролла
  bestDay: DayStat | null;  // лучший день по прибыли (новое)
  worstDay: DayStat | null;  // худший день по прибыли (новое)
  streakAnalysis: StreakAnalysis;  // детальный анализ серий (новое)
  oddsCorrelation: OddsBucket[];  // зависимость коэффициента от винрейта (новое)
  teamsLeaderboard: TeamLeaderEntry[];  // топ команд по winrate (новое)
}

export interface StreakAnalysis {
  maxWinStreak: number;       // максимальная серия побед
  maxLossStreak: number;      // максимальная серия поражений
  avgWinStreak: number;       // средняя длина серии побед
  avgLossStreak: number;      // средняя длина серии поражений
  totalWinStreaks: number;    // всего серий побед
  totalLossStreaks: number;   // всего серий поражений
  distribution: { length: number; count: number; type: 'won' | 'lost' }[];  // гистограмма: длина -> сколько раз
  recoveryTime: { avg: number; max: number };  // сколько ставок до восстановления после просадки
}

export interface OddsBucket {
  range: string;         // "1.0-1.5"
  min: number;
  max: number;
  total: number;
  settled: number;
  won: number;
  lost: number;
  winRate: number;
  profit: number;
  roi: number;
  avgOdds: number;       // средний коэффициент в бакете
}

export interface TeamLeaderEntry {
  team: string;
  sportKey: string;
  sport: string;
  icon: string;
  total: number;         // всего пиков с этой командой
  settled: number;
  won: number;
  lost: number;
  winRate: number;
  profit: number;
  roi: number;
}

export interface BankrollPoint {
  date: string;          // YYYY-MM-DD
  bankroll: number;      // текущий капитал (старт 100 ед.)
  profit: number;        // прибыль за день
  peak: number;          // пик капитала до этого момента (для расчёта drawdown)
  drawdown: number;      // просадка от пика в %
}

export interface ConfidenceBucket {
  range: string;         // "50-60%"
  min: number;           // 50
  max: number;           // 60
  total: number;         // всего пиков в этом диапазоне
  settled: number;
  won: number;
  lost: number;
  winRate: number;
  profit: number;
  roi: number;
}

export interface DayStat {
  date: string;        // YYYY-MM-DD
  picks: number;
  settled: number;
  won: number;
  lost: number;
  profit: number;      // за день
  cumulativeProfit: number;  // нарастающий итог
  roi: number;
}

export interface SportStat {
  sportKey: string;
  sport: string;
  icon: string;
  total: number;
  settled: number;
  won: number;
  lost: number;
  winRate: number;
  roi: number;
}

export interface ConfidenceStat {
  confidence: string;
  total: number;
  settled: number;
  won: number;
  winRate: number;
  roi: number;
}

// Сохранить свежесгенерированные пики в БД (без дубликатов по id)
// ВАЛИДАЦИЯ: пики из веб-поиска без sourceQuote отбраковываются (галлюцинации)
export async function savePicksToDb(picks: Pick[], pickDate: string) {
  if (!picks.length) return;
  try {
    // Фильтруем галлюцинированные пики
    const validPicks = picks.filter((p) => {
      const isFromApi = p.dataSource === 'ESPN API' || p.dataSource === 'API-Sports';
      // ESPN API-матчи — всегда валидны (источник точный)
      if (isFromApi) return true;
      // Веб-поиск — проверяем sourceQuote
      const quote = (p.sourceQuote || '').trim();
      if (quote.length < 15) {
        console.warn(`[savePicksToDb] ОТБРАКОВАН галлюцинация (нет sourceQuote): ${p.sportKey} ${p.team1} vs ${p.team2}`);
        return false;
      }
      // Проверяем что оба имени есть в цитате
      const t1 = (p.team1 || '').toLowerCase();
      const t2 = (p.team2 || '').toLowerCase();
      const q = quote.toLowerCase();
      // Берём ключевые части имён (≥4 символа)
      const t1Parts = t1.split(/\s+/).filter((s) => s.length >= 4);
      const t2Parts = t2.split(/\s+/).filter((s) => s.length >= 4);
      const t1InQuote = t1Parts.some((part) => q.includes(part));
      const t2InQuote = t2Parts.some((part) => q.includes(part));
      if (!t1InQuote || !t2InQuote) {
        console.warn(`[savePicksToDb] ОТБРАКОВАН (имена не в цитате): ${p.team1} vs ${p.team2} — quote="${quote.slice(0, 80)}"`);
        return false;
      }
      // АНТИ-СПИСОК: между именами должен быть разделитель матча (—, -, vs, против)
      // НЕ запятая (список игроков), НЕ точка (разные предложения)
      // Пример списка (галлюцинация): "Zverev, Auger-Aliassime, Fritz in action"
      // Пример матча (валидно): "Keys — Bondar", "Zverev vs Halys"
      // ИСКЛЮЧЕНИЕ: БШ-турниры — источник可信, принимаем если есть разделитель в цитате
      const t1Idx = t1Parts.map(part => q.indexOf(part)).filter(i => i >= 0);
      const t2Idx = t2Parts.map(part => q.indexOf(part)).filter(i => i >= 0);
      let hasMatchSeparator = false;
      for (const a of t1Idx) {
        for (const b of t2Idx) {
          const start = Math.min(a, b);
          const end = Math.max(a, b);
          const betweenText = q.slice(start, end + 30);
          if (/\s(—|-|–|vs\.?|v\.?|против|встречается|plays)\s/i.test(betweenText)) {
            hasMatchSeparator = true;
            break;
          }
        }
        if (hasMatchSeparator) break;
      }
      // БШ-исключение: если в цитате есть разделитель матча — принимаем
      const isSlamLeague = ['us open', 'уимблдон', 'wimbledon', 'roland garros', 'australian open'].some(
        (s) => (p.league || '').toLowerCase().includes(s)
      );
      const hasSepInQuote = /\s(—|-|–|vs\.?|v\.?|против)\s/i.test(q);
      const slamException = isSlamLeague && hasSepInQuote && quote.length >= 15;
      if (!hasMatchSeparator && !slamException) {
        console.warn(`[savePicksToDb] ОТБРАКОВАН (список, не матч — нет разделителя): ${p.team1} vs ${p.team2} — quote="${quote.slice(0, 80)}"`);
        return false;
      }
      return true;
    });

    if (validPicks.length === 0) {
      console.warn('[savePicksToDb] Все пики отбракованы как галлюцинации!');
      return;
    }

    const data = validPicks.map((p) => ({
      id: p.id,
      sportKey: p.sportKey,
      sport: p.sport,
      league: p.league,
      team1: p.team1,
      team2: p.team2,
      startTime: p.startTime,
      market: p.market,
      selection: p.selection,
      odds: p.odds,
      confidence: p.confidence,
      confidenceScore: p.confidenceScore,
      dataSource: p.dataSource,
      pickDate,
      // Сохраняем анализ и источник (чтобы пик не был "пустым" при загрузке из БД)
      reasoning: p.reasoning || null,
      risk: p.risk || null,
      sourceQuote: p.sourceQuote || null,
      sourceUrl: p.sourceUrl || null,
      sourceName: p.sourceName || null,
    }));
    // upsert — если пик уже есть (по id), не перезаписываем результат
    for (const d of data) {
      await db.storedPick.upsert({
        where: { id: d.id },
        create: d,
        update: {}, // не трогаем существующие (включая result)
      });
    }
    console.log(`[savePicksToDb] Сохранено ${data.length} пиков (отбраковано ${picks.length - validPicks.length} галлюцинаций)`);
  } catch (e) {
    console.error('[stats] savePicksToDb failed:', e);
  }
}

interface EspnEventWithScore {
  name?: string;
  date?: string;
  competitions?: Array<{
    competitors?: Array<{
      homeAway?: string;
      score?: string;
      team?: { displayName?: string };
    }>;
    status?: { type?: { completed?: boolean; detail?: string } };
  }>;
}

// Получить результаты завершённых матчей из ESPN по всем источникам
async function fetchEspnResults(
  dateYmd: string,
): Promise<{ home: string; away: string; homeScore: number; awayScore: number }[]> {
  const sources = [
    'soccer/fifa.world',
    'basketball/wnba',
    'baseball/mlb',
  ];
  const results: {
    home: string;
    away: string;
    homeScore: number;
    awayScore: number;
  }[] = [];
  const { exec } = await import('child_process');

  for (const path of sources) {
    const url = `https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard?dates=${dateYmd}`;
    await new Promise<void>((resolve) => {
      exec(
        `curl -s --compressed --max-time 15  "${url}"`,
        { encoding: 'utf8' },
        (err, stdout) => {
          if (err) {
            console.error(`[stats] ESPN curl failed for ${path} ${dateYmd}:`, err.message);
            resolve();
            return;
          }
          try {
            const data = JSON.parse(stdout) as { events?: EspnEventWithScore[]; code?: number };
            if (data.code) {
              console.error(`[stats] ESPN API error for ${path} ${dateYmd}:`, stdout.slice(0, 100));
              resolve();
              return;
            }
            for (const e of data.events || []) {
              const comp = e.competitions?.[0];
              if (!comp?.competitors || comp.competitors.length < 2) continue;
              // Считаем матч завершённым, если у обеих команд есть счёт > -1.
              // Раньше проверяли status.completed === true, но для ЧМ ESPN
              // иногда не ставит completed, хотя счёт уже есть.
              let home = '';
              let away = '';
              let homeScore: number | null = null;
              let awayScore: number | null = null;
              for (const c of comp.competitors) {
                const scoreStr = c.score;
                const score = scoreStr != null ? parseInt(scoreStr, 10) : NaN;
                if (c.homeAway === 'home') {
                  home = c.team?.displayName || '';
                  homeScore = score;
                } else if (c.homeAway === 'away') {
                  away = c.team?.displayName || '';
                  awayScore = score;
                }
              }
              if (
                home &&
                away &&
                homeScore !== null &&
                awayScore !== null &&
                !isNaN(homeScore) &&
                !isNaN(awayScore)
              ) {
                results.push({ home, away, homeScore, awayScore });
              }
            }
          } catch {
            // ignore parse error
          }
          resolve();
        },
      );
    });
    await new Promise((r) => setTimeout(r, 200));
  }
  return results;
}

// Нормализация имени для сравнения (без регистра, пробелов, спецсимволов)
function normName(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]/gi, '')
    .trim();
}

// Словарь рус→англ для сборных (ESPN отдаёт английские названия)
const NATIONAL_TEAM_RU_EN: Record<string, string> = {
  канада: 'canada',
  марокко: 'morocco',
  сша: 'unitedstates',
  америка: 'unitedstates',
  аргентина: 'argentina',
  бразилия: 'brazil',
  франция: 'france',
  германия: 'germany',
  испания: 'spain',
  португалия: 'portugal',
  италия: 'italy',
  англия: 'england',
  нидерланды: 'netherlands',
  голландия: 'netherlands',
  бельгия: 'belgium',
  хорватия: 'croatia',
  сербия: 'serbia',
  швейцария: 'switzerland',
  польша: 'poland',
  мексика: 'mexico',
  уругвай: 'uruguay',
  колумбия: 'colombia',
  перу: 'peru',
  чили: 'chile',
  эквадор: 'ecuador',
  япония: 'japan',
  южнаякорея: 'southkorea',
  корея: 'southkorea',
  австралия: 'australia',
  иран: 'iran',
  саудовскаяаравия: 'saudiarabia',
  катар: 'qatar',
  египет: 'egypt',
  сенегал: 'senegal',
  гана: 'ghana',
  нигерия: 'nigeria',
  камерун: 'cameroon',
  тунис: 'tunisia',
  марокко: 'morocco',
  алжир: 'algeria',
  кабо_верде: 'capeverde',
  кабоверде: 'capeverde',
  парагвай: 'paraguay',
  боливия: 'bolivia',
  венесуэла: 'venezuela',
  костарика: 'costarica',
  панама: 'panama',
  гондурас: 'honduras',
  сальвадор: 'elsalvador',
  ямайка: 'jamaica',
  исландия: 'iceland',
  швеция: 'sweden',
  норвегия: 'norway',
  дания: 'denmark',
  финляндия: 'finland',
  ирландия: 'ireland',
  шотландия: 'scotland',
  уэльс: 'wales',
  россия: 'russia',
  украина: 'ukraine',
  турция: 'turkey',
  греция: 'greece',
  румыния: 'romania',
  венгрия: 'hungary',
  чехия: 'czechrepublic',
  словакия: 'slovakia',
  словения: 'slovenia',
  австрия: 'austria',
  грузия: 'georgia',
};

// Нормализация имени с учётом рус→англ словаря
function normNameWithDict(s: string): string {
  const ru = s.toLowerCase().replace(/[^а-яё]/gi, '').trim();
  if (ru && NATIONAL_TEAM_RU_EN[ru]) {
    return NATIONAL_TEAM_RU_EN[ru];
  }
  return normName(s);
}

// Найти результат матча в ESPN-данных по именам команд
function findResult(
  espnResults: { home: string; away: string; homeScore: number; awayScore: number }[],
  team1: string,
  team2: string,
) {
  const t1 = normNameWithDict(team1);
  const t2 = normNameWithDict(team2);
  return espnResults.find((r) => {
    const h = normNameWithDict(r.home);
    const a = normNameWithDict(r.away);
    const matchDirect =
      (h.includes(t1.slice(0, 5)) || t1.includes(h.slice(0, 5))) &&
      (a.includes(t2.slice(0, 5)) || t2.includes(a.slice(0, 5)));
    const matchSwap =
      (a.includes(t1.slice(0, 5)) || t1.includes(a.slice(0, 5))) &&
      (h.includes(t2.slice(0, 5)) || t2.includes(h.slice(0, 5)));
    return matchDirect || matchSwap;
  });
}

// Определить результат пика по счёту и рынку.
// Поддерживаем базовые рынки: Победа 1 / Победа 2 / Победа X (ничья).
// Для тоталов/фор/сложных рынков — возвращаем 'no_result' (пользователь сам разметит).
function resolvePick(
  pick: {
    market: string;
    selection: string;
    team1: string;
    team2: string;
  },
  homeScore: number,
  awayScore: number,
  // какой команде соответствует team1: 'home' | 'away' | 'unknown'
  team1Side: 'home' | 'away' | 'unknown',
): PickResult {
  const m = (pick.market || '').toLowerCase();
  const sel = (pick.selection || '').toLowerCase();
  const t1lower = (pick.team1 || '').toLowerCase();
  const t2lower = (pick.team2 || '').toLowerCase();
  // Объединяем market + selection для поиска числа (тотал может быть в selection)
  const combined = `${pick.market || ''} ${pick.selection || ''}`;
  const combinedLower = combined.toLowerCase();

  // Победа команды 1: П1, Победа 1, Победа матча/Победитель/Moneyline (если selection = team1)
  const selHasTeam1 = t1lower.split(/\s+/).some((part) => part.length >= 4 && sel.includes(part));
  const selHasTeam2 = t2lower.split(/\s+/).some((part) => part.length >= 4 && sel.includes(part));
  const isMoneylineOrWin =
    m.includes('победа') ||
    m.includes('победитель') ||
    m.includes('moneyline') ||
    m.includes('ml') ||
    m.includes('исход') ||
    m.includes('to win') ||
    m.includes('winner');
  const isWin1 = isMoneylineOrWin && selHasTeam1 && !selHasTeam2;
  const isWin2 = isMoneylineOrWin && selHasTeam2 && !selHasTeam1;
  // Явные П1/П2 (когда selection тоже может содержать обе команды)
  const isWin1Explicit = m.includes('победа 1') || m.includes('п1');
  const isWin2Explicit = m.includes('победа 2') || m.includes('п2');

  // Ничья
  const isDraw = m.includes('ничья') || m.includes('draw') || (m.includes('х') && m.length <= 5);

  if (isWin1 || isWin2 || isWin1Explicit || isWin2Explicit) {
    const t1Score = team1Side === 'home' ? homeScore : awayScore;
    const t2Score = team1Side === 'home' ? awayScore : homeScore;
    // Защита от ложного 0:0 (ESPN не отдал счёт, но статус был completed).
    // В баскетболе/бейсболе/теннисе 0:0 невозможно — значит данных нет.
    if (t1Score === 0 && t2Score === 0) return 'no_result';
    const win1 = isWin1 || isWin1Explicit;
    if (t1Score > t2Score) return win1 ? 'won' : 'lost';
    if (t1Score < t2Score) return win1 ? 'lost' : 'won';
    return 'push'; // ничья в матче без ничьей в рынке — возврат
  }
  if (isDraw) {
    return homeScore === awayScore ? 'won' : 'lost';
  }
  // Фора (handicap): "Фора (-1.5)" или "Фора 1(-1.5)" или "Cardinals -1.5"
  // Парсим знак и число форы, определяем команду.
  const isHandicap = combinedLower.includes('фора') || combinedLower.includes('handicap') ||
    (/\(-?\d+\.?\d*\)/.test(combinedLower) && !combinedLower.includes('тотал'));
  if (isHandicap) {
    // Парсим линию форы: (-1.5) или -1.5 или 1(-1.5)
    const lineMatch = combinedLower.match(/\(?(-?\d+\.?\d*)\)?/);
    if (!lineMatch) return 'no_result';
    const line = parseFloat(lineMatch[1]);
    // Определяем команду: selection содержит имя команды, или "1"/"2"
    const isTeam1 = selHasTeam1 || combinedLower.includes('фора 1') || combinedLower.includes('cardinals') && t1lower.includes('cardinals');
    const isTeam2 = selHasTeam2 || combinedLower.includes('фора 2');
    if (!isTeam1 && !isTeam2) return 'no_result';
    const t1Score = team1Side === 'home' ? homeScore : awayScore;
    const t2Score = team1Side === 'home' ? awayScore : homeScore;
    if (t1Score === 0 && t2Score === 0) return 'no_result';
    // Применяем фору: если line отрицательная (-1.5), прибавляем к счёту команды
    if (isTeam1) {
      const adjusted = t1Score + line;
      if (adjusted > t2Score) return 'won';
      if (adjusted < t2Score) return 'lost';
      return 'push';
    } else {
      const adjusted = t2Score + line;
      if (adjusted > t1Score) return 'won';
      if (adjusted < t1Score) return 'lost';
      return 'push';
    }
  }

  // Тотал больше/меньше — парсим число из combined (market + selection)
  const tbMatch = combinedLower.match(/тотал\s*(?:больше|более|>|over)/i) || combinedLower.match(/over\s*\/?under.*over/i);
  const tmMatch = combinedLower.match(/тотал\s*(?:меньше|менее|<|under)/i) || combinedLower.match(/over\s*\/?under.*under/i);
  // Also English: "over 8.5", "under 7.5"
  const overEn = combinedLower.match(/\bover\b/);
  const underEn = combinedLower.match(/\bunder\b/);
  const numMatch = combinedLower.match(/(\d+\.?\d*)/);
  if ((tbMatch || overEn || tmMatch || underEn) && numMatch) {
    const line = parseFloat(numMatch[1]);
    const total = homeScore + awayScore;
    if (tbMatch || overEn) {
      if (total > line) return 'won';
      if (total < line) return 'lost';
      return 'push';
    }
    if (tmMatch || underEn) {
      if (total < line) return 'won';
      if (total > line) return 'lost';
      return 'push';
    }
  }
  return 'no_result';
}

// Главная функция: проверить и обновить результаты для всех pending пиков.
// Запускается при запросе /api/stats. Бесплатно (ESPN без токенов).
export async function updatePendingResults(): Promise<{
  checked: number;
  updated: number;
}> {
  let checked = 0;
  let updated = 0;
  try {
    // Берём все pending пики (не только ESPN — ЧМ-пики из веб-поиска тоже
    // можно проверить через ESPN, т.к. ESPN покрывает ЧМ).
    // Исключаем только теннис и киберспорт (ESPN их не покрывает детально).
    const pending = await db.storedPick.findMany({
      where: {
        result: 'pending',
        sportKey: { in: ['football', 'basketball', 'baseball'] },
      },
      take: 100,
    });
    if (!pending.length) return { checked: 0, updated: 0 };

    // Группируем по pickDate
    const byDate = new Map<string, typeof pending>();
    for (const p of pending) {
      const arr = byDate.get(p.pickDate) || [];
      arr.push(p);
      byDate.set(p.pickDate, arr);
    }

    for (const [date, picks] of byDate) {
      const dateEspn = date.replace(/-/g, '');
      const espnResults = await fetchEspnResults(dateEspn);
      checked += picks.length;
      for (const p of picks) {
        const r = findResult(espnResults, p.team1, p.team2);
        if (!r) continue;
        // Определяем, кто home/away в нашем пике
        const t1 = normNameWithDict(p.team1);
        const h = normNameWithDict(r.home);
        const team1Side: 'home' | 'away' | 'unknown' = h.includes(t1.slice(0, 5))
          ? 'home'
          : 'away';
        const res = resolvePick(p, r.homeScore, r.awayScore, team1Side);
        if (res === 'no_result') continue;
        await db.storedPick.update({
          where: { id: p.id },
          data: {
            result: res,
            homeScore: team1Side === 'home' ? r.homeScore : r.awayScore,
            awayScore: team1Side === 'home' ? r.awayScore : r.homeScore,
            resultCheckedAt: new Date(),
          },
        });
        updated += 1;
      }
    }
  } catch (e) {
    console.error('[stats] updatePendingResults failed:', e);
  }

  // ====== ТЕННИС: получение результатов через ESPN tennis API ======
  // ESPN tennis API отдаёт completed матчи с winner и linescores (счёт по сетам)
  // Используется для авто-результата теннисных пиков (ATP + WTA)
  // ВАЖНО: ESPN tennis API поддерживает параметр dates=YYYYMMDD для исторических
  // данных (Уимблдон, Цинциннати и т.д.), не только текущий US Open.
  try {
    const { fetchTennisResults, findTennisResult, transliterateRuToLat } = await import('./sports-data');

    // Берём все теннисные пики которые ещё pending (не завершены)
    const tennisPending = await db.storedPick.findMany({
      where: {
        sportKey: 'tennis',
        result: 'pending',
      },
    });

    // Группируем по pickDate — для каждой даты отдельный запрос к ESPN
    const byDate = new Map<string, typeof tennisPending>();
    for (const p of tennisPending) {
      const arr = byDate.get(p.pickDate) || [];
      arr.push(p);
      byDate.set(p.pickDate, arr);
    }

    let tennisUpdated = 0;
    for (const [date, picks] of byDate) {
      // Загружаем результаты за конкретную дату
      const tennisResults = await fetchTennisResults(date);
      if (tennisResults.length === 0) continue;

      for (const p of picks) {
        const r = findTennisResult(tennisResults, p.team1, p.team2);
        if (!r || r.status !== 'Final') continue;

        // Определяем won/lost по selection
        const p1Lat = r.player1Name.toLowerCase();
        const p2Lat = r.player2Name.toLowerCase();

        // Находим на какого игрока ставили (selection = имя игрока)
        const selLat = transliterateRuToLat(p.selection);
        const selParts = selLat.split(/\s+/).filter((s) => s.length >= 4);
        const selIsP1 = selParts.some((part) => p1Lat.includes(part));
        const selIsP2 = selParts.some((part) => p2Lat.includes(part));

        let result: 'won' | 'lost' | 'no_result' = 'no_result';
        let homeScore = 0;
        let awayScore = 0;

        const marketLower = p.market.toLowerCase();
        const isWinnerMarket = marketLower.includes('побед') || marketLower.includes('winner');
        const isTotalMarket = marketLower.includes('тотал') || marketLower.includes('больше') || marketLower.includes('меньше') || marketLower.includes('over') || marketLower.includes('under');

        if (isWinnerMarket) {
          // Рынок "Победитель матча" — selection = игрок
          // Для тенниса: homeScore/awayScore = количество выигранных сетов (не игр!)
          // Это даёт осмысленный счёт "2:0" или "1:2" вместо суммы игр
          const p1SetsWon = r.player1Sets.filter((_: number, i: number) => r.player1Sets[i] > r.player2Sets[i]).length;
          const p2SetsWon = r.player2Sets.filter((_: number, i: number) => r.player2Sets[i] > r.player1Sets[i]).length;

          if (selIsP1) {
            result = r.player1Winner ? 'won' : 'lost';
            homeScore = p1SetsWon;
            awayScore = p2SetsWon;
          } else if (selIsP2) {
            result = r.player2Winner ? 'won' : 'lost';
            homeScore = p2SetsWon;
            awayScore = p1SetsWon;
          }
        } else if (isTotalMarket) {
          // Рынок "Тотал игр" — selection = "Больше X" или "Меньше X"
          // Считаем общее количество игр в матче (сумма всех игр по сетам)
          const totalGames = [...r.player1Sets, ...r.player2Sets].reduce((a: number, b: number) => a + b, 0);

          // Извлекаем число из market или selection (например "21.5", "38.5")
          const numMatch = (p.market + ' ' + p.selection).match(/(\d+\.?\d*)/);
          const line = numMatch ? parseFloat(numMatch[1]) : 0;
          if (line === 0) continue;

          // Определяем больше/меньше
          const selLower = p.selection.toLowerCase();
          const isOver = selLower.includes('больше') || selLower.includes('более') || selLower.includes('over') || selLower.includes('больш');
          const isUnder = selLower.includes('меньше') || selLower.includes('under');

          if (isOver) {
            result = totalGames > line ? 'won' : 'lost';
          } else if (isUnder) {
            result = totalGames < line ? 'won' : 'lost';
          } else {
            continue;
          }

          // Счёт: общее количество игр
          homeScore = r.player1Sets.reduce((a: number, b: number) => a + b, 0);
          awayScore = r.player2Sets.reduce((a: number, b: number) => a + b, 0);
        } else {
          // Для других рынков (фора) — пока no_result
          continue;
        }

        if (result === 'no_result') continue;

        await db.storedPick.update({
          where: { id: p.id },
          data: {
            result,
            homeScore,
            awayScore,
            resultCheckedAt: new Date(),
          },
        });
        tennisUpdated += 1;
        console.log(`[stats] tennis result: ${p.team1} vs ${p.team2} → ${result} (${homeScore}:${awayScore})`);
      }
    }
    if (tennisUpdated > 0) {
      console.log(`[stats] tennis results updated: ${tennisUpdated} picks`);
    }
  } catch (e) {
    console.error('[stats] tennis results update failed:', e);
  }

  // ====== АВТО-NO_RESULT для неподдерживаемых видов спорта и ненайденных ======
  // 1. Киберспорт, хоккей — ESPN не покрывает детально.
  // 2. Баскетбол без WNBA (Летняя лига НБА и т.д.) — тоже не покрывает.
  // 3. Пики за прошлые дни (вчера и раньше), не найденные в ESPN — помечаем
  //    no_result, так как ESPN уже должен был отдать результат. Если не отдал —
  //    матч отменён или ESPN не покрывает этот турнир.
  // ВАЖНО: теннис теперь покрывается через ESPN tennis API (см. выше), поэтому
  // убран из автоматического no_result. Старые теннисные пики (вчера и раньше)
  // которые не нашлись в ESPN tennis — помечаются no_result.
  try {
    const yesterday = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const stillPending = await db.storedPick.findMany({
      where: {
        result: 'pending',
        OR: [
          // Киберспорт, хоккей, волейбол — ESPN не покрывает
          { sportKey: { in: ['esports', 'hockey', 'volleyball'] } },
          // Баскетбол, но не WNBA
          {
            sportKey: 'basketball',
            league: { not: { contains: 'WNBA' } },
          },
          // Вчерашние и старше пики (ESPN уже должен был отдать результат)
          { pickDate: { lt: yesterday } },
        ],
      },
    });
    for (const p of stillPending) {
      await db.storedPick.update({
        where: { id: p.id },
        data: { result: 'no_result', resultCheckedAt: new Date() },
      });
      updated += 1;
    }
    if (stillPending.length > 0) {
      console.log(
        `[stats] auto no_result: ${stillPending.length} picks (unsupported or stale)`,
      );
    }
  } catch (e) {
    console.error('[stats] auto no_result failed:', e);
  }

  return { checked, updated };
}

const SPORT_ICONS: Record<string, string> = {
  football: '⚽',
  basketball: '🏀',
  tennis: '🎾',
  hockey: '🏒',
  esports: '🎮',
  baseball: '⚾',
  volleyball: '🏐',
};

// Алиас для leaderboard (избегаем конфликта имён)
const SPORT_ICONS_DB_STATS = SPORT_ICONS;

// Посчитать итоговую статистику из БД
export async function computeStats(): Promise<Stats> {
  const all = await db.storedPick.findMany({ orderBy: { createdAt: 'asc' } });

  const total = all.length;
  const won = all.filter((p) => p.result === 'won').length;
  const lost = all.filter((p) => p.result === 'lost').length;
  const push = all.filter((p) => p.result === 'push').length;
  const noResult = all.filter((p) => p.result === 'no_result').length;
  const pending = all.filter((p) => p.result === 'pending').length;
  const settled = won + lost + push;

  // Финансы: по 1 ед. на каждый settled
  let totalStake = 0;
  let totalReturn = 0;
  for (const p of all) {
    if (p.result === 'won') {
      totalStake += 1;
      const odds = parseFloat(p.odds.replace(',', '.'));
      totalReturn += isFinite(odds) ? odds : 1;
    } else if (p.result === 'lost') {
      totalStake += 1;
      // return = 0
    } else if (p.result === 'push') {
      totalStake += 1;
      totalReturn += 1; // возврат
    }
  }
  const profit = totalReturn - totalStake;
  const roi = totalStake > 0 ? (profit / totalStake) * 100 : 0;
  const winRate = settled > 0 ? (won / settled) * 100 : 0;

  // По виду спорта
  const sportKeys = [...new Set(all.map((p) => p.sportKey))];
  const bySport: SportStat[] = sportKeys.map((key) => {
    const items = all.filter((p) => p.sportKey === key);
    const sw = items.filter((p) => p.result === 'won').length;
    const sl = items.filter((p) => p.result === 'lost').length;
    const sp = items.filter((p) => p.result === 'push').length;
    const sSettled = sw + sl + sp;
    let stake = 0;
    let ret = 0;
    for (const p of items) {
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
    const p = ret - stake;
    return {
      sportKey: key,
      sport: items[0]?.sport || key,
      icon: SPORT_ICONS[key] || '🏆',
      total: items.length,
      settled: sSettled,
      won: sw,
      lost: sl,
      winRate: sSettled > 0 ? (sw / sSettled) * 100 : 0,
      roi: stake > 0 ? (p / stake) * 100 : 0,
    };
  });

  // По уверенности
  const confKeys = ['high', 'medium', 'low'];
  const byConfidence: ConfidenceStat[] = confKeys.map((c) => {
    const items = all.filter((p) => p.confidence === c);
    const sw = items.filter((p) => p.result === 'won').length;
    const sl = items.filter((p) => p.result === 'lost').length;
    const sp = items.filter((p) => p.result === 'push').length;
    const sSettled = sw + sl + sp;
    let stake = 0;
    let ret = 0;
    for (const p of items) {
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
    const p = ret - stake;
    return {
      confidence: c,
      total: items.length,
      settled: sSettled,
      won: sw,
      winRate: sSettled > 0 ? (sw / sSettled) * 100 : 0,
      roi: stake > 0 ? (p / stake) * 100 : 0,
    };
  });

  // ===== Динамика по дням (для графика прибыли) =====
  // Группируем по pickDate, для каждого дня считаем profit от settled пиков этого дня.
  const dayMap = new Map<string, { picks: number; settled: number; won: number; lost: number; profit: number }>();
  for (const p of all) {
    const day = p.pickDate;
    if (!day) continue;
    let entry = dayMap.get(day);
    if (!entry) {
      entry = { picks: 0, settled: 0, won: 0, lost: 0, profit: 0 };
      dayMap.set(day, entry);
    }
    entry.picks += 1;
    if (p.result === 'won' || p.result === 'lost' || p.result === 'push') {
      entry.settled += 1;
      if (p.result === 'won') {
        entry.won += 1;
        const odds = parseFloat(p.odds.replace(',', '.'));
        entry.profit += isFinite(odds) ? odds - 1 : 0;
      } else if (p.result === 'lost') {
        entry.lost += 1;
        entry.profit -= 1;
      } else if (p.result === 'push') {
        // возврат — profit 0
      }
    }
  }
  // Сортируем по дате и считаем нарастающий итог
  const sortedDays = Array.from(dayMap.entries()).sort(([a], [b]) => a.localeCompare(b));
  let cumulative = 0;
  const byDay: DayStat[] = sortedDays.map(([date, e]) => {
    cumulative += e.profit;
    return {
      date,
      picks: e.picks,
      settled: e.settled,
      won: e.won,
      lost: e.lost,
      profit: Math.round(e.profit * 100) / 100,
      cumulativeProfit: Math.round(cumulative * 100) / 100,
      roi: e.settled > 0 ? Math.round((e.profit / e.settled) * 100 * 100) / 100 : 0,
    };
  });

  // ===== Серии (streak) =====
  // Берём только settled пики, отсортированные по дате создания (asc).
  // Считаем текущую серию побед/поражений подряд и лучшую серию побед.
  const settledPicks = all
    .filter((p) => p.result === 'won' || p.result === 'lost')
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  let currentStreak = 0;
  let currentType: 'won' | 'lost' | 'none' = 'none';
  let bestWonStreak = 0;
  let runningStreak = 0;
  let lastResult: 'won' | 'lost' | null = null;
  for (const p of settledPicks) {
    const r = p.result as 'won' | 'lost';
    if (lastResult === null) {
      currentStreak = 1;
      currentType = r;
    } else if (r === lastResult) {
      currentStreak += 1;
    } else {
      currentStreak = 1;
      currentType = r;
    }
    lastResult = r;
    if (r === 'won') {
      runningStreak += 1;
      if (runningStreak > bestWonStreak) bestWonStreak = runningStreak;
    } else {
      runningStreak = 0;
    }
  }
  // best = лучшая серия побед (положительная метрика)
  const bestStreak = bestWonStreak;

  // ===== Кривая банкролла (старт 100 ед.) =====
  // Стандартная кривая: каждый пик = 1 ед. ставки
  const START_BANKROLL = 100;
  let runningBank = START_BANKROLL;
  let peak = START_BANKROLL;
  let maxDrawdown = 0;
  const bankrollCurve: BankrollPoint[] = byDay.map((d) => {
    runningBank += d.profit;
    if (runningBank > peak) peak = runningBank;
    const drawdown = peak > 0 ? ((peak - runningBank) / peak) * 100 : 0;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    return {
      date: d.date,
      bankroll: Math.round(runningBank * 100) / 100,
      profit: d.profit,
      peak: Math.round(peak * 100) / 100,
      drawdown: Math.round(drawdown * 100) / 100,
    };
  });

  // ===== Кривая банкролла с учётом cross-check (Cross-Check Bankroll) =====
  // Логика ставок:
  // - C agree (Z+C зелёные) → 1 ед. (стандартная ставка)
  // - C disagree (C красный) → 2 ед. (удвоенная ставка — парадокс показывает высокий винрейт)
  // - C uncertain / не проверен → 1 ед. (стандартная)
  const dayMapCrossCheck = new Map<string, { profit: number }>();
  for (const p of all) {
    const day = p.pickDate;
    if (!day) continue;
    let entry = dayMapCrossCheck.get(day);
    if (!entry) {
      entry = { profit: 0 };
      dayMapCrossCheck.set(day, entry);
    }
    // Множитель ставки: 2 для disagree, 1 для остальных
    const stakeMultiplier = p.crossCheckAgree === 'disagree' ? 2 : 1;
    if (p.result === 'won') {
      const odds = parseFloat(p.odds.replace(',', '.'));
      entry.profit += isFinite(odds) ? (odds - 1) * stakeMultiplier : 0;
    } else if (p.result === 'lost') {
      entry.profit -= stakeMultiplier;
    } else if (p.result === 'push') {
      // возврат — profit 0 независимо от множителя
    }
  }
  const sortedDaysCC = Array.from(dayMapCrossCheck.entries()).sort(([a], [b]) => a.localeCompare(b));
  let runningBankCC = START_BANKROLL;
  let peakCC = START_BANKROLL;
  let maxDrawdownCC = 0;
  const bankrollCurveCrossCheck: BankrollPoint[] = sortedDaysCC.map(([date, e]) => {
    runningBankCC += e.profit;
    if (runningBankCC > peakCC) peakCC = runningBankCC;
    const drawdown = peakCC > 0 ? ((peakCC - runningBankCC) / peakCC) * 100 : 0;
    if (drawdown > maxDrawdownCC) maxDrawdownCC = drawdown;
    return {
      date,
      bankroll: Math.round(runningBankCC * 100) / 100,
      profit: Math.round(e.profit * 100) / 100,
      peak: Math.round(peakCC * 100) / 100,
      drawdown: Math.round(drawdown * 100) / 100,
    };
  });

  // ===== Распределение по уровню уверенности (гистограмма) =====
  // Бакеты: 0-50, 50-60, 60-70, 70-80, 80-90, 90-100
  const BUCKETS = [
    { min: 0, max: 50, label: '0-50%' },
    { min: 50, max: 60, label: '50-60%' },
    { min: 60, max: 70, label: '60-70%' },
    { min: 70, max: 80, label: '70-80%' },
    { min: 80, max: 90, label: '80-90%' },
    { min: 90, max: 101, label: '90-100%' },
  ];
  const confidenceDistribution: ConfidenceBucket[] = BUCKETS.map((b) => {
    const items = all.filter(
      (p) => p.confidenceScore >= b.min && p.confidenceScore < b.max,
    );
    const sw = items.filter((p) => p.result === 'won').length;
    const sl = items.filter((p) => p.result === 'lost').length;
    const sp = items.filter((p) => p.result === 'push').length;
    const settled = sw + sl + sp;
    let stake = 0;
    let ret = 0;
    for (const p of items) {
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
    return {
      range: b.label,
      min: b.min,
      max: b.max,
      total: items.length,
      settled,
      won: sw,
      lost: sl,
      winRate: settled > 0 ? Math.round((sw / settled) * 100 * 100) / 100 : 0,
      profit: Math.round(profit * 100) / 100,
      roi: stake > 0 ? Math.round((profit / stake) * 100 * 100) / 100 : 0,
    };
  });

  // ===== Лучший/худший день =====
  const settledDays = byDay.filter((d) => d.settled > 0);
  let bestDay: DayStat | null = null;
  let worstDay: DayStat | null = null;
  for (const d of settledDays) {
    if (!bestDay || d.profit > bestDay.profit) bestDay = d;
    if (!worstDay || d.profit < worstDay.profit) worstDay = d;
  }

  // ===== Streak analysis (детальный анализ серий) =====
  // Берём все settled пики (won/lost), отсортированные по createdAt
  const streakPicks = all
    .filter((p) => p.result === 'won' || p.result === 'lost')
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  // Считаем все серии (последовательности won или lost подряд)
  const winStreaks: number[] = [];
  const lossStreaks: number[] = [];
  let currentRunType: 'won' | 'lost' | null = null;
  let currentRunLen = 0;
  for (const p of streakPicks) {
    const r = p.result as 'won' | 'lost';
    if (r === currentRunType) {
      currentRunLen += 1;
    } else {
      // завершаем предыдущую серию
      if (currentRunType === 'won' && currentRunLen > 0) winStreaks.push(currentRunLen);
      else if (currentRunType === 'lost' && currentRunLen > 0) lossStreaks.push(currentRunLen);
      currentRunType = r;
      currentRunLen = 1;
    }
  }
  // финальная серия
  if (currentRunType === 'won' && currentRunLen > 0) winStreaks.push(currentRunLen);
  else if (currentRunType === 'lost' && currentRunLen > 0) lossStreaks.push(currentRunLen);

  const maxWinStreak = winStreaks.length > 0 ? Math.max(...winStreaks) : 0;
  const maxLossStreak = lossStreaks.length > 0 ? Math.max(...lossStreaks) : 0;
  const avgWinStreak = winStreaks.length > 0 ? winStreaks.reduce((a, b) => a + b, 0) / winStreaks.length : 0;
  const avgLossStreak = lossStreaks.length > 0 ? lossStreaks.reduce((a, b) => a + b, 0) / lossStreaks.length : 0;

  // Гистограмма распределения серий по длине (1-10+)
  const distributionMap = new Map<string, number>();
  const addToDist = (len: number, type: 'won' | 'lost') => {
    const bucket = len >= 10 ? '10+' : String(len);
    const key = `${type}-${bucket}`;
    distributionMap.set(key, (distributionMap.get(key) || 0) + 1);
  };
  winStreaks.forEach((l) => addToDist(l, 'won'));
  lossStreaks.forEach((l) => addToDist(l, 'lost'));

  const distribution: { length: number; count: number; type: 'won' | 'lost' }[] = [];
  for (let len = 1; len <= 10; len++) {
    const wCount = distributionMap.get(`won-${len === 10 ? '10+' : String(len)}`) || 0;
    const lCount = distributionMap.get(`lost-${len === 10 ? '10+' : String(len)}`) || 0;
    if (wCount > 0) distribution.push({ length: len, count: wCount, type: 'won' });
    if (lCount > 0) distribution.push({ length: len, count: lCount, type: 'lost' });
  }

  // Recovery time: сколько ставок нужно для восстановления после просадки
  // Считаем по bankrollCurve: после локального минимума — сколько дней до нового пика
  const recoveryTimes: number[] = [];
  for (let i = 1; i < bankrollCurve.length; i++) {
    if (bankrollCurve[i].drawdown > 0 && (i === 1 || bankrollCurve[i - 1].drawdown === 0)) {
      // начало просадки — ищем восстановление (когда bankroll >= peak снова)
      const startBank = bankrollCurve[i].bankroll;
      for (let j = i + 1; j < bankrollCurve.length; j++) {
        if (bankrollCurve[j].bankroll >= bankrollCurve[i].peak) {
          recoveryTimes.push(j - i);
          break;
        }
      }
    }
  }
  const avgRecovery = recoveryTimes.length > 0 ? recoveryTimes.reduce((a, b) => a + b, 0) / recoveryTimes.length : 0;
  const maxRecovery = recoveryTimes.length > 0 ? Math.max(...recoveryTimes) : 0;

  const streakAnalysis: StreakAnalysis = {
    maxWinStreak,
    maxLossStreak,
    avgWinStreak: Math.round(avgWinStreak * 100) / 100,
    avgLossStreak: Math.round(avgLossStreak * 100) / 100,
    totalWinStreaks: winStreaks.length,
    totalLossStreaks: lossStreaks.length,
    distribution,
    recoveryTime: {
      avg: Math.round(avgRecovery * 100) / 100,
      max: maxRecovery,
    },
  };

  // ===== Odds correlation (зависимость коэффициента от винрейта) =====
  // Бакеты: 1.0-1.5, 1.5-2.0, 2.0-2.5, 2.5-3.0, 3.0+
  const ODDS_BUCKETS = [
    { min: 1.0, max: 1.5, label: '1.0-1.5' },
    { min: 1.5, max: 2.0, label: '1.5-2.0' },
    { min: 2.0, max: 2.5, label: '2.0-2.5' },
    { min: 2.5, max: 3.0, label: '2.5-3.0' },
    { min: 3.0, max: 100, label: '3.0+' },
  ];
  const oddsCorrelation: OddsBucket[] = ODDS_BUCKETS.map((b) => {
    const items = all.filter((p) => {
      const odds = parseFloat(p.odds.replace(',', '.'));
      return isFinite(odds) && odds >= b.min && odds < b.max;
    });
    const sw = items.filter((p) => p.result === 'won').length;
    const sl = items.filter((p) => p.result === 'lost').length;
    const sp = items.filter((p) => p.result === 'push').length;
    const settled = sw + sl + sp;
    let stake = 0;
    let ret = 0;
    let oddsSum = 0;
    for (const p of items) {
      const odds = parseFloat(p.odds.replace(',', '.'));
      oddsSum += isFinite(odds) ? odds : 0;
      if (p.result === 'won') {
        stake += 1;
        ret += isFinite(odds) ? odds : 1;
      } else if (p.result === 'lost') {
        stake += 1;
      } else if (p.result === 'push') {
        stake += 1;
        ret += 1;
      }
    }
    const profit = ret - stake;
    return {
      range: b.label,
      min: b.min,
      max: b.max,
      total: items.length,
      settled,
      won: sw,
      lost: sl,
      winRate: settled > 0 ? Math.round((sw / settled) * 100 * 100) / 100 : 0,
      profit: Math.round(profit * 100) / 100,
      roi: stake > 0 ? Math.round((profit / stake) * 100 * 100) / 100 : 0,
      avgOdds: items.length > 0 ? Math.round((oddsSum / items.length) * 100) / 100 : 0,
    };
  });

  // ===== Teams leaderboard (топ команд по winrate) =====
  // Группируем по team1+team2, считаем winrate пиков где участвовала команда
  const teamMap = new Map<string, { total: number; settled: number; won: number; lost: number; profit: number; stake: number; sportKey: string; sport: string; icon: string }>();
  for (const p of all) {
    const teams = [p.team1, p.team2].filter(Boolean);
    for (const team of teams) {
      const key = `${team}__${p.sportKey}`;
      const e = teamMap.get(key) || { total: 0, settled: 0, won: 0, lost: 0, profit: 0, stake: 0, sportKey: p.sportKey, sport: p.sport, icon: SPORT_ICONS_DB_STATS[p.sportKey] || '🏆' };
      e.total += 1;
      const odds = parseFloat(p.odds.replace(',', '.'));
      if (p.result === 'won') {
        e.settled += 1;
        e.won += 1;
        e.stake += 1;
        e.profit += isFinite(odds) ? odds - 1 : 0;
      } else if (p.result === 'lost') {
        e.settled += 1;
        e.lost += 1;
        e.stake += 1;
        e.profit -= 1;
      } else if (p.result === 'push') {
        e.settled += 1;
        e.stake += 1;
      }
      teamMap.set(key, e);
    }
  }

  const teamsLeaderboard: TeamLeaderEntry[] = Array.from(teamMap.entries())
    .map(([key, v]) => {
      const [team] = key.split('__');
      return {
        team,
        sportKey: v.sportKey,
        sport: v.sport,
        icon: v.icon,
        total: v.total,
        settled: v.settled,
        won: v.won,
        lost: v.lost,
        winRate: v.settled > 0 ? Math.round((v.won / v.settled) * 100 * 100) / 100 : 0,
        profit: Math.round(v.profit * 100) / 100,
        roi: v.stake > 0 ? Math.round((v.profit / v.stake) * 100 * 100) / 100 : 0,
      };
    })
    .filter((t) => t.settled >= 2)  // минимум 2 рассчитанных пика
    .sort((a, b) => {
      // Сортировка: по winRate (при равном — по кол-ву пиков)
      if (b.winRate !== a.winRate) return b.winRate - a.winRate;
      return b.settled - a.settled;
    })
    .slice(0, 10);  // топ-10

  return {
    total,
    settled,
    pending,
    won,
    lost,
    push,
    noResult,
    winRate,
    totalStake,
    totalReturn: Math.round(totalReturn * 100) / 100,
    profit: Math.round(profit * 100) / 100,
    roi: Math.round(roi * 100) / 100,
    bySport,
    byConfidence,
    byDay,
    streak: {
      current: currentStreak,
      type: currentType,
      best: bestStreak,
    },
    bankrollCurve,
    bankrollCurveCrossCheck,
    confidenceDistribution,
    maxDrawdown: Math.round(maxDrawdown * 100) / 100,
    maxDrawdownCrossCheck: Math.round(maxDrawdownCC * 100) / 100,
    bestDay,
    worstDay,
    streakAnalysis,
    oddsCorrelation,
    teamsLeaderboard,
  };
}

// ====== СТАТИСТИКА КОМАНДЫ (для сравнения пика с историей) ======
// Ищет все пики в БД, где участвовала указанная команда (или похожая по имени),
// считает winrate этих пиков и возвращает последние N матчей.

export interface TeamMatch {
  id: string;
  pickDate: string;
  team1: string;
  team2: string;
  market: string;
  selection: string;
  odds: string;
  result: 'pending' | 'won' | 'lost' | 'push' | 'no_result';
  confidenceScore: number;
  league: string;
  sport: string;
  sportKey: string;
  sportIcon: string;
}

export interface TeamStats {
  team: string;
  totalMatches: number;       // всего матчей с этой командой в БД
  settledMatches: number;     // с известным результатом
  wonPicks: number;           // пиков на эту команду выиграно
  lostPicks: number;          // пиков на эту команду проиграно
  winRate: number;            // % выигранных пиков
  lastMatches: TeamMatch[];   // последние N матчей (по дате, убывание)
  // Распределение по лигам
  byLeague: { league: string; count: number; winRate: number }[];
  // Текущая серия побед/поражений (для hot/cold streak)
  streak: {
    type: 'hot' | 'cold' | 'none';
    count: number;        // количество подряд
    label: string;        // человекочитаемая подпись
  };
}

const SPORT_ICONS_DB: Record<string, string> = {
  football: '⚽', basketball: '🏀', tennis: '🎾',
  hockey: '🏒', esports: '🎮', baseball: '⚾', volleyball: '🏐',
};

// Нормализация имени команды для сравнения
function normalizeTeamName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\sа-яё]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function getTeamStats(
  teamName: string,
  limit = 5,
): Promise<TeamStats | null> {
  if (!teamName || teamName.length < 3) return null;

  try {
    const all = await db.storedPick.findMany({
      orderBy: { pickDate: 'desc' },
    });

    const target = normalizeTeamName(teamName);
    // Подстрочное совпадение (команда может быть в team1 или team2)
    const matches = all.filter((p) => {
      const t1 = normalizeTeamName(p.team1);
      const t2 = normalizeTeamName(p.team2);
      return t1.includes(target) || t2.includes(target) || target.includes(t1) || target.includes(t2);
    });

    if (matches.length === 0) return null;

    const totalMatches = matches.length;
    const wonPicks = matches.filter((p) => p.result === 'won').length;
    const lostPicks = matches.filter((p) => p.result === 'lost').length;
    const pushPicks = matches.filter((p) => p.result === 'push').length;
    const settledMatches = wonPicks + lostPicks + pushPicks;
    const winRate = settledMatches > 0 ? (wonPicks / settledMatches) * 100 : 0;

    const lastMatches: TeamMatch[] = matches.slice(0, limit).map((p) => ({
      id: p.id,
      pickDate: p.pickDate,
      team1: p.team1,
      team2: p.team2,
      market: p.market,
      selection: p.selection,
      odds: p.odds,
      result: p.result as TeamMatch['result'],
      confidenceScore: p.confidenceScore,
      league: p.league,
      sport: p.sport,
      sportKey: p.sportKey,
      sportIcon: SPORT_ICONS_DB[p.sportKey] || '🏆',
    }));

    // По лигам
    const leagueMap = new Map<string, { count: number; won: number; settled: number }>();
    for (const m of matches) {
      const e = leagueMap.get(m.league) || { count: 0, won: 0, settled: 0 };
      e.count += 1;
      if (m.result === 'won') {
        e.won += 1;
        e.settled += 1;
      } else if (m.result === 'lost' || m.result === 'push') {
        e.settled += 1;
      }
      leagueMap.set(m.league, e);
    }
    const byLeague = Array.from(leagueMap.entries())
      .map(([league, v]) => ({
        league,
        count: v.count,
        winRate: v.settled > 0 ? (v.won / v.settled) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    // ===== Серия (streak) =====
    // Берём последние settled матчи (по убыванию даты) и считаем сколько подряд won/lost
    const recentSettled = matches
      .filter((p) => p.result === 'won' || p.result === 'lost')
      .slice(0, 10); // достаточно для подсчёта серии
    let streakType: 'hot' | 'cold' | 'none' = 'none';
    let streakCount = 0;
    if (recentSettled.length > 0) {
      const lastResult = recentSettled[0].result;
      if (lastResult === 'won' || lastResult === 'lost') {
        for (const m of recentSettled) {
          if (m.result === lastResult) {
            streakCount += 1;
          } else {
            break;
          }
        }
        if (streakCount >= 2) {
          streakType = lastResult === 'won' ? 'hot' : 'cold';
        }
      }
    }
    const streakLabel =
      streakType === 'hot'
        ? `🔥 Серия из ${streakCount} ${pluralize(streakCount, 'победы', 'побед', 'побед')} подряд`
        : streakType === 'cold'
          ? `❄️ Серия из ${streakCount} ${pluralize(streakCount, 'поражения', 'поражений', 'поражений')} подряд`
          : 'Нет активной серии';

    return {
      team: teamName,
      totalMatches,
      settledMatches,
      wonPicks,
      lostPicks,
      winRate: Math.round(winRate * 100) / 100,
      lastMatches,
      byLeague,
      streak: {
        type: streakType,
        count: streakCount,
        label: streakLabel,
      },
    };
  } catch (e) {
    console.error('[team-stats] error:', e);
    return null;
  }
}

// Хелпер для плюрализации русских слов
function pluralize(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}
