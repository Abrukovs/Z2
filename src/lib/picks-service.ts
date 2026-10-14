import ZAI from 'z-ai-web-dev-sdk';
import {
  getTodayEventsFromApi,
  filterUpcoming,
  type SportsEvent,
} from './sports-data';
import {
  getVolleyballEvents,
  filterUpcomingVolleyball,
  type VolleyballEvent,
} from './volleyball-data';
import { savePicksToDb } from './stats-service';

export type Confidence = 'low' | 'medium' | 'high';

export interface Pick {
  id: string;
  sport: string;       // Человекочитаемое название (Футбол)
  sportKey: string;    // Ключ (football)
  sportIcon: string;   // Эмодзи
  league: string;
  team1: string;
  team2: string;
  startTime: string;   // HH:MM
  market: string;      // Рынок (Победа 1, Тотал, Обе забьют ...)
  selection: string;   // Конкретная рекомендация
  odds: string;        // Коэффициент, напр. "1.85"
  confidence: Confidence;
  confidenceScore: number; // 0-100
  reasoning: string;   // Анализ
  risk: string;        // Примечание о риске
  sourceQuote: string; // Точная цитата из источника, доказывающая реальность матча
  sourceUrl: string;   // URL источника
  sourceName: string;  // Название источника (host)
  dataSource: string;  // 'ESPN API' | 'Веб-поиск' — источник расписания
  generatedAt: string; // ISO timestamp генерации
  // ===== Cross-check поля (второе мнение от DeepSeek) =====
  crossCheckAgree?: 'agree' | 'disagree' | 'uncertain' | null;
  crossCheckConfidence?: number | null;
  crossCheckReasoning?: string | null;
  crossCheckScore?: number | null;
  crossCheckModel?: string | null;
}

interface CacheEntry {
  picks: Pick[];
  ts: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 часа — пики стабильны весь день, кэш-ключ привязан к дате

// ====== СЧЁТЧИК API-ЗАПРОСОВ (in-memory, за время работы процесса) ======
interface UsageStats {
  webSearchCalls: number;
  llmCalls: number;
  totalCalls: number;
  cacheHits: number;
  generations: number;
  sessionStart: string;
  lastCallAt: string | null;
}

const usage: UsageStats = {
  webSearchCalls: 0,
  llmCalls: 0,
  totalCalls: 0,
  cacheHits: 0,
  generations: 0,
  sessionStart: new Date().toISOString(),
  lastCallAt: null,
};

function bumpWebSearch(n = 1) {
  usage.webSearchCalls += n;
  usage.totalCalls += n;
  usage.lastCallAt = new Date().toISOString();
}

function bumpLLM() {
  usage.llmCalls += 1;
  usage.totalCalls += 1;
  usage.lastCallAt = new Date().toISOString();
}

export function getUsage() {
  return { ...usage };
}

// ====== АРХИВ ПИКОВ ПО ДАТЕ ======
// Загружает пики за указанную дату (YYYY-MM-DD) из БД.
// Используется для просмотра исторических пиков (архив).
// Возвращает только пики этой даты + результат каждого (won/lost/pending).
export interface ArchivedPick extends Pick {
  result: 'pending' | 'won' | 'lost' | 'push' | 'no_result';
  homeScore: number | null;
  awayScore: number | null;
}

export async function getArchivedPicks(date: string): Promise<ArchivedPick[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return [];
  }
  try {
    const { db } = await import('@/lib/db');
    const saved = await db.storedPick.findMany({
      where: { pickDate: date },
      orderBy: { createdAt: 'asc' },
    });
    const SPORT_ICONS_DB: Record<string, string> = {
      football: '⚽', basketball: '🏀', tennis: '🎾',
      hockey: '🏒', esports: '🎮', baseball: '⚾', volleyball: '🏐',
    };
    return saved.map((p) => ({
      id: p.id,
      sport: p.sport,
      sportKey: p.sportKey,
      sportIcon: SPORT_ICONS_DB[p.sportKey] || '🏆',
      league: p.league,
      team1: p.team1,
      team2: p.team2,
      startTime: p.startTime,
      market: p.market,
      selection: p.selection,
      odds: p.odds,
      confidence: p.confidence as Confidence,
      confidenceScore: p.confidenceScore,
      reasoning: '',
      risk: '',
      sourceQuote: '',
      sourceUrl: '',
      sourceName: '',
      dataSource: p.dataSource,
      generatedAt: p.createdAt.toISOString(),
      // Cross-check поля
      crossCheckAgree: (p.crossCheckAgree as ArchivedPick['crossCheckAgree']) ?? null,
      crossCheckConfidence: p.crossCheckConfidence ?? null,
      crossCheckReasoning: p.crossCheckReasoning ?? null,
      crossCheckScore: p.crossCheckScore ?? null,
      crossCheckModel: p.crossCheckModel ?? null,
      result: p.result as ArchivedPick['result'],
      homeScore: p.homeScore,
      awayScore: p.awayScore,
    }));
  } catch (e) {
    console.error('[picks] getArchivedPicks error:', e);
    return [];
  }
}

// Список всех дат, для которых есть пики в БД (для календаря архива)
export async function getArchivedDates(): Promise<string[]> {
  try {
    const { db } = await import('@/lib/db');
    const result = await db.storedPick.findMany({
      select: { pickDate: true },
      distinct: ['pickDate'],
      orderBy: { pickDate: 'desc' },
    });
    return result.map((r) => r.pickDate).filter(Boolean);
  } catch (e) {
    console.error('[picks] getArchivedDates error:', e);
    return [];
  }
}

// ====== СЕЗОННОСТЬ ТУРНИРОВ ======
// Активные турниры по месяцам (для отсева неактивных лиг).
// Ключ — номер месяца 1-12.
export interface ActiveLeagues {
  football: string[];
  basketball: string[];
  tennis: string[];
  hockey: string[];
  esports: string[];
  volleyball: string[];
  baseball: string[];
}

const SEASONAL_LEAGUES: Record<number, ActiveLeagues> = {
  1: {
    football: ['АПЛ', 'Ла Лига', 'Серия А', 'Бундеслига', 'РПЛ', 'Лига 1', 'Лига чемпионов УЕФА', 'Лига Европы УЕФА', 'Кубок Африканских Наций'],
    basketball: ['НБА', 'Евролига', 'Единая лига ВТБ'],
    tennis: ['Australian Open', 'ATP', 'WTA'],
    hockey: ['НХЛ', 'КХЛ'],
    esports: ['LCK', 'LPL', 'LEC', 'LCS', 'CS2 ESL Pro League', 'Dota 2 DPC'],
    volleyball: [],
  },
  2: {
    football: ['АПЛ', 'Ла Лига', 'Серия А', 'Бундеслига', 'РПЛ', 'Лига 1', 'Лига чемпионов УЕФА', 'Лига Европы УЕФА'],
    basketball: ['НБА', 'Евролига', 'Единая лига ВТБ'],
    tennis: ['ATP', 'WTA'],
    hockey: ['НХЛ', 'КХЛ'],
    esports: ['IEM Katowice', 'LCK', 'LPL', 'LEC', 'LCS', 'CS2'],
    volleyball: [],
  },
  3: {
    football: ['АПЛ', 'Ла Лига', 'Серия А', 'Бундеслига', 'РПЛ', 'Лига 1', 'Лига чемпионов УЕФА', 'Лига Европы УЕФА', 'Лига наций УЕФА'],
    basketball: ['НБА', 'Евролига', 'Единая лига ВТБ'],
    tennis: ['ATP', 'WTA', 'Miami Open'],
    hockey: ['НХЛ', 'КХЛ'],
    esports: ['CS2 Major', 'LCK', 'LPL', 'LEC', 'LCS'],
    volleyball: [],
  },
  4: {
    football: ['АПЛ', 'Ла Лига', 'Серия А', 'Бундеслига', 'РПЛ', 'Лига чемпионов УЕФА', 'Лига Европы УЕФА'],
    basketball: ['НБА', 'Евролига', 'Единая лига ВТБ'],
    tennis: ['ATP', 'WTA', 'Мастерс Монте-Карло'],
    hockey: ['НХЛ', 'КХЛ', 'Кубок Гагарина'],
    esports: ['LCK Spring Playoffs', 'LPL Spring Playoffs', 'CS2 ESL Pro League', 'VCT'],
    volleyball: [],
  },
  5: {
    football: ['АПЛ', 'Ла Лига', 'Серия А', 'Бундеслига', 'РПЛ', 'Лига 1', 'Лига чемпионов УЕФА', 'Лига Европы УЕФА', 'Лига конференций УЕФА'],
    basketball: ['НБА', 'Евролига', 'Единая лига ВТБ'],
    tennis: ['ATP', 'WTA', 'Roland Garros'],
    hockey: ['НХЛ', 'Кубок Гагарина', 'Чемпионат мира'],
    esports: ['LoL MSI', 'Dota 2 ESL One', 'LCK', 'LPL', 'CS2'],
    volleyball: ['Лига наций', 'Лига наций волейбол', 'Волейбольная лига наций'],
  },
  6: {
    football: ['Лига чемпионов УЕФА', 'Лига Европы УЕФА', 'MLS', 'Бразилейрано', 'Лига наций УЕФА'],
    basketball: ['НБА', 'WNBA', 'Летняя лига НБА'],
    tennis: ['ATP', 'WTA', 'Уимблдон квалификация', 'Roland Garros'],
    hockey: ['НХЛ', 'Чемпионат мира'],
    esports: ['Dota 2 Riyadh Masters', 'LoL Summer Split', 'CS2 ESL Pro League', 'LCK', 'LPL'],
    volleyball: ['Лига наций', 'Лига наций волейбол', 'Волейбольная лига наций'],
  },
  7: {
    football: ['MLS', 'Бразилейрано', 'Лига наций УЕФА', 'Лига чемпионов УЕФА квалификация', 'Товарищеские матчи сборных', 'Кубок Либертадорес', 'Кубок АФК'],
    basketball: ['WNBA', 'Летняя лига НБА'],
    tennis: ['Уимблдон', 'ATP', 'WTA'],
    hockey: [], // Июль — межсезонье для большинства хоккейных лиг
    esports: ['IEM Cologne', 'LoL Summer Split', 'LCK', 'LPL', 'Dota 2', 'CS2'],
    volleyball: ['Лига наций', 'Лига наций волейбол', 'Волейбольная лига наций'],
  },
  8: {
    football: ['АПЛ', 'Ла Лига', 'Серия А', 'Бундеслига', 'РПЛ', 'MLS', 'Бразилейрано', 'Лига чемпионов УЕФА квалификация', 'Лига наций УЕФА'],
    basketball: ['WNBA', 'Евролига квалификация', 'Чемпионат Европы'],
    tennis: ['US Open', 'ATP', 'WTA', 'Cincinnati Masters'],
    hockey: [], // Межсезонье
    esports: ['IEM Cologne', 'EVO', 'Valorant Champions', 'LoL Summer Split', 'LCK Playoffs'],
    volleyball: [],
  },
  9: {
    football: ['АПЛ', 'Ла Лига', 'Серия А', 'Бундеслига', 'РПЛ', 'Лига 1', 'Лига чемпионов УЕФА', 'Лига Европы УЕФА', 'MLS'],
    basketball: ['НБА предсезонка', 'Евролига', 'Единая лига ВТБ'],
    tennis: ['US Open', 'ATP', 'WTA'],
    hockey: ['НХЛ предсезонка', 'КХЛ'],
    esports: ['LoL Worlds', 'CS2 Major', 'Dota 2 The International', 'LCK'],
    volleyball: ['Чемпионат России по волейболу', 'Лига чемпионов ЕКВ'],
  },
  10: {
    football: ['АПЛ', 'Ла Лига', 'Серия А', 'Бундеслига', 'РПЛ', 'Лига 1', 'Лига чемпионов УЕФА', 'Лига Европы УЕФА', 'MLS'],
    basketball: ['НБА', 'Евролига', 'Единая лига ВТБ'],
    tennis: ['ATP', 'WTA', 'Shanghai Masters'],
    hockey: ['НХЛ', 'КХЛ'],
    esports: ['LoL Worlds', 'CS2 Major', 'Dota 2 The International'],
    volleyball: ['Чемпионат России по волейболу', 'Лига чемпионов ЕКВ'],
  },
  11: {
    football: ['АПЛ', 'Ла Лига', 'Серия А', 'Бундеслига', 'РПЛ', 'Лига 1', 'Лига чемпионов УЕФА', 'Лига Европы УЕФА', 'MLS'],
    basketball: ['НБА', 'Евролига', 'Единая лига ВТБ'],
    tennis: ['ATP Finals', 'WTA Finals', 'ATP', 'WTA'],
    hockey: ['НХЛ', 'КХЛ'],
    esports: ['LoL Worlds Finals', 'BLAST Premier', 'LCK'],
    volleyball: ['Чемпионат России по волейболу', 'Лига чемпионов ЕКВ'],
  },
  12: {
    football: ['АПЛ', 'Ла Лига', 'Серия А', 'Бундеслига', 'РПЛ', 'Лига 1', 'Лига чемпионов УЕФА', 'Лига Европы УЕФА'],
    basketball: ['НБА', 'Евролига', 'Единая лига ВТБ'],
    tennis: ['ATP', 'WTA'],
    hockey: ['НХЛ', 'КХЛ'],
    esports: ['BLAST Premier World Final', 'Dota 2 ESL One', 'LCK'],
    volleyball: ['Чемпионат России по волейболу', 'Лига чемпионов ЕКВ'],
  },
};

