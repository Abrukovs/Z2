// ====== API-Sports Volleyball — бесплатный API для волейбола ======
// Ключ: 2c6f8d35f4777b9791bc27b5aedec482 (бесплатный тариф API-Sports)
// Документация: https://api-sports.io/documentation/volleyball/v1
// Бесплатно: 100 запросов/день

import { exec } from 'child_process';

export interface VolleyballEvent {
  league: string;
  team1: string;
  team2: string;
  startTimeMsk: string;
  startTimeUtc: string;
  status: 'scheduled' | 'in-progress' | 'final';
  homeScore: number | null;
  awayScore: number | null;
  source: string;
  sourceUrl: string;
}

// Кэш на 30 минут
interface ApiCache {
  ts: number;
  data: VolleyballEvent[];
}
const apiCache = new Map<string, ApiCache>();
const API_CACHE_TTL = 30 * 60 * 1000;

const API_KEY = '2c6f8d35f4777b9791bc27b5aedec482';
const API_BASE = 'https://v1.volleyball.api-sports.io';

function fetchApi(path: string): Promise<unknown> {
  return new Promise((resolve) => {
    exec(
      `curl -s --compressed --max-time 15 -H "x-apisports-key: ${API_KEY}" "${API_BASE}${path}"`,
      { encoding: 'utf8' },
      (err, stdout) => {
        if (err) {
          console.error('[volleyball-data] fetch failed:', err.message);
          resolve(null);
          return;
        }
        try {
          resolve(JSON.parse(stdout));
        } catch (e) {
          console.error('[volleyball-data] parse failed:', e);
          resolve(null);
        }
      },
    );
  });
}

// Конвертация UTC → Мск HH:MM
function utcToMskHHMM(isoUtc: string): string {
  try {
    const d = new Date(isoUtc + 'Z');
    if (isNaN(d.getTime())) return '';
    const msk = new Date(d.getTime() + 3 * 60 * 60 * 1000);
    const hh = String(msk.getUTCHours()).padStart(2, '0');
    const mm = String(msk.getUTCMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  } catch {
    return '';
  }
}

interface ApiGame {
  league?: { name?: string };
  teams?: {
    home?: { name?: string };
    away?: { name?: string };
  };
  date?: string;
  time?: string;
  timestamp?: number;
  status?: { short?: string; long?: string };
  scores?: {
    home?: number;
    away?: number;
  };
}

// Получить матчи на дату
export async function getVolleyballEvents(
  dateYmd: string,
): Promise<VolleyballEvent[]> {
  const cacheKey = `volleyball-${dateYmd}`;
  const cached = apiCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < API_CACHE_TTL) {
    return cached.data;
  }

  const data = (await fetchApi(`/games?date=${dateYmd}`)) as {
    response?: ApiGame[];
  } | null;
  if (!data?.response) return [];

  const events: VolleyballEvent[] = [];
  for (const g of data.response) {
    const league = g.league?.name || 'Волейбол';
    const team1 = g.teams?.home?.name || '';
    const team2 = g.teams?.away?.name || '';
    if (!team1 || !team2) continue;

    // API-Sports отдаёт время в UTC: "08:00"
    const timeUtc = g.time || '';
    const timestamp = g.timestamp;
    let startTimeUtc = '';
    if (timestamp) {
      startTimeUtc = new Date(timestamp * 1000).toISOString();
    } else if (timeUtc) {
      startTimeUtc = `${dateYmd}T${timeUtc}:00`;
    }

    const startTimeMsk = startTimeUtc
      ? utcToMskHHMM(startTimeUtc.replace('.000Z', ''))
      : '';

    const statusShort = g.status?.short || '';
    let status: VolleyballEvent['status'] = 'scheduled';
    if (statusShort === 'FT' || statusShort === 'AOT' || statusShort === 'AP')
      status = 'final';
    else if (
      statusShort.startsWith('S') &&
      statusShort !== 'NS' &&
      statusShort !== 'PST' &&
      statusShort !== 'CANC'
    )
      status = 'in-progress';

    events.push({
      league,
      team1,
      team2,
      startTimeMsk,
      startTimeUtc,
      status,
      homeScore: g.scores?.home ?? null,
      awayScore: g.scores?.away ?? null,
      source: 'API-Sports',
      sourceUrl: 'https://v1.volleyball.api-sports.io',
    });
  }

  apiCache.set(cacheKey, { ts: Date.now(), data: events });
  console.log(`[volleyball-data] ${dateYmd}: ${events.length} matches from API-Sports`);
  return events;
}

// Фильтр: только предстоящие (scheduled) и не начавшиеся
export function filterUpcomingVolleyball(
  events: VolleyballEvent[],
): VolleyballEvent[] {
  const nowUtc = Date.now();
  const bufferMs = 30 * 60 * 1000;
  return events.filter((e) => {
    if (e.status === 'final' || e.status === 'in-progress') return false;
    if (e.startTimeUtc) {
      const startUtc = Date.parse(e.startTimeUtc);
      if (!isNaN(startUtc) && startUtc + bufferMs < nowUtc) return false;
    }
    return true;
  });
}

// Получить результаты завершённых матчей (для статистики)
export async function getVolleyballResults(
  dateYmd: string,
): Promise<
  { home: string; away: string; homeScore: number; awayScore: number; league: string }[]
> {
  const events = await getVolleyballEvents(dateYmd);
  return events
    .filter((e) => e.status === 'final' && e.homeScore !== null && e.awayScore !== null)
    .map((e) => ({
      home: e.team1,
      away: e.team2,
      homeScore: e.homeScore as number,
      awayScore: e.awayScore as number,
      league: e.league,
    }));
}
