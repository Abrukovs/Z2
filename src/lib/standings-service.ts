// ===== Модуль загрузки турнирных таблиц (standings) через ESPN API =====
// Бесплатно, без ключа. Даёт W-L статистику команд для enrichment cross-check.

interface StandingEntry {
  team: string;
  wins: number;
  losses: number;
  winPct: number;
  streak?: string;
  rank?: number;
}

export interface TeamStanding {
  team: string;
  wins: number;
  losses: number;
  winPct: number;
  rank: number;
  streak: string;
  league: string;
}

// Кэш на 30 минут (standings меняются медленно)
const cache = new Map<string, { data: TeamStanding[]; ts: number }>();
const CACHE_TTL = 30 * 60 * 1000;

// Маппинг наших sportKey → ESPN путь
const ESPN_PATHS: Record<string, { sport: string; league: string }> = {
  baseball: { sport: 'baseball', league: 'mlb' },
  basketball: { sport: 'basketball', league: 'wnba' }, // WNBA для лета
  football: { sport: 'soccer', league: 'fifa.world' }, // ЧМ
  hockey: { sport: 'hockey', league: 'nhl' },
  volleyball: { sport: 'volleyball', league: 'nations' }, // Лига наций
};

/**
 * Загрузить standings для указанного вида спорта
 */
export async function getStandings(sportKey: string): Promise<TeamStanding[]> {
  const path = ESPN_PATHS[sportKey];
  if (!path) return [];

  const cacheKey = `${sportKey}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.data;
  }

  try {
    // ESPN standings endpoint
    const url = `https://site.api.espn.com/apis/v2/sports/${path.sport}/${path.league}/standings`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      console.error(`[standings] HTTP ${res.status} for ${sportKey}`);
      return [];
    }
    const data = await res.json();

    const standings: TeamStanding[] = [];
    const children = data.children || [];
    for (const division of children) {
      const entries = division.standings?.entries || [];
      for (const entry of entries) {
        const stats = entry.stats || [];
        const wins = Number(stats.find((s: any) => s.abbreviation === 'W')?.value || 0);
        const losses = Number(stats.find((s: any) => s.abbreviation === 'L')?.value || 0);
        const winPct = Number(stats.find((s: any) => s.abbreviation === 'PCT')?.value || 0);
        const streak = stats.find((s: any) => s.abbreviation === 'STRK')?.displayValue || '';
        const rank = Number(stats.find((s: any) => s.abbreviation === 'RANK')?.value || 0);

        standings.push({
          team: entry.team?.displayName || '',
          wins,
          losses,
          winPct,
          rank,
          streak,
          league: division.name || path.league,
        });
      }
    }

    cache.set(cacheKey, { data: standings, ts: Date.now() });
    console.log(`[standings] loaded ${standings.length} teams for ${sportKey}`);
    return standings;
  } catch (e) {
    console.error(`[standings] error for ${sportKey}:`, e);
    return [];
  }
}

/**
 * Найти standings для конкретной команды (по имени)
 */
export function findTeamStanding(
  standings: TeamStanding[],
  teamName: string,
): TeamStanding | null {
  if (!teamName) return null;
  const lower = teamName.toLowerCase();

  // Точное совпадение
  let found = standings.find((s) => s.team.toLowerCase() === lower);
  if (found) return found;

  // Частичное совпадение (команда содержит имя или наоборот)
  found = standings.find(
    (s) => s.team.toLowerCase().includes(lower) || lower.includes(s.team.toLowerCase()),
  );
  if (found) return found;

  // По последнему слову (Brewers, Yankees, etc.)
  const lastWord = lower.split(' ').pop();
  if (lastWord && lastWord.length > 3) {
    found = standings.find((s) => s.team.toLowerCase().includes(lastWord));
    if (found) return found;
  }

  return null;
}

/**
 * Сформировать текстовую сводку standings для двух команд
 * Используется в cross-check промпте для enrichment
 */
export async function getTeamsFormContext(
  sportKey: string,
  team1: string,
  team2: string,
): Promise<string> {
  const standings = await getStandings(sportKey);
  if (standings.length === 0) return '';

  const s1 = findTeamStanding(standings, team1);
  const s2 = findTeamStanding(standings, team2);

  if (!s1 && !s2) return '';

  const parts: string[] = [];
  if (s1) {
    parts.push(
      `${team1}: ${s1.wins}В-${s1.losses}П (винрейт ${(s1.winPct * 100).toFixed(0)}%, место ${s1.rank || '?'}, серия: ${s1.streak || '—'})`,
    );
  }
  if (s2) {
    parts.push(
      `${team2}: ${s2.wins}В-${s2.losses}П (винрейт ${(s2.winPct * 100).toFixed(0)}%, место ${s2.rank || '?'}, серия: ${s2.streak || '—'})`,
    );
  }

  return parts.join('\n');
}