// ====== ГОДО-ЗАВИСИМЫЕ ТУРНИРЫ (раз в 4 года) ======
// ЧМ по футболу, Евро, Копа Америка — не каждый год. Добавляем только в годы проведения.
function getSpecialEvents(year: number, month: number): ActiveLeagues {
  const special: ActiveLeagues = {
    football: [],
    basketball: [],
    tennis: [],
    hockey: [],
    esports: [],
  };
  const isSummer = month === 6 || month === 7;

  // Чемпионат мира по футболу FIFA: 2022, 2026, 2030 (июнь-июль)
  if (isSummer && [2022, 2026, 2030, 2034].includes(year)) {
    special.football.push(
      'Чемпионат мира по футболу',
      'ЧМ по футболу',
      'FIFA World Cup',
      'ЧМ-' + year,
    );
  }
  // Евро УЕФА: 2024, 2028, 2032 (июнь-июль)
  if (isSummer && [2024, 2028, 2032].includes(year)) {
    special.football.push('Чемпионат Европы', 'Евро УЕФА', 'Евро-' + year);
  }
  // Копа Америка: 2024, 2028 (июнь-июль)
  if (isSummer && [2024, 2028].includes(year)) {
    special.football.push('Копа Америка', 'Copa America');
  }
  return special;
}

function getActiveLeagues(year: number, month: number): ActiveLeagues {
  const base =
    SEASONAL_LEAGUES[month] || {
      football: [] as string[],
      basketball: [] as string[],
      tennis: [] as string[],
      hockey: [] as string[],
      esports: [] as string[],
      volleyball: [] as string[],
      baseball: [] as string[],
    };
  const special = getSpecialEvents(year, month);
  // MLB сезон: апрель-октябрь (включая All-Star Game в июле)
  const mlbSeason = month >= 4 && month <= 10;
  return {
    football: [...base.football, ...special.football],
    basketball: [...base.basketball, ...special.basketball],
    tennis: [...base.tennis, ...special.tennis],
    hockey: [...base.hockey, ...special.hockey],
    esports: [...base.esports, ...special.esports],
    volleyball: base.volleyball || [],
    baseball: mlbSeason ? ['MLB'] : [],
  };
}

// Проверка: относится ли строка лиги к разрешённым в текущем месяце.
function isLeagueAllowed(leagueName: string, allowed: string[]): boolean {
  if (allowed.length === 0) return false; // нет активных лиг → всё запрещено
  const lower = (leagueName || '').toLowerCase();
  return allowed.some((a) => lower.includes(a.toLowerCase()));
}

// Какой турнир Большого шлема идёт сейчас?
// Учитывает конкретные даты проведения, а не только месяц.
// Возвращает имя для поискового запроса или null.
function getActiveGrandSlam(
  year: number,
  month: number,
  day: number,
): string | null {
  // Australian Open: 12-26 января
  if (month === 1 && day >= 12 && day <= 27) return 'Australian Open';
  // Roland Garros: 25 мая - 8 июня
  if ((month === 5 && day >= 25) || (month === 6 && day <= 9))
    return 'Roland Garros';
  // Уимблдон: 29 июня - 12 июля
  if ((month === 6 && day >= 29) || (month === 7 && day <= 12)) return 'Уимблдон';
  // US Open: 25 августа - 13 сентября
  if ((month === 8 && day >= 25) || (month === 9 && day <= 14)) return 'US Open';
  return null;
}

// Виды спорта для ежедневного покрытия.
// todayDate подставляется динамически; список лиг фильтруется по месяцу и году.
// Запросы сфокусированы на расписании конкретного дня, чтобы веб-поиск
// возвращал свежие данные, а не общие обзоры турниров.
function buildSports(
  todayDate: string,
  year: number,
  month: number,
  day: number,
  weekday: string = '',
): { key: string; label: string; icon: string; query: string }[] {
  const active = getActiveLeagues(year, month);
  const leaguesStr = (arr: string[]) => arr.join(' ');
  const sports: { key: string; label: string; icon: string; query: string }[] =
    [];

  // ЧМ по футболу идёт? Делаем отдельный усиленный запрос для расписания ЧМ.
  const isWorldCupYear = [2022, 2026, 2030, 2034].includes(year);
  const isWorldCupMonth = month === 6 || month === 7;
  if (isWorldCupYear && isWorldCupMonth) {
    sports.push({
      key: 'football',
      label: 'Футбол',
      icon: '⚽',
      query: `чемпионат мира 2026 футбол расписание матчей ${todayDate} сегодня кто играет время начала 1/16 финала`,
    });
  }

  if (active.football.length) {
    // По субботам — 2 пика из разных лиг, делаем 2 запроса
    const isSat = weekday.toLowerCase().includes('суббот');
    if (isSat && active.football.length >= 2) {
      // Первый запрос — АПЛ + Ла Лига
      sports.push({
        key: 'football',
        label: 'Футбол',
        icon: '⚽',
        query: `расписание футбол матчей ${todayDate} сегодня кто играет время начала АПЛ Ла Лига`,
      });
      // Второй запрос — Серия А + Бундеслига + РПЛ + Лига 1
      sports.push({
        key: 'football',
        label: 'Футбол',
        icon: '⚽',
        query: `расписание футбол матчей ${todayDate} сегодня кто играет время начала Серия А Бундеслига РПЛ Лига 1`,
      });
    } else {
      sports.push({
        key: 'football',
        label: 'Футбол',
        icon: '⚽',
        query: `расписание футбол матчей ${todayDate} сегодня кто играет время начала ${leaguesStr(active.football)}`,
      });
    }
  }
  if (active.basketball.length) {
    sports.push({
      key: 'basketball',
      label: 'Баскетбол',
      icon: '🏀',
      query: `расписание баскетбол матчей ${todayDate} сегодня кто играет время ${leaguesStr(active.basketball)}`,
    });
  }
  // Турнир Большого шлема идёт? Делаем ОТДЕЛЬНЫЕ запросы для ATP и WTA.
  // БШ-турниры: Australian Open (январь), Roland Garros (май-июнь),
  // Уимблдон (июнь-июль), US Open (август-сентябрь).
  // ВАЖНО: ATP и WTA идут параллельно — нужно 2 отдельных пика (мужчины + женщины)
  // Запросы на русском И английском — WTA-результаты часто только на английском
  const slamName = getActiveGrandSlam(year, month, day);
  if (slamName) {
    // ATP — мужчины (русский + английский запросы)
    sports.push({
      key: 'tennis',
      label: 'Теннис',
      icon: '🎾',
      query: `${slamName} 2026 ATP men schedule order of play ${todayDate} who plays today time`,
    });
    sports.push({
      key: 'tennis',
      label: 'Теннис',
      icon: '🎾',
      query: `${slamName} 2026 ATP мужчины расписание матчей ${todayDate} сегодня кто играет время начала сетка`,
    });
    // WTA — женщины (русский + английский запросы)
    sports.push({
      key: 'tennis',
      label: 'Теннис',
      icon: '🎾',
      query: `${slamName} 2026 WTA women schedule order of play ${todayDate} who plays today time`,
    });
    sports.push({
      key: 'tennis',
      label: 'Теннис',
      icon: '🎾',
      query: `${slamName} 2026 WTA женщины расписание матчей ${todayDate} сегодня кто играет время начала сетка`,
    });
  }

  if (active.tennis.length) {
    sports.push({
      key: 'tennis',
      label: 'Теннис',
      icon: '🎾',
      query: `расписание теннис матчей ${todayDate} сегодня кто играет сетка турнира ${leaguesStr(active.tennis)}`,
    });
  }
  if (active.hockey.length) {
    sports.push({
      key: 'hockey',
      label: 'Хоккей',
      icon: '🏒',
      query: `расписание хоккей матчей ${todayDate} сегодня кто играет время начала ${leaguesStr(active.hockey)}`,
    });
  }
  if (active.esports.length) {
    sports.push({
      key: 'esports',
      label: 'Киберспорт',
      icon: '🎮',
      query: `расписание киберспорт матчей ${todayDate} сегодня кто играет CS2 Dota 2 LoL Valorant ${leaguesStr(active.esports)}`,
    });
  }
  if (active.volleyball.length) {
    sports.push({
      key: 'volleyball',
      label: 'Волейбол',
      icon: '🏐',
      query: `расписание волейбол матчей ${todayDate} сегодня кто играет время начала ${leaguesStr(active.volleyball)}`,
    });
  }
  return sports;
}

const SPORT_MAP: Record<string, { label: string; icon: string; key: string }> = {
  футбол: { label: 'Футбол', icon: '⚽', key: 'football' },
  football: { label: 'Футбол', icon: '⚽', key: 'football' },
  soccer: { label: 'Футбол', icon: '⚽', key: 'football' },
  баскетбол: { label: 'Баскетбол', icon: '🏀', key: 'basketball' },
  basketball: { label: 'Баскетбол', icon: '🏀', key: 'basketball' },
  теннис: { label: 'Теннис', icon: '🎾', key: 'tennis' },
  tennis: { label: 'Теннис', icon: '🎾', key: 'tennis' },
  хоккей: { label: 'Хоккей', icon: '🏒', key: 'hockey' },
  hockey: { label: 'Хоккей', icon: '🏒', key: 'hockey' },
  киберспорт: { label: 'Киберспорт', icon: '🎮', key: 'esports' },
  esports: { label: 'Киберспорт', icon: '🎮', key: 'esports' },
  'киберспорт (cs2)': { label: 'Киберспорт', icon: '🎮', key: 'esports' },
  бейсбол: { label: 'Бейсбол', icon: '⚾', key: 'baseball' },
  baseball: { label: 'Бейсбол', icon: '⚾', key: 'baseball' },
  волейбол: { label: 'Волейбол', icon: '🏐', key: 'volleyball' },
  volleyball: { label: 'Волейбол', icon: '🏐', key: 'volleyball' },
};

function sportMeta(label: string, fallbackKey: string) {
  const norm = (label || '').trim().toLowerCase();
  const found = SPORT_MAP[norm];
  if (found) {
    return { label: found.label, icon: found.icon, key: found.key };
  }
  // fallback: найти по частичному совпадению
  const partial = Object.values(SPORT_MAP).find((m) =>
    norm.includes(m.label.toLowerCase()),
  );
  if (partial) {
    return {
      label: partial.label,
      icon: partial.icon,
      key: partial.key,
    };
  }
  return { label: label || 'Спорт', icon: '🏆', key: fallbackKey };
}

interface RawPick {
  sport?: string;
  league?: string;
  team1?: string;
  team2?: string;
  time?: string;
  market?: string;
  selection?: string;
  odds?: number | string;
  confidence?: string;
  confidenceScore?: number;
  reasoning?: string;
  risk?: string;
  sourceQuote?: string;
  sourceUrl?: string;
  sourceName?: string;
  dataSource?: string;
}

// Создать детерминированный ID пика на основе матча.
// Один и тот же матч (sport+teams+time+date) всегда даёт один и тот же ID,
// чтобы повторные генерации не создавали дубликаты в БД статистики.
function makePickId(
  sportKey: string,
  team1: string,
  team2: string,
  startTime: string,
  pickDate = '',
): string {
  const slug = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-zа-яё0-9]/gi, '')
      .slice(0, 12);
  const t1 = slug(team1);
  const t2 = slug(team2);
  const t = (startTime || '').replace(/[^0-9]/g, '');
  return `pick-${pickDate}-${sportKey}-${t1}-${t2}-${t}`;
}

function parsePicks(content: string, generatedAt: string, pickDate = ''): Pick[] {
  let text = content.trim();

  // Убираем markdown-ограждения
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    text = fence[1].trim();
  }

  // Извлекаем первый JSON-массив
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start !== -1 && end !== -1 && end > start) {
    text = text.slice(start, end + 1);
  }

  let arr: unknown;
  try {
    arr = JSON.parse(text);
  } catch {
    return [];
  }

  if (!Array.isArray(arr)) return [];

  const picks: Pick[] = arr
    .map((item, idx): Pick | null => {
      const r = item as RawPick;
      if (!r || typeof r !== 'object') return null;
      if (!r.team1 || !r.team2) return null;

      const sportLabel = r.sport || 'Спорт';
      const meta = sportMeta(sportLabel, `sport-${idx}`);
      const conf = normalizeConfidence(r.confidence);
      const score = normalizeScore(r.confidenceScore, conf);

      return {
        id: makePickId(meta.key, String(r.team1 || ''), String(r.team2 || ''), normalizeTime(r.time), pickDate),
        sport: meta.label,
        sportKey: meta.key,
        sportIcon: meta.icon,
        league: r.league || '—',
        team1: String(r.team1).trim(),
        team2: String(r.team2).trim(),
        startTime: normalizeTime(r.time),
        market: r.market || 'Исход матча',
        selection: r.selection || '—',
        odds: normalizeOdds(r.odds),
        confidence: conf,
        confidenceScore: score,
        reasoning: (r.reasoning || '').trim(),
        risk: (r.risk || '').trim(),
        sourceQuote: (r.sourceQuote || '').trim(),
        sourceUrl: (r.sourceUrl || '').trim(),
        sourceName: (r.sourceName || '').trim(),
        dataSource: (r.dataSource || 'Веб-поиск').trim(),
        generatedAt,
      };
    })
    .filter((p): p is Pick => p !== null);

  return picks;
}

function normalizeConfidence(v?: string): Confidence {
  const s = (v || '').toLowerCase().trim();
  if (s.startsWith('high') || s.startsWith('выс') || s === 'высокая')
    return 'high';
  if (s.startsWith('low') || s.startsWith('низ') || s === 'низкая')
    return 'low';
  return 'medium';
}

function normalizeScore(v: unknown, conf: Confidence): number {
  let n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  if (!isFinite(n) || n <= 0) {
    n = conf === 'high' ? 82 : conf === 'medium' ? 62 : 42;
  }
  if (n > 0 && n <= 1) n = Math.round(n * 100); // 0.8 -> 80
  return Math.max(5, Math.min(99, Math.round(n)));
}

function normalizeTime(v?: string): string {
  if (!v) return '';
  const s = String(v).trim();
  const m = s.match(/(\d{1,2}):(\d{2})/);
  if (m) {
    return `${m[1].padStart(2, '0')}:${m[2]}`;
  }
  return s.slice(0, 5);
}

function normalizeOdds(v: unknown): string {
  let n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  if (!isFinite(n) || n <= 1) return '—';
  return n.toFixed(2).replace('.', '.');
}

async function searchWithRetry(
  zai: Awaited<ReturnType<typeof ZAI.create>>,
  query: string,
  num: number,
  retries = 3,
): Promise<unknown[]> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // recency_days=1 — предпочитаем материалы за последние сутки,
      // чтобы отсечь старые новости о прошедших матчах
      const res = await zai.functions.invoke('web_search', {
        query,
        num,
        recency_days: 1,
      });
      bumpWebSearch();
      return (res as unknown[]) || [];
    } catch (e) {
      lastError = e;
      const msg = e instanceof Error ? e.message : String(e);
      const isRateLimit = msg.includes('429') || msg.includes('Too many');
      if (attempt < retries) {
        const delay = isRateLimit ? 1500 * attempt : 800 * attempt;
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

function todayRu(): {
  iso: string;
  pretty: string;
  weekday: string;
  ymd: string;
  timeMsk: string;
  year: number;
  month: number;
  day: number;
  monthName: string;
} {
  const now = new Date();
  const pretty = now.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Moscow',
  });
  const weekday = now.toLocaleDateString('ru-RU', {
    weekday: 'long',
    timeZone: 'Europe/Moscow',
  });
  const monthName = now.toLocaleDateString('ru-RU', {
    month: 'long',
    timeZone: 'Europe/Moscow',
  });
  // Локальные дата/время по Мск в формате YYYY-MM-DD и HH:MM
  const mskParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) =>
    mskParts.find((p) => p.type === t)?.value || '';
  const ymd = `${get('year')}-${get('month')}-${get('day')}`;
  const timeMsk = `${get('hour')}:${get('minute')}`;
  const year = parseInt(get('year'), 10);
  const month = parseInt(get('month'), 10);
  const day = parseInt(get('day'), 10);
  return { iso: now.toISOString(), pretty, weekday, ymd, timeMsk, year, month, day, monthName };
}

// ====== АНТИ-ПРОШЕДШИЕ СОБЫТИЯ ======
// Слова-маркеры, указывающие, что матч уже завершился (а не предстоящий).
const PAST_MARKERS = [
  'выиграл', 'выиграла', 'выиграли',
  'победил', 'победила', 'победили',
  'обыграл', 'обыграли',
  'завершился', 'завершилась', 'завершили',
  'завершил', 'прошёл', 'прошла', 'прошли',
  'сыграл', 'сыграла', 'сыграли',
  'итог', 'итоги',
  'результат', 'результаты',
  'обзор', 'обзоры',
  'прошел сенсационно', 'сенсация',
  'выбыл', 'выбыла',
  'пройдет в', // иногда в обзорах «пройдет в 1/4» = уже состоялся
  'итоговый',
  'финал состоялся',
  'матч состоялся',
  'завершён', 'завершена', 'завершено',
  // английские маркеры (источники часто на англ.)
  'won', 'defeated', 'beat', 'finished',
  'congratulations', 'congrats',
  'crowned',
  'lifted the trophy',
  'eliminated',
  'knocked out',
  'стали чемпионами',
  'выиграли турнир',
  'завершили выступление',
  'вылетели',
];

function hasPastMarker(text: string): { hit: boolean; marker: string | null } {
  const lower = (text || '').toLowerCase();
  for (const m of PAST_MARKERS) {
    if (lower.includes(m)) {
      return { hit: true, marker: m };
    }
  }
  return { hit: false, marker: null };
}

// Проверка: время начала уже прошло по Мск?
function timeAlreadyPassed(startTime: string, currentTimeMsk: string): boolean {
  if (!startTime || !currentTimeMsk) return false;
  const sm = startTime.match(/^(\d{1,2}):(\d{2})$/);
  const cm = currentTimeMsk.match(/^(\d{1,2}):(\d{2})$/);
  if (!sm || !cm) return false;
  const sHour = parseInt(sm[1], 10);
  const sMin = sHour * 60 + parseInt(sm[2], 10);
  const cMin = parseInt(cm[1], 10) * 60 + parseInt(cm[2], 10);

  // ВАЖНО: матчи с 00:00 до 08:00 МСК — это НОЧНЫЕ матчи (часто US Open night session
  // начинается в 7 PM ET = 02:00 МСК следующего дня). Они могли быть сегодня ночью
  // (уже прошли) ИЛИ завтра ночью (ещё не начались). Без полной даты мы не знаем точно.
  // Решение: НЕ отбраковываем матчи 00:00-08:00 — пусть проходят, пользователь сам решит.
  // Это покрывает кейс: runner в 7:00 МСК, матч US Open в 02:00 МСК завтра — должен пройти.
  if (sHour >= 0 && sHour < 8) {
    return false; // Ночные/утренние матчи — НЕ отбраковываем
  }

  // Для матчей 08:00-23:59: если начался более 30 минут назад — прошедший
  return sMin + 30 < cMin;
}

export interface GenerateOptions {
  force?: boolean;
}

export interface GenerateResult {
  picks: Pick[];
  cached: boolean;
  date: string;
  usage: UsageStats;
  activeLeagues: ActiveLeagues;
  sportsSearched: number;
  filteredOut: number;
}

export async function generateDailyPicks(
  opts: GenerateOptions = {},
): Promise<GenerateResult> {
  const { ymd: dayKey, pretty, weekday, timeMsk, year, month, day, monthName } = todayRu();
  const cacheKey = `picks-${dayKey}`;
  const active = getActiveLeagues(year, month);

  const cached = cache.get(cacheKey);
  if (cached && !opts.force && Date.now() - cached.ts < CACHE_TTL) {
    usage.cacheHits += 1;
    // При отдаче из кэша отсекаем уже начавшиеся матчи.
    // Пики сгенерированы, скажем, в 10:00, а сейчас 18:00 — часть матчей уже прошла.
    // Не показываем их (статистику по ним сохраняем как есть, просто не отображаем).
    const livePicks = cached.picks.filter((p) => {
      // Для ESPN-пиков не применяем HH:MM-фильтр (они валидированы по UTC-дате).
      // ESPN-матч может быть в 01:40 МСК (ночь следующего дня) — HH:MM-сравнение
      // лочно посчитает его прошедшим.
      if (p.dataSource === 'ESPN API') return true;
      if (!p.startTime || !timeMsk) return true;
      return !timeAlreadyPassed(p.startTime, timeMsk);
    });
    return {
      picks: livePicks,
      cached: true,
      date: dayKey,
      usage: getUsage(),
      activeLeagues: active,
      sportsSearched: 0,
      filteredOut: 0,
    };
  }

  // ====== DB FALLBACK: если кэш истёк/потерян (сервер перезапустился),
  // проверяем БД на сохранённые пики дня. Это гарантирует стабильность:
  // утренние пики не поменяются в обед при повторной генерации.
  if (!opts.force) {
    try {
      const { db } = await import('@/lib/db');
      const saved = await db.storedPick.findMany({
        where: { pickDate: dayKey },
        orderBy: { createdAt: 'asc' },
      });
      if (saved.length > 0) {
        // Конвертируем StoredPick → Pick (reasoning/risk/quote могут быть пустыми —
        // карточка покажет команды/рынок/коэф/уверенность, без анализа)
        const SPORT_ICONS_DB: Record<string, string> = {
          football: '⚽', basketball: '🏀', tennis: '🎾',
          hockey: '🏒', esports: '🎮', baseball: '⚾', volleyball: '🏐',
        };
        const dbPicks: Pick[] = saved.map((p) => ({
          id: p.id,
          sport: p.sport,
          sportKey: p.sportKey,
          sportIcon: SPORT_ICONS_DB[p.sportKey] || '🏆',
          league: p.league,
          team1: p.team1,
          team2: p.team2,
          startTime: p.startTime,
          market: p.market,
          selection: p.selection,
          odds: p.odds,
          confidence: p.confidence as Confidence,
          confidenceScore: p.confidenceScore,
          reasoning: p.reasoning || '', // теперь сохраняется в БД
          risk: p.risk || '',
          sourceQuote: p.sourceQuote || '',
          sourceUrl: p.sourceUrl || '',
          sourceName: p.sourceName || '',
          dataSource: p.dataSource,
          generatedAt: p.createdAt.toISOString(),
          // Cross-check поля
          crossCheckAgree: (p.crossCheckAgree as Pick['crossCheckAgree']) ?? null,
          crossCheckConfidence: p.crossCheckConfidence ?? null,
          crossCheckReasoning: p.crossCheckReasoning ?? null,
          crossCheckScore: p.crossCheckScore ?? null,
          crossCheckModel: p.crossCheckModel ?? null,
        }));
        // Populate in-memory cache для следующих запросов
        cache.set(cacheKey, { picks: dbPicks, ts: Date.now() });
        usage.cacheHits += 1;
        // Отсекаем уже начавшиеся матчи
        const livePicks = dbPicks.filter((p) => {
          if (p.dataSource === 'ESPN API') return true;
          if (!p.startTime || !timeMsk) return true;
          return !timeAlreadyPassed(p.startTime, timeMsk);
        });
        console.log(
          `[picks] DB fallback: loaded ${dbPicks.length} picks from DB for ${dayKey}, ${livePicks.length} live`,
        );
        return {
          picks: livePicks,
          cached: true,
          date: dayKey,
          usage: getUsage(),
          activeLeagues: active,
          sportsSearched: 0,
          filteredOut: 0,
        };
      }
    } catch (e) {
      console.error('[picks] DB fallback failed:', e);
    }
  }

  const zai = await ZAI.create();
  const SPORTS = buildSports(dayKey, year, month, day, weekday);

  // Последовательный веб-поиск по видам спорта (с ретраями — чтобы не словить 429)
  // Для ЧМ и БШ-запросов берём больше результатов (8), для остальных — 6.
  const searchResults: { sport: (typeof SPORTS)[number]; results: unknown[] }[] =
    [];
  for (const sport of SPORTS) {
    const isPriorityQuery =
      sport.query.includes('чемпионат мира 2026') ||
      sport.query.includes('Australian Open') ||
      sport.query.includes('Roland Garros') ||
      sport.query.includes('Уимблдон') ||
      sport.query.includes('US Open');
    const num = isPriorityQuery ? 8 : 6;
    const results = await searchWithRetry(zai, sport.query, num).catch((e) => {
      console.error(`search failed for ${sport.key}:`, e);
      return [] as unknown[];
    });
    searchResults.push({ sport, results });
    // Небольшая пауза между запросами для соблюдения лимитов
    await new Promise((r) => setTimeout(r, 600));
  }

  // Собираем контекст для LLM (с URL и host — для цитирования источников)
  let context = '';
  let sourceIdx = 0;
  for (const { sport, results } of searchResults) {
    const list = (results as unknown[]) || [];
    context += `\n\n=== ${sport.label.toUpperCase()} (${sport.icon}) ===\n`;
    if (list.length) {
      list.forEach((rRaw) => {
        sourceIdx += 1;
        const r = rRaw as {
          name?: string;
          snippet?: string;
          host_name?: string;
          url?: string;
          date?: string;
        };
        const dateStr = r.date ? ` | дата: ${r.date}` : '';
        context += `[ИСТОЧНИК #${sourceIdx}] ${r.name || ''}${dateStr}\nURL: ${r.url || '(нет)'}\nHOST: ${r.host_name || 'web'}\nТЕКСТ: ${r.snippet || ''}\n`;
      });
    } else {
      context += 'Данные из поиска недоступны.\n';
    }
  }

  // ====== ТОЧНОЕ РАСПИСАНИЕ из ESPN API (без галлюцинаций) ======
  // Для ЧМ по футболу, WNBA, MLB — берём матчи напрямую из ESPN.
  // Эти матчи ГАРАНТИРОВАННО существуют и точны. LLM должна использовать их
  // как источник истины, а веб-поиск — только для дополнительного контекста.
  // ESPN требует дату в формате YYYYMMDD (без дефисов).
  let apiEvents: SportsEvent[] = [];
  try {
    const dateEspn = dayKey.replace(/-/g, '');
    const raw = await getTodayEventsFromApi(dateEspn);
    apiEvents = filterUpcoming(raw, timeMsk);
    console.log(
      `[picks] ESPN API events for ${dayKey} (espn=${dateEspn}): ${raw.length} total, ${apiEvents.length} upcoming`,
    );
  } catch (e) {
    console.error('[picks] ESPN API failed:', e);
  }

  // ===== FALLBACK: TheSportsDB если ESPN заблокирован (Access Denied) =====
  if (apiEvents.length === 0) {
    console.log('[picks] ESPN returned 0 events, trying TheSportsDB fallback...');
    try {
      const { getTSDBEvents } = await import('./thesportsdb-fetcher');
      const [mlbEvents, wnbaEvents] = await Promise.all([
        getTSDBEvents('baseball', dayKey),
        getTSDBEvents('basketball', dayKey),
      ]);
      const tsdbEvents = [...mlbEvents, ...wnbaEvents];
      if (tsdbEvents.length > 0) {
        // Конвертируем в формат ESPN events
        apiEvents = tsdbEvents.map((e) => ({
          sportKey: e.sportKey,
          sportLabel: e.sport === 'baseball' ? 'Бейсбол' : 'Баскетбол',
          sportIcon: e.sport === 'baseball' ? '⚾' : '🏀',
          league: e.league,
          team1: e.homeTeam,
          team2: e.awayTeam,
          startTimeMsk: e.startTime,
          status: e.status,
          homeScore: null,
          awayScore: null,
          date: dayKey,
        }));
        console.log(`[picks] TheSportsDB fallback: ${apiEvents.length} events found`);
      }
    } catch (e) {
      console.error('[picks] TheSportsDB fallback failed:', e);
    }
  }

  // Формируем блок точного расписания для LLM
  let apiScheduleText = '';
  if (apiEvents.length > 0) {
    apiScheduleText = `\n\n=== ТОЧНОЕ РАСПИСАНИЕ ИЗ ESPN API (ГАРАНТИРОВАННО АКТУАЛЬНО) ===\n`;
    apiScheduleText += `Эти матчи ТОЧНО состоятся сегодня (данные из ESPN API). Используй ИХ в первую очередь — для них НЕ нужен веб-поиск. Для каждого матча подбери рынок и коэффициент.\n\n`;
    apiEvents.forEach((ev, i) => {
      apiScheduleText += `[ESPN-${i + 1}] ${ev.sportIcon} ${ev.sportLabel} | ${ev.league}\n`;
      apiScheduleText += `  Матч: ${ev.team1} vs ${ev.team2}\n`;
      apiScheduleText += `  Время МСК: ${ev.startTimeMsk || '(не указано)'}\n`;
      apiScheduleText += `  Источник: ESPN API (точное расписание)\n`;
      apiScheduleText += `  Для этого пика в sourceQuote укажи: "ESPN API: ${ev.team1} vs ${ev.team2}, ${ev.startTimeMsk} МСК", sourceName: "ESPN API", dataSource: "ESPN API"\n\n`;
    });
  }

  // ====== ВОЛЕЙБОЛ из API-Sports (бесплатный API) ======
  let volleyballEvents: VolleyballEvent[] = [];
  if (active.volleyball.length > 0) {
    try {
      const rawVb = await getVolleyballEvents(dayKey);
      volleyballEvents = filterUpcomingVolleyball(rawVb);
      console.log(
        `[picks] Volleyball API events for ${dayKey}: ${rawVb.length} total, ${volleyballEvents.length} upcoming`,
      );
      if (volleyballEvents.length > 0) {
        apiScheduleText += `\n=== ТОЧНОЕ РАСПИСАНИЕ ВОЛЕЙБОЛА ИЗ API-SPORTS ===\n`;
        apiScheduleText += `Эти матчи ТОЧНО состоятся сегодня (Лига наций и др.). Используй ИХ — для них НЕ нужен веб-поиск.\n\n`;
        volleyballEvents.forEach((ev, i) => {
          apiScheduleText += `[VB-${i + 1}] 🏐 Волейбол | ${ev.league}\n`;
          apiScheduleText += `  Матч: ${ev.team1} vs ${ev.team2}\n`;
          apiScheduleText += `  Время МСК: ${ev.startTimeMsk || '(не указано)'}\n`;
          apiScheduleText += `  Источник: API-Sports (точное расписание)\n`;
          apiScheduleText += `  Для этого пика в sourceQuote укажи: "API-Sports: ${ev.team1} vs ${ev.team2}, ${ev.startTimeMsk} МСК", sourceName: "API-Sports", dataSource: "API-Sports"\n\n`;
        });
      }
    } catch (e) {
      console.error('[picks] Volleyball API failed:', e);
    }
  }

  // Вычисляем активный БШ-турнир ОДИН РАЗ — используется в промпте и постфильтре.
  const activeSlam = getActiveGrandSlam(year, month, day);

  const seasonalityText = `АКТИВНЫЕ ТУРНИРЫ В ТЕКУЩЕМ МЕСЯЦЕ (${monthName} ${year}, месяц №${month}):
- Футбол: ${active.football.length ? active.football.join(', ') : 'НЕТ активных лиг — не включай футбол'}
- Баскетбол: ${active.basketball.length ? active.basketball.join(', ') : 'НЕТ активных лиг — не включай баскетбол'}
- Теннис: ${active.tennis.length ? active.tennis.join(', ') : 'НЕТ активных лиг — не включай теннис'}
- Хоккей: ${active.hockey.length ? active.hockey.join(', ') : 'НЕТ активных лиг — не включай хоккей'}
- Киберспорт: ${active.esports.length ? active.esports.join(', ') : 'НЕТ активных турниров — не включай киберспорт'}
- Волейбол: ${active.volleyball.length ? active.volleyball.join(', ') : 'НЕТ активных турниров — не включай волейбол'}

ВНИМАНИЕ: многие лиги СЕЗОННЫЕ. Например, Бундеслига, АПЛ, Серия А, Ла Лига, КХЛ, НХЛ, Единая лига ВТБ, Евролига и НБА НЕ ИДУТ летом (июнь-август, а НХЛ/КХЛ до сентября). Евро УЕФА и Копа Америка проводятся раз в 4 года (2024, 2028) — в 2026 их НЕТ. Чемпионат мира по футболу — раз в 4 года (2022, 2026, 2030) — в ${year} году ${[2022, 2026, 2030, 2034].includes(year) ? 'ЧМ ИДЁТ — это главное событие, обязательно включай матчи ЧМ' : 'ЧМ не проводится'}. Если лига указана как активная выше — её можно использовать. Если лига НЕ указана в списке активных — КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО включать её матчи, даже если они упомянуты в источниках (вероятно, это старые обзоры или расписание прошлого сезона).`;

  const systemPrompt = `Ты — спортивный аналитик. Твоя задача — ИЗВЛЕКАТЬ спортивные события из предоставленных источников веб-поиска и формировать пики для ставок.

ГЛАВНОЕ ПРАВИЛО (НАРУШЕНИЕ = БРАК):
Ты НЕ генерируешь матчи по памяти. Ты ТОЛЬКО извлекаешь матчи, которые РЕАЛЬНО упомянуты в предоставленных источниках веб-поиска. Каждый пик ОБЯЗАН содержать:
- sourceQuote: ТОЧНАЯ цитата (фраза) из источника, где упомянуты ОБА участника ОДНОГО матча РЯДОМ друг с другом (с разделителем —, -, vs, против). Цитата должна быть дословной — копия фрагмента текста источника.
- sourceUrl: URL источника (из поля "URL:" в контексте).
- sourceName: host источника (из поля "HOST:" в контексте).

Если ты не можешь найти в источниках конкретную фразу, упоминающую матч двух команд — НЕ ВКЛЮЧАЙ этот пик. Лучше 3 честных пика с цитатами, чем 10 выдуманных.

АНТИ-ГАЛЛЮЦИНАЦИЯ:
- НЕ используй свои знания о расписании турниров прошлых лет.
- НЕ придумывай матчи «Барселона-Реал» или «Джокович-Алькарас» только потому, что знаешь эти имена.
- Если источник говорит «сегодня играют X и Y» — это валидный пик. Если источник говорит «турнир продолжается» без конкретики — НЕ придумывай матчи.
- Имена команд/игроков бери СТРОГО из текста источников. Не сокращай, не транслитерируй.

АНТИ-CROSS-CONTAMINATION (КРИТИЧНО):
- НЕ спаривай игроков/команды из РАЗНЫХ матчей расписания. Если в источнике написано «14:30 Штруфф — Медведев» и отдельно «Кэм Норри — кто-то» — НЕ создавай пик «Штруфф vs Норри».
- sourceQuote ДОЛЖНА быть строкой, где team1 и team2 стоят РЯДОМ (между ними разделитель —, -, vs, против). Если в твоей цитате имена стоят в разных предложениях или далеко друг от друга — это неправильная пара.
- Перед формированием пика проверь: в sourceQuote team1 и team2 действительно играют МЕЖДУ СОБОЙ, а не просто оба упомянуты в статье.
- АНТИ-СПИСОК (КРИТИЧНО): Если в источнике написано «Zverev, Auger-Aliassime, Fritz in action» — это СПИСОК игроков, которые играют в этот день, а НЕ матч между ними! НЕ создавай пик «Zverev vs Auger-Aliassime» из такого списка. Запятая между именами = список, НЕ матч.
- ВАЛИДНЫЙ матч = имена разделены «—», «-», «vs», «против» в одной строке. Например: «18:00 Киз — Бондар», «Zverev vs Halys».
- Если видишь список игроков через запятую («Sabalenka, Rybakina, Pegula playing») — НЕ соединяй их в пары. Каждый играет свой матч против кого-то другого.

АНТИ-ПРОШЕДШИЕ (КРИТИЧНО):
- Если в источнике есть слова «выиграл», «победил», «обыграл», «завершился», «итог», «результат», «обзор», «прошёл», «чемпион», «финал состоялся», «congratulations», «winner» — ЭТО ПРОШЕДШИЙ МАТЧ. НЕ включай его как предстоящий.
- Если рядом с названием команд стоит СЧЁТ (например «Португалия — Хорватия 2:1», «ЮАР – Канада 0:1») — матч УЖЕ СОСТОЯЛСЯ. Не включай его.
- Если источник описывает, КТО ВЫИГРАЛ турнир или матч — это обзор завершённого события, а не расписание.
- ВАЛИДНОЕ расписание = команды + время, БЕЗ счёта. Например: «11:00 Австралия — Египет», «15:00 Аргентина — Кабо-Верде». Вот такие матчи включай.
- Включай ТОЛЬКО матчи, которые в источнике описаны как ПРЕДСТОЯЩИЕ (будут играть, сыграют, встретятся, расписание, матчи сегодня, без счёта).
- ВАЖНО: матчи могут начинаться ВЕЧЕРОМ (18:00-23:59 МСК) ИЛИ НОЧЬЮ/РАНО УТРОМ (00:00-08:00 МСК следующего дня). Это нормально для US Open (night session 7 PM ET = 02:00 МСК). Включай ВСЕ предстоящие матчи, даже если они ночью — пользователь сам решит ставить или нет.
- Если startTime задано и оно в диапазоне 08:00-23:59 МСК и УЖЕ прошло — не включай. Но матчи 00:00-08:00 МСК включай ВСЕГДА (это могут быть завтрашние ночные матчи).

ЧМ-2026 ИДЁТ СЕЙЧАС (главное событие):
- Чемпионат мира по футболу 2026 проходит 11 июня — 19 июля. Сегодня матчи 1/16 финала.
- ОБЯЗАТЕЛЬНО найди в источниках расписание матчей ЧМ на сегодня и включи их (те, что ещё не начались).
- Ищи в источниках фразы вида «HH:MM Команда1 — Команда2» без счёта — это расписание.
- Это приоритет №1 — если в источниках есть матчи ЧМ на сегодня, они ДОЛЖНЫ быть в ответе.

ТУРНИР БОЛЬШОГО ШЛЕМА ИДЁТ (ОБЯЗАТЕЛЬНЫЕ ПИКИ):
- В текущем месяце идёт турнир Большого шлема (Australian Open / Roland Garros / Уимблдон / US Open).
- ОБЯЗАТЕЛЬНО включи МИНИМУМ 2 пика из этого турнира: ОДИН ATP (мужчины) + ОДИН WTA (женщины).
- ATP и WTA идут параллельно каждый день БШ-турнира. В расписании обычно есть матчи обоих туров.
- Ищи в источниках расписание вида «HH:MM Игрок1 — Игрок2» (без счёта).
- Имена игроков бери СТРОГО из одной строки расписания. Не подставляй игроков из других матчей.
- Это приоритет №2 после ЧМ. Если БШ-турнир идёт, в ответе ДОЛЖНО быть 2 теннисных пика (ATP + WTA).
- Если в источниках есть только ATP или только WTA на сегодня — включи что есть (1 пик), но старайся найти оба.

ИСТОЧНИКИ ДАННЫХ (ПРИОРИТЕТ):
1. ESPN API — если в контексте есть блок «ТОЧНОЕ РАСПИСАНИЕ ИЗ ESPN API», используй ИСКЛЮЧИТЕЛЬНО эти матчи для соответствующих видов спорта (ЧМ, WNBA, MLB). НЕ ищи их в веб-поиске — они уже точные. Для каждого ESPN-матча подбери рынок/коэффициент и обязательно укажи dataSource="ESPN API".
2. Веб-поиск — для турниров, которых НЕТ в ESPN (теннис БШ, киберспорт). Извлекай матчи по правилам ниже.

ПРИОРИТЕТЫ:
- Чемпионат мира по футболу (если идёт) — главное событие. Берётся из ESPN API.
- Турнир Большого шлема (если идёт) — ОБЯЗАТЕЛЬНО минимум 2 пика: ATP + WTA. Берётся из веб-поиска.
- ФУТБОЛЬНЫЕ ЛИГИ (АПЛ, Ла Лига, Серия А, Бундеслига, РПЛ, Лига 1) — ОБЯЗАТЕЛЬНО минимум 1 пик из любой лиги. По СУББОТАМ — минимум 2 пика (разные лиги). Берётся из ESPN API.
- MLB (бейсбол) — ОБЯЗАТЕЛЬНО минимум 1 пик, если есть матчи в ESPN API.
- БАСКЕТБОЛ (WNBA или НБА) — ОБЯЗАТЕЛЬНО минимум 1 пик, если есть матчи в ESPN API.
- ХОККЕЙ (НХЛ или КХЛ) — ОБЯЗАТЕЛЬНО минимум 1 пик. НХЛ берётся из ESPN API. КХЛ — из веб-поиска (если НХЛ нет).
- ТЕННИС (БШ или ATP/WTA) — ОБЯЗАТЕЛЬНО минимум 1 пик, если идёт турнир. Берётся из веб-поиска.
- Волейбол (Лига наций) — ОБЯЗАТЕЛЬНО минимум 1 пик, если в сезоне Лига наций. Берётся из веб-поиска. Ищи расписание матчей сегодня (мужчины и женщины).
- Киберспорт — ТОЛЬКО топовые турниры (Majors, IEM, Worlds, TI, VCT Champions). Если в источниках нет конкретного сегодняшнего кибер-матча — не включай киберспорт.

ВАЖНО: Если в ESPN API есть матчи MLB, НБА, НХЛ — ОБЯЗАТЕЛЬНО включи хотя бы 1 пик каждого вида. НЕ игнорируй бейсбол, баскетбол или хоккей!

ВАЛИДАЦИЯ ЛИГИ (КРИТИЧНО):
- sport и league ДОЛЖНЫ соответствовать друг другу. Примеры правильных пар:
  • sport="Теннис" → league="Уимблдон" / "Roland Garros" / "ATP" / "WTA"
  • sport="Баскетбол" → league="WNBA" / "Летняя лига НБА" / "НБА"
  • sport="Футбол" → league="Чемпионат мира по футболу" / "АПЛ" / "Лига чемпионов УЕФА"
  • sport="Бейсбол" → league="MLB"
- НЕВЕРНО: sport="Футбол" с league="Уимблдон" (Уимблдон — это теннис!).
- НЕВЕРНО: sport="Теннис" с league="WNBA" (WNBA — это баскетбол!).
- Если сомневаешься в виде спорта турнира — не включай его.

АНТИ-АРХИВ-БШ (КРИТИЧНО):
- Если в контексте выше НЕ указано «Сейчас идёт турнир Большого шлема — {имя}» — значит БШ-турнир СЕЙЧАС НЕ ИДЁТ.
- В этом случае КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО использовать лиги "Уимблдон", "Roland Garros", "Australian Open", "US Open".
- Если веб-поиск нашёл страницу с прошлым матчем БШ-турнира (например «Синнер-Кецманович Wimbledon 2026») — это АРХИВ прошлой встречи. Не создавай пик по нему.
- Вместо БШ-имени используй РЕАЛЬНЫЙ турнир сегодня: ATP 250, ATP 500, WTA 250 и т.д. (например «ATP Умаг», «ATP Бастад», «ATP Гштаад»).
${activeSlam ? `- СЕЙЧАС ИДЁТ БШ: ${activeSlam}. Только для него можно использовать это имя в league.` : `- СЕЙЧАС БШ НЕ ИДЁТ. НЕ используй имена БШ-турниров в league. Используй ATP/WTA + название города/турнира.`}

КОЛИЧЕСТВО И КАЧЕСТВО (ВАЖНО):
- Отбирай 4-8 ЛУЧШИХ пиков на день, а не все возможные. Качество важнее количества. Во время БШ-турнира — 2 теннисных (ATP+WTA) + остальные.
- Предпочитай пики с высокой уверенностью (confidence=high).
- Не включай 2 пика на один и тот же матч (разные рынки) — выбери один самый уверенный.
- Если сомневаешься в матче — не включай его. Лучше 3 чётких пика, чем 6 сомнительных.

${seasonalityText}

ФОРМАТ JSON (СТРОГО, без markdown):
Каждый объект:
{
  "sport": "Футбол|Баскетбол|Теннис|Хоккей|Киберспорт|Бейсбол|Волейбол",
  "league": "турнир из списка активных",
  "team1": "команда/игрок 1 (из источника)",
  "team2": "команда/игрок 2 (из источника)",
  "time": "HH:MM по Мск или пусто",
  "market": "рынок ставки",
  "selection": "выбор",
  "odds": число 1.10-15.0 (типичный для рынка; 1.90 для тотала, 1.75 для фаворита),
  "confidence": "low|medium|high",
  "confidenceScore": 5-99,
  "reasoning": "анализ 1-3 предложения",
  "risk": "риск",
  "sourceQuote": "ТОЧНАЯ цитата из источника с упоминанием матча/команд",
  "sourceUrl": "URL источника",
  "sourceName": "host источника",
  "dataSource": "ESPN API" (если матч из ESPN-блока) ИЛИ "Веб-поиск" (если из веб-поиска)
}

Если по виду спорта нет валидных матчей в источниках — не включай его. Верни только JSON-массив.`;

  const slamInstruction = activeSlam
    ? `\n\nВАЖНО: Сейчас идёт турнир Большого шлема — ${activeSlam}. В ответе ОБЯЗАТЕЛЬНО должно быть МИНИМУМ 2 теннисных пика из ${activeSlam}: ОДИН ATP (мужчины) + ОДИН WTA (женщины), если в источниках есть матчи на сегодня (ещё не начавшиеся к ${timeMsk} МСК). Ищи в источниках расписание вида "HH:MM Игрок1 — Игрок2". ATP и WTA идут параллельно каждый день.`
    : '';

  // Есть ли WNBA-матчи сегодня? Если да — пик обязателен.
  const hasWnba = apiEvents.some((e) => e.sportKey === 'basketball' && e.league === 'WNBA');
  const hasNba = apiEvents.some((e) => e.sportKey === 'basketball' && e.league === 'НБА');
  const hasBasketball = hasWnba || hasNba;
  const basketballInstruction = hasBasketball
    ? `\n\nВАЖНО: Сегодня есть матчи ${hasNba ? 'НБА' : 'WNBA'} (баскетбол) в ESPN API. В ответе ОБЯЗАТЕЛЬНО должен быть МИНИМУМ 1 пик по баскетболу.`
    : '';

  // MLB обязателен?
  const hasMlb = apiEvents.some((e) => e.sportKey === 'baseball');
  const mlbInstruction = hasMlb
    ? `\n\nВАЖНО: Сегодня есть матчи MLB (бейсбол) в ESPN API. В ответе ОБЯЗАТЕЛЬНО должен быть МИНИМУМ 1 пик по бейсболу. НЕ игнорируй MLB!`
    : '';

  // НХЛ обязателен?
  const hasNhl = apiEvents.some((e) => e.sportKey === 'hockey' && e.league === 'НХЛ');
  const hasKhl = active.hockey.some((h) => h.includes('КХЛ'));
  const hockeyInstruction = hasNhl || hasKhl
    ? `\n\nВАЖНО: ${hasNhl ? 'НХЛ' : 'КХЛ'} в сезоне. В ответе ОБЯЗАТЕЛЬНО должен быть МИНИМУМ 1 пик по хоккею. ${hasNhl ? 'Берётся из ESPN API.' : 'Берётся из веб-поиска.'}`
    : '';

  // Идёт ли Лига наций по волейболу? Если да — пик обязателен.
  const hasVolleyball = active.volleyball.length > 0;
  const volleyballInstruction = hasVolleyball
    ? `\n\nВАЖНО: Сейчас идёт Лига наций по волейболу (мужчины и женщины). В ответе ОБЯЗАТЕЛЬНО должен быть МИНИМУМ 1 пик по волейболу, если в источниках есть матчи на сегодня.`
    : '';

  // Футбольные лиги в сезоне? (с сентября по май)
  const hasFootball = active.football.length > 0;
  const isSaturday = weekday.toLowerCase().includes('суббот') || weekday.toLowerCase().includes('субб');
  const footballInstruction = hasFootball
    ? `\n\nВАЖНО: Сейчас в сезоне футбольные лиги (${active.football.join(', ')}). В ответе ОБЯЗАТЕЛЬНО должен быть МИНИМУМ ${isSaturday ? '2' : '1'} футбольный пик${isSaturday ? ' (разные лиги — например АПЛ + Ла Лига)' : ''} из этих лиг. Ищи в источниках расписание матчей на сегодня.`
    : '';

  // Теннис обязателен?
  const tennisInstruction = activeSlam || active.tennis.length > 0
    ? `\n\nВАЖНО: ${activeSlam ? `Идёт турнир Большого шлема — ${activeSlam}.` : 'ATP/WTA в сезоне.'} В ответе ОБЯЗАТЕЛЬНО должен быть МИНИМУМ ${activeSlam ? '2 (ATP + WTA)' : '1'} теннисный пик.`
    : '';

  const userPrompt = `Сегодня: ${weekday}, ${pretty}. Время по Мск: ${timeMsk}. Дата YYYY-MM-DD: ${dayKey}.${slamInstruction}${basketballInstruction}${mlbInstruction}${hockeyInstruction}${volleyballInstruction}${footballInstruction}${tennisInstruction}

Стратегия:
1. СНАЧАЛА используй матчи из блока «ТОЧНОЕ РАСПИСАНИЕ ИЗ ESPN API» (ниже) — это гарантированно точные матчи ЧМ/АПЛ/Ла Лига/MLB/НБА/НХЛ. Для них НЕ нужен веб-поиск.
2. ДЛЯ ТЕННИСА/КИБЕРСПОРТА/ВОЛЕЙБОЛА/КХЛ — извлекай матчи из веб-поиска по правилам выше. ${activeSlam ? `Особое внимание — ${activeSlam}: МИНИМУМ 2 пика обязательно (1 ATP + 1 WTA).` : ''}
3. ОБЯЗАТЕЛЬНЫЕ ВИДЫ СПОРТА (не игнорируй!):
   - ⚽ Футбол: МИНИМУМ ${isSaturday ? '2' : '1'} пика
   - ⚾ Бейсбол (MLB): МИНИМУМ 1 пик (если есть в ESPN API)
   - 🏀 Баскетбол (НБА/WNBA): МИНИМУМ 1 пик (если есть в ESPN API)
   - 🏒 Хоккей (НХЛ/КХЛ): МИНИМУМ 1 пик
   - 🎾 Теннис: МИНИМУМ 1 пик${activeSlam ? ' (2 если БШ: ATP+WTA)' : ''}

${apiScheduleText}

=== ВЕБ-ПОИСК (для тенниса, киберспорта и др.) ===
${context}

Верни JSON-массив пиков. Для ESPN-матчей: dataSource="ESPN API", sourceName="ESPN API". Для веб-поиска: dataSource="Веб-поиск". Не выдумывай матчи.${activeSlam ? ` Помни: 2 пика из ${activeSlam} ОБЯЗАТЕЛЬНЫ (1 ATP + 1 WTA).` : ''}${hasWnba ? ` Помни: пик по WNBA ОБЯЗАТЕЛЕН.` : ''}${hasVolleyball ? ` Помни: пик по волейболу ОБЯЗАТЕЛЕН.` : ''}`;

  let content = '[]';
  try {
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'assistant', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      thinking: { type: 'disabled' },
    });
    bumpLLM();
    content = completion.choices[0]?.message?.content || '[]';
  } catch (e) {
    console.error('LLM call failed:', e);
    return {
      picks: cached?.picks ?? [],
      cached: !!cached,
      date: dayKey,
      usage: getUsage(),
      activeLeagues: active,
      sportsSearched: SPORTS.length,
      filteredOut: 0,
    };
  }

  const generatedAt = new Date().toISOString();
  const allPicks = parsePicks(content, generatedAt, dayKey);

  // Постфильтр: дополнительно отсекаем пики по лигам, не активным в текущем
  // месяце (на случай, если LLM всё же включила КХЛ в июле и т.п.)
  const allowedBySport: Record<string, string[]> = {
    football: active.football,
    basketball: active.basketball,
    tennis: active.tennis,
    hockey: active.hockey,
    esports: active.esports,
    volleyball: active.volleyball,
    baseball: active.baseball || ['MLB'],
  };
  const picks: Pick[] = [];
  let filteredOut = 0;
  for (const p of allPicks) {
    const allowed = allowedBySport[p.sportKey] || [];
    const isFromApi = p.dataSource === 'ESPN API' || p.dataSource === 'API-Sports';

    // Проверка 0 (ВАЛИДАЦИЯ СПОРТ↔ЛИГА): отлов mismatches вида «Футбол + Уимблдон».
    // Если в лиге явно указан турнир другого вида спорта — отбраковываем.
    const leagueLower = (p.league || '').toLowerCase();
    const WRONG_LEAGUE_FOR_SPORT: Record<string, string[]> = {
      football: ['уимблдон', 'roland garros', 'australian open', 'us open', 'wnba', 'mlb', 'nba', 'нхл', 'кхл', 'iem', 'lol', 'лига наций волейбол'],
      basketball: ['уимблдон', 'roland garros', 'australian open', 'us open', 'mlb', 'чемпионат мира по футболу', 'чм-2026', 'апл', 'ла лига', 'iem', 'лига наций волейбол'],
      tennis: ['wnba', 'mlb', 'nba', 'нхл', 'кхл', 'чемпионат мира по футболу', 'чм-2026', 'апл', 'iem', 'lol', 'лига наций волейбол'],
      hockey: ['уимблдон', 'wnba', 'mlb', 'nba', 'чемпионат мира по футболу', 'iem', 'лига наций волейбол'],
      esports: ['уимблдон', 'roland garros', 'wnba', 'mlb', 'nba', 'нхл', 'кхл', 'чемпионат мира по футболу', 'апл', 'ла лига', 'лига наций волейбол'],
      baseball: ['уимблдон', 'roland garros', 'wnba', 'nba', 'нхл', 'кхл', 'чемпионат мира по футболу', 'апл', 'iem', 'лига наций волейбол'],
      volleyball: ['уимблдон', 'roland garros', 'wnba', 'mlb', 'nba', 'нхл', 'кхл', 'чемпионат мира по футболу', 'апл', 'iem'],
    };
    const wrongLeagues = WRONG_LEAGUE_FOR_SPORT[p.sportKey] || [];
    const isWrongLeague = wrongLeagues.some((wl) => leagueLower.includes(wl));
    if (isWrongLeague) {
      filteredOut += 1;
      console.warn(
        `[picks] filtered out (wrong league for sport): sport=${p.sportKey}, league=${p.league} (${p.team1} vs ${p.team2})`,
      );
      continue;
    }

    // Проверка 0b (АНТИ-УИМБЛДОН-ПОСЛЕ-ЗАВЕРШЕНИЯ):
    // Если БШ-турнир НЕ активен сейчас, а лига содержит имя БШ — это галлюцинация
    // (LLM нашла архив результатов и лепит БШ-имя на текущий ATP-матч).
    // Отбраковываем такие пики.
    const SLAM_NAMES = ['уимблдон', 'wimbledon', 'roland garros', 'australian open', 'us open'];
    const leagueHasSlam = SLAM_NAMES.some((s) => leagueLower.includes(s));
    if (leagueHasSlam && !activeSlam) {
      filteredOut += 1;
      console.warn(
        `[picks] filtered out (slam league when no slam active): league=${p.league} (${p.team1} vs ${p.team2}) — slam=${activeSlam || 'NONE'}`,
      );
      continue;
    }

    // Проверка 1: лига должна быть активной в текущем сезоне
    // (для ESPN-матчей ЧМ/MLB/WNBA это автоматически проходит, т.к. они уже
    // отфильтрованы по сезонности на этапе getActiveLeagues + ESPN endpoint)
    if (!isLeagueAllowed(p.league, allowed) && !isFromApi) {
      filteredOut += 1;
      console.warn(
        `[picks] filtered out off-season league: ${p.sport}/${p.league} (${p.team1} vs ${p.team2})`,
      );
      continue;
    }

    // Проверка 2 (АНТИ-ГАЛЛЮЦИНАЦИЯ + АНТИ-CROSS-CONTAMINATION):
    // Для веб-поиска: sourceQuote обязан содержать оба имени РЯДОМ (≤100 символов).
    // Для ESPN API-матчей: цитата формируется программно, проверка не нужна.
    // ВАЖНО: имена могут быть на разных языках (англ в team1, рус в sourceQuote).
    // Транслитерируем оба варианта для надёжного сопоставления.
    if (!isFromApi) {
      // Транслитерация русских имён в латиницу
      const TRANSLIT: Record<string, string> = {
        а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',
        к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',
        х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya'
      };
      const translit = (s: string): string => {
        let r = '';
        for (const ch of s.toLowerCase()) r += TRANSLIT[ch] !== undefined ? TRANSLIT[ch] : ch;
        return r;
      };

      const quoteOrig = (p.sourceQuote || '').toLowerCase().trim();
      const quoteLat = translit(quoteOrig); // транслит версии
      const t1Orig = (p.team1 || '').toLowerCase().trim();
      const t1Lat = translit(t1Orig);
      const t2Orig = (p.team2 || '').toLowerCase().trim();
      const t2Lat = translit(t2Orig);

      // Берём части имён (≥4 символа) — оба варианта (оригинал + транслит)
      const t1Parts = [...new Set([
        ...t1Orig.split(/\s+/).filter((s) => s.length >= 4),
        ...t1Lat.split(/\s+/).filter((s) => s.length >= 4),
      ])];
      const t2Parts = [...new Set([
        ...t2Orig.split(/\s+/).filter((s) => s.length >= 4),
        ...t2Lat.split(/\s+/).filter((s) => s.length >= 4),
      ])];

      // Ищем в обеих версиях цитаты (оригинал + транслит)
      const searchIn = (text: string, parts: string[]): number[] => {
        const positions: number[] = [];
        for (const part of parts) {
          let idx = text.indexOf(part);
          while (idx !== -1) { positions.push(idx); idx = text.indexOf(part, idx + 1); }
        }
        return positions;
      };

      const t1Positions = [...searchIn(quoteOrig, t1Parts), ...searchIn(quoteLat, t1Parts)];
      const t2Positions = [...searchIn(quoteOrig, t2Parts), ...searchIn(quoteLat, t2Parts)];

      const bothPresent = t1Positions.length > 0 && t2Positions.length > 0;
      let minDistance = Infinity;
      let hasMatchSeparator = false;
      if (bothPresent) {
        for (const a of t1Positions) {
          for (const b of t2Positions) {
            const dist = Math.abs(a - b);
            if (dist < minDistance) {
              minDistance = dist;
              const start = Math.min(a, b);
              const end = Math.max(a, b);
              const betweenText = (quoteOrig + ' ' + quoteLat).slice(start, end + 30);
              const matchSep = /\s(—|-|–|vs\.?|v\.?|против|встречается|plays)\s/i.test(betweenText);
              if (matchSep) hasMatchSeparator = true;
            }
          }
        }
      }
      // Лимит 100 символов (было 60) — в расписаниях БШ-турниров имена
      // могут быть разделены другими игроками в одной строке/цитате
      const namesClose = minDistance <= 100;

      // АНТИ-СПИСОК: если оба имени есть, но между ними НЕТ разделителя матча
      // (—, -, vs, против) — это СПИСОК игроков, а не пара матча → отбраковка
      // Пример: "Zverev, Auger-Aliassime, Fritz in action" — это список, не матч
      // Пример: "Sabalenka · Rybakina playing" — это список, не матч
      // ИСКЛЮЧЕНИЕ: БШ-турниры (US Open, Wimbledon и т.д.) — источник可信 (atptour, wtatennis)
      // Если цитата содержит разделитель матча (—, –, vs, v) — принимаем даже если
      // имена на другом языке (транслитерация не всегда работает)
      const isSlamLeague = ['us open', 'уимблдон', 'wimbledon', 'roland garros', 'australian open'].some(
        (s) => (p.league || '').toLowerCase().includes(s)
      );
      // Для БШ: если есть разделитель в цитате и длина ≥15 — принимаем
      const hasMatchSepInQuote = /\s(—|-|–|vs\.?|v\.?|против)\s/i.test(quoteOrig);
      const slamException = isSlamLeague && hasMatchSepInQuote && quoteOrig.length >= 15;

      if (!quoteOrig || quoteOrig.length < 15 || (!slamException && (!bothPresent || !namesClose || !hasMatchSeparator))) {
        filteredOut += 1;
        console.warn(
          `[picks] filtered out (no valid sourceQuote, names too far, or list not match: dist=${minDistance}, sep=${hasMatchSeparator}): ${p.sport}/${p.league} (${p.team1} vs ${p.team2}) — quote="${p.sourceQuote?.slice(0, 80)}"`,
        );
        continue;
      }
    } else {
      // Для ESPN-матчей: источник уже валиден, но проверим что пик
      // соответствует одному из полученных из API событий.
      // Используем мягкое совпадение: хотя бы по 4 символам каждого имени.
      const norm = (s: string) => s.toLowerCase().replace(/[^a-zа-яё0-9]/gi, '');
      const p1 = norm(p.team1);
      const p2 = norm(p.team2);
      const matchInApi = apiEvents.some((ev) => {
        const e1 = norm(ev.team1);
        const e2 = norm(ev.team2);
        // Проверяем в обе стороны (home/away могут быть перепутаны)
        const direct =
          (e1.includes(p1.slice(0, 4)) || p1.includes(e1.slice(0, 4))) &&
          (e2.includes(p2.slice(0, 4)) || p2.includes(e2.slice(0, 4)));
        const swapped =
          (e2.includes(p1.slice(0, 4)) || p1.includes(e2.slice(0, 4))) &&
          (e1.includes(p2.slice(0, 4)) || p2.includes(e1.slice(0, 4)));
        return direct || swapped;
      });
      if (!matchInApi) {
        filteredOut += 1;
        console.warn(
          `[picks] filtered out (ESPN pick not in API events): ${p.sport}/${p.league} (${p.team1} vs ${p.team2})`,
        );
        continue;
      }
    }

    // Проверка 3 (АНТИ-ПРОШЕДШИЕ): если в sourceQuote или reasoning
    // есть слова-маркеры прошедшего матча («выиграла», «завершился» и т.п.)
    // — отбраковываем. Это решает случай «Team Falcons выиграла IEM Major».
    const pastCheck = hasPastMarker(p.sourceQuote + ' ' + p.reasoning + ' ' + p.risk);
    if (pastCheck.hit) {
      filteredOut += 1;
      console.warn(
        `[picks] filtered out (past event, marker="${pastCheck.marker}"): ${p.sport}/${p.league} (${p.team1} vs ${p.team2}) — quote="${p.sourceQuote?.slice(0, 80)}"`,
      );
      continue;
    }

    // Проверка 3b: если в sourceQuote есть счёт матча (паттерн «цифра:цифра»
    // или «цифра - цифра» рядом с командами) — это уже сыгранный матч.
    {
      // Исключаем время HH:MM (например "13:00"). Убираем без \b, чтобы чистить
      // и слитые с годом/датой варианты вида "03.07.2611:00" (= дата 03.07.26 + 11:00).
      // Время всегда имеет 2 цифры после двоеточия; счёт часто с 1 цифрой (2:1).
      const withoutTime = p.sourceQuote.replace(/\d{1,2}:\d{2}/g, '');
      if (/\d{1,2}\s*[:\-–]\s*\d{1,2}/.test(withoutTime)) {
        filteredOut += 1;
        console.warn(
          `[picks] filtered out (has score in quote = past match): ${p.sport}/${p.league} (${p.team1} vs ${p.team2}) — quote="${p.sourceQuote?.slice(0, 80)}"`,
        );
        continue;
      }
    }

    // Проверка 4: если startTime задано и уже прошло по Мск (с буфером 30 мин) — отбраковываем.
    // ВАЖНО: для ESPN-пиков эту проверку пропускаем — они уже отфильтрованы в filterUpcoming
    // по полной UTC-дате. ESPN-матч может быть в 01:40 МСК (ночь следующего дня), и простое
    // сравнение HH:MM ложно посчитает его прошедшим.
    if (!isFromApi && timeAlreadyPassed(p.startTime, timeMsk)) {
      filteredOut += 1;
      console.warn(
        `[picks] filtered out (time already passed: start=${p.startTime}, now=${timeMsk}): ${p.sport}/${p.league} (${p.team1} vs ${p.team2})`,
      );
      continue;
    }

    // Если LLM не выдала коэффициент — ставим нейтральный дефолт
    if (!p.odds || p.odds === '—') {
      p.odds = '1.90';
    }
    picks.push(p);
  }

  // Дедупликация: если несколько пиков на один матч (team1+team2+startTime),
  // оставляем только первый.
  const seen = new Set<string>();
  const deduped: Pick[] = [];
  for (const p of picks) {
    const key = `${p.sportKey}|${p.team1.toLowerCase()}|${p.team2.toLowerCase()}|${p.startTime}`.toLowerCase();
    if (seen.has(key)) {
      filteredOut += 1;
      continue;
    }
    seen.add(key);
    deduped.push(p);
  }

  if (deduped.length > 0) {
    cache.set(cacheKey, { picks: deduped, ts: Date.now() });
    usage.generations += 1;
  }

  // ===== ПОСТ-ПРОВЕРКА WTA (во время БШ-турнира) =====
  // Если БШ-турнир идёт, но в ответе НЕТ WTA-пика — это ошибка.
  // Z.ai часто находит только ATP. Дополнительный поиск WTA через web_search.
  if (activeSlam && deduped.length > 0) {
    const hasWTA = deduped.some((p) => {
      // Эвристика: WTA-игроки — женские имена (не классические мужские)
      // Проще: если в лиге есть "WTA" или team1/team2 содержит известные женские имена
      const w = (p.team1 + ' ' + p.team2 + ' ' + p.league).toLowerCase();
      const wtaNames = ['sabalenka', 'rybakina', 'pegula', 'gauff', 'swiatek', 'andreeva', 'keys',
        'muchova', 'krejcikova', 'ostapenko', 'vondrousova', 'navarro', 'badosa', 'anisimova',
        'cirstea', 'siniakova', 'kasatkina', 'kalinina', 'alexandrova', 'putintseva',
        'женщин', 'wta', 'сабаленка', 'рыбакина', 'пегула', 'гауфф'];
      return wtaNames.some((n) => w.includes(n));
    });
    const hasATP = deduped.some((p) => {
      const m = (p.team1 + ' ' + p.team2).toLowerCase();
      const atpNames = ['alcaraz', 'sinner', 'djokovic', 'medvedev', 'zverev', 'rublev',
        'khachanov', 'fritz', 'tiafoe', 'shelton', 'rune', 'auger', 'de minaur', 'cobolli',
        'алькарас', 'синнер', 'джокович', 'медведев', 'зверев', 'рублёв', 'хачанов'];
      return atpNames.some((n) => m.includes(n));
    });

    // Если есть ATP но нет WTA — дополнительный поиск WTA
    if (hasATP && !hasWTA) {
      console.log('[picks] WTA pick missing! Searching for WTA matches...');
      try {
        const zai = await ZAI.create();
        const wtaResults = await zai.functions.invoke('web_search', {
          query: `${activeSlam} 2026 WTA women schedule order of play ${dayKey} matches today time`,
          num: 8,
        });

        if (wtaResults && wtaResults.length > 0) {
          // Ищем матчи в результатах — несколько паттернов
          // 1. "Player1 vs Player2" / "Player1 v Player2"
          // 2. "Player1 takes on Player2" / "Player1 plays Player2"
          // 3. "Player1 — Player2" / "Player1 - Player2"
          // 4. "Player1 to face Player2"
          // 5. С seed-номерами: "Sabalenka vs. 29. Iva Jovic" / "6. Jessica Pegula"
          // Разрешаем цифры и точки перед именем (seed)
          const namePattern = '(?:\\d+\\.\\s*)?([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)*)';
          const matchRegex1 = new RegExp(namePattern + '\\s+(?:vs?\\.?|—|–|-|takes\\s+on|plays)\\s+' + namePattern, 'g');
          const matchRegex2 = new RegExp(namePattern + '\\s+to\\s+face\\s+' + namePattern, 'g');
          let wtaMatch: { p1: string; p2: string; quote: string; url: string; host: string } | null = null;

          const isValidMatch = (p1: string, p2: string): boolean => {
            if (p1.toLowerCase() === p2.toLowerCase()) return false;
            // Убираем мусорные слова из имён (Stadium, Court, Open и т.д.)
            const cleanName = (n: string) => n.replace(/\b(Stadium|Court|Open|Round|Session|Series|Tour|Final|Finals)\b/gi, '').trim();
            const c1 = cleanName(p1);
            const c2 = cleanName(p2);
            if (c1.length < 5 || c2.length < 5) return false;
            if (c1.toLowerCase() === c2.toLowerCase()) return false;
            // Мужские имена — но БЕЗ 'Alex' (Alex Eala — женщина!)
            const menNames = ['Alcaraz', 'Sinner', 'Djokovic', 'Medvedev', 'Zverev', 'Rublev',
              'Khachanov', 'Fritz', 'Tiafoe', 'Shelton', 'Rune', 'Auger', 'Minaur', 'Cobolli',
              'Carlos', 'Jannik', 'Novak', 'Daniil', 'Alexander', 'Andrey', 'Karen', 'Taylor',
              'Paul', 'Tommy', 'Arthur', 'Feliciano', 'Benjamin', 'Matteo', 'Marin', 'Holger',
              'Daniel', 'Tomas', 'Hubert', 'Sebastian', 'Frances', 'Mensik', 'Rublev',
              'Ruud', 'Casper', 'Tsitsipas', 'Stefanos'];
            if (menNames.some((n) => c1.includes(n) || c2.includes(n))) return false;
            return true;
          };

          for (const r of wtaResults) {
            const text = (r.name + ' ' + r.snippet).trim();
            const matches1 = [...text.matchAll(matchRegex1)];
            const matches2 = [...text.matchAll(matchRegex2)];
            const allMatches = [...matches1, ...matches2];
            for (const m of allMatches) {
              const p1Raw = m[1].trim();
              const p2Raw = m[2].trim();
              // Очищаем от мусорных слов (Stadium, Court, Open и т.д.)
              const cleanName = (n: string) => n.replace(/\b(Stadium|Court|Open|Round|Session|Series|Tour|Final|Finals)\b/gi, '').trim();
              const p1 = cleanName(p1Raw);
              const p2 = cleanName(p2Raw);
              if (!isValidMatch(p1, p2)) continue;
              wtaMatch = { p1, p2, quote: text.slice(Math.max(0, m.index! - 20), m.index! + 80), url: r.url, host: r.host_name };
              break;
            }
            if (wtaMatch) break;
          }

          if (wtaMatch) {
            // Создаём WTA пик
            const wtaId = `pick-${dayKey}-tennis-${wtaMatch.p1.toLowerCase().replace(/[^a-z]/g, '').slice(0, 12)}-${wtaMatch.p2.toLowerCase().replace(/[^a-z]/g, '').slice(0, 12)}-2100`;
            const wtaPick: Pick = {
              id: wtaId,
              sport: 'Теннис',
              sportKey: 'tennis',
              sportIcon: '🎾',
              league: activeSlam,
              team1: wtaMatch.p1,
              team2: wtaMatch.p2,
              startTime: '21:00',
              market: 'Победитель матча',
              selection: wtaMatch.p1,
              odds: '1.40',
              confidence: 'high',
              confidenceScore: 85,
              reasoning: `WTA матч ${activeSlam}, найден через дополнительный поиск. ${wtaMatch.p1} — фаворит.`,
              risk: 'WTA матчи менее предсказуемы, возможен апсет.',
              sourceQuote: wtaMatch.quote,
              sourceUrl: wtaMatch.url,
              sourceName: wtaMatch.host,
              dataSource: 'Веб-поиск',
              generatedAt: new Date().toISOString(),
              crossCheckAgree: null,
              crossCheckConfidence: null,
              crossCheckReasoning: null,
              crossCheckScore: null,
              crossCheckModel: null,
            };
            deduped.push(wtaPick);
            console.log(`[picks] WTA pick added: ${wtaMatch.p1} vs ${wtaMatch.p2}`);
          } else {
            console.log('[picks] WTA match not found in search results');
            // Логируем ошибку в журнал
            try {
              const { db } = await import('@/lib/db');
              const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' });
              await db.errorLog.create({
                data: {
                  date: today,
                  category: 'wta',
                  severity: 'warning',
                  message: 'WTA матч не найден для БШ-турнира',
                  details: `БШ: ${activeSlam}, дата: ${dayKey}. Z.ai не нашёл WTA, доп. поиск тоже не дал результата.`,
                },
              });
            } catch { /* ignore */ }
          }
        }
      } catch (e) {
        console.error('[picks] WTA search failed:', e);
      }
    }

    // Проверка: если БШ идёт, но НЕТ ATP пика — тоже логируем
    const hasATPNow = deduped.some((p) => {
      const m = (p.team1 + ' ' + p.team2).toLowerCase();
      const atpNames = ['alcaraz', 'sinner', 'djokovic', 'medvedev', 'zverev', 'rublev',
        'khachanov', 'fritz', 'tiafoe', 'shelton', 'rune', 'auger', 'de minaur', 'cobolli',
        'алькарас', 'синнер', 'джокович', 'медведев', 'зверев', 'рублёв', 'хачанов',
        'paul', 'пол', 'michelsen', 'tiаfoe', 'shelton', 'шелтон'];
      return atpNames.some((n) => m.includes(n));
    });
    if (!hasATPNow) {
      console.log('[picks] ATP pick missing for slam!');
      try {
        const { db } = await import('@/lib/db');
        const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' });
        await db.errorLog.create({
          data: {
            date: today,
            category: 'atp',
            severity: 'warning',
            message: 'ATP матч не найден для БШ-турнира',
            details: `БШ: ${activeSlam}, дата: ${dayKey}. Возможные причины: матчи уже начались, Z.ai не нашёл расписание.`,
          },
        });
      } catch { /* ignore */ }
    }
  }

  // ===== ПОСТ-ПРОВЕРКА WNBA (если LLM забыл) =====
  // Если есть WNBA матчи в ESPN API, но LLM не включил ни одного — добавляем напрямую
  const hasWnbaPick = deduped.some((p) => p.sportKey === 'basketball' && p.league === 'WNBA');
  const wnbaEvents = apiEvents.filter((e) => e.sportKey === 'basketball' && e.league === 'WNBA');
  if (wnbaEvents.length > 0 && !hasWnbaPick) {
    console.log('[picks] WNBA pick missing! Adding from ESPN API...');
    // Берём первый upcoming WNBA матч
    const wnbaEvent = wnbaEvents[0];
    const wnbaId = `pick-${dayKey}-basketball-${wnbaEvent.team1.toLowerCase().replace(/[^a-z]/g, '').slice(0, 12)}-${wnbaEvent.team2.toLowerCase().replace(/[^a-z]/g, '').slice(0, 12)}`;
    deduped.push({
      id: wnbaId,
      sport: 'Баскетбол',
      sportKey: 'basketball',
      sportIcon: '🏀',
      league: 'WNBA',
      team1: wnbaEvent.team1,
      team2: wnbaEvent.team2,
      startTime: wnbaEvent.startTimeMsk,
      market: 'Победитель матча',
      selection: wnbaEvent.team1,
      odds: '1.75',
      confidence: 'medium',
      confidenceScore: 70,
      reasoning: `WNBA матч из ESPN API. ${wnbaEvent.team1} дома vs ${wnbaEvent.team2}.`,
      risk: 'WNBA матчи непредсказуемы.',
      sourceQuote: `ESPN API: ${wnbaEvent.team1} vs ${wnbaEvent.team2}, ${wnbaEvent.startTimeMsk} МСК`,
      sourceUrl: 'ESPN API',
      sourceName: 'ESPN API',
      dataSource: 'ESPN API',
      generatedAt: new Date().toISOString(),
      crossCheckAgree: null,
      crossCheckConfidence: null,
      crossCheckReasoning: null,
      crossCheckScore: null,
      crossCheckModel: null,
    });
    console.log(`[picks] WNBA pick added: ${wnbaEvent.team1} vs ${wnbaEvent.team2}`);
  }

  // ===== ПОСТ-ПРОВЕРКА MLB (если LLM забыл) =====
  const hasMlbPick = deduped.some((p) => p.sportKey === 'baseball');
  const mlbEvents = apiEvents.filter((e) => e.sportKey === 'baseball');
  if (mlbEvents.length > 0 && !hasMlbPick) {
    console.log('[picks] MLB pick missing! Adding from ESPN API...');
    const mlbEvent = mlbEvents[0];
    const mlbId = `pick-${dayKey}-baseball-${mlbEvent.team1.toLowerCase().replace(/[^a-z]/g, '').slice(0, 12)}-${mlbEvent.team2.toLowerCase().replace(/[^a-z]/g, '').slice(0, 12)}`;
    deduped.push({
      id: mlbId,
      sport: 'Бейсбол',
      sportKey: 'baseball',
      sportIcon: '⚾',
      league: 'MLB',
      team1: mlbEvent.team1,
      team2: mlbEvent.team2,
      startTime: mlbEvent.startTimeMsk,
      market: 'Победа матча',
      selection: mlbEvent.team1,
      odds: '1.75',
      confidence: 'medium',
      confidenceScore: 70,
      reasoning: `MLB матч из ESPN API. ${mlbEvent.team1} дома vs ${mlbEvent.team2}.`,
      risk: '',
      sourceQuote: `ESPN API: ${mlbEvent.team1} vs ${mlbEvent.team2}, ${mlbEvent.startTimeMsk} МСК`,
      sourceUrl: 'ESPN API',
      sourceName: 'ESPN API',
      dataSource: 'ESPN API',
      generatedAt: new Date().toISOString(),
      crossCheckAgree: null,
      crossCheckConfidence: null,
      crossCheckReasoning: null,
      crossCheckScore: null,
      crossCheckModel: null,
    });
    console.log(`[picks] MLB pick added: ${mlbEvent.team1} vs ${mlbEvent.team2}`);
  }

  // ===== ПОСТ-ПРОВЕРКА НХЛ (если LLM забыл) =====
  const hasNhlPick = deduped.some((p) => p.sportKey === 'hockey' && p.league === 'НХЛ');
  const nhlEvents = apiEvents.filter((e) => e.sportKey === 'hockey' && e.league === 'НХЛ');
  if (nhlEvents.length > 0 && !hasNhlPick) {
    console.log('[picks] NHL pick missing! Adding from ESPN API...');
    const nhlEvent = nhlEvents[0];
    const nhlId = `pick-${dayKey}-hockey-${nhlEvent.team1.toLowerCase().replace(/[^a-z]/g, '').slice(0, 12)}-${nhlEvent.team2.toLowerCase().replace(/[^a-z]/g, '').slice(0, 12)}`;
    deduped.push({
      id: nhlId,
      sport: 'Хоккей',
      sportKey: 'hockey',
      sportIcon: '🏒',
      league: 'НХЛ',
      team1: nhlEvent.team1,
      team2: nhlEvent.team2,
      startTime: nhlEvent.startTimeMsk,
      market: 'Победа матча',
      selection: nhlEvent.team1,
      odds: '1.75',
      confidence: 'medium',
      confidenceScore: 70,
      reasoning: `НХЛ матч из ESPN API. ${nhlEvent.team1} дома vs ${nhlEvent.team2}.`,
      risk: '',
      sourceQuote: `ESPN API: ${nhlEvent.team1} vs ${nhlEvent.team2}, ${nhlEvent.startTimeMsk} МСК`,
      sourceUrl: 'ESPN API',
      sourceName: 'ESPN API',
      dataSource: 'ESPN API',
      generatedAt: new Date().toISOString(),
      crossCheckAgree: null,
      crossCheckConfidence: null,
      crossCheckReasoning: null,
      crossCheckScore: null,
      crossCheckModel: null,
    });
    console.log(`[picks] NHL pick added: ${nhlEvent.team1} vs ${nhlEvent.team2}`);
  }

  // Автоматически помечаем бейсбол как Z only (без cross-check)
  for (const p of deduped) {
    if (p.sportKey === 'baseball' && !p.crossCheckAgree) {
      p.crossCheckAgree = 'agree';
      p.crossCheckModel = 'skipped-baseball';
      p.crossCheckConfidence = 0;
      p.crossCheckReasoning = 'Бейсбол: только Z.ai, без cross-check (Nemotron некомпетентен в MLB)';
      p.crossCheckScore = p.confidenceScore;
    }
  }

  // Сохраняем пики в БД для ведения статистики (не блокируя ответ).
  // Это бесплатно — никаких API-вызовов, только локальная SQLite.
  savePicksToDb(deduped, dayKey).catch((e) =>
    console.error('[picks] savePicksToDb failed:', e),
  );

  // ===== Автоматический cross-check ОТКЛЮЧЁН =====
  // Причина: gpt-oss:free имеет rate limit, авто-вызовы при каждой загрузке
  // страницы приводят к 429 ошибкам и крашу сервера.
  // Cross-check запускается вручную через API /api/cross-check
  // if (process.env.OPENROUTER_API_KEY && deduped.length > 0) {
  //   setTimeout(() => {
  //     import('./cross-check').then(({ crossCheckPick, saveCrossCheckResult }) => {
  //       console.log(`[picks] auto cross-check: starting for ${deduped.length} picks`);
  //       (async () => {
  //         for (const pick of deduped) {
  //           try {
  //             const result = await crossCheckPick(pick);
  //             if (result) {
  //               await saveCrossCheckResult(pick.id, result);
  //               console.log(`[picks] auto cross-check: ${pick.id} → ${result.agree}`);
  //             }
  //             await new Promise((r) => setTimeout(r, 2000));
  //           } catch (e) {
  //             console.error(`[picks] auto cross-check failed for ${pick.id}:`, e);
  //           }
  //         }
  //         console.log(`[picks] auto cross-check: done for ${deduped.length} picks`);
  //       })().catch((e) => console.error('[picks] auto cross-check error:', e));
  //     }).catch((e) => console.error('[picks] cross-check module import failed:', e));
  //   }, 3000);
  // }

  return {
    picks: deduped,
    cached: false,
    date: dayKey,
    usage: getUsage(),
    activeLeagues: active,
    sportsSearched: SPORTS.length,
    filteredOut,
  };
}
