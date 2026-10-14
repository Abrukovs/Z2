// ===== TheSportsDB fetcher — fallback для MLB/WNBA когда ESPN заблокирован =====
// Бесплатно, без ключа (test key "3")
// Получает расписание матчей по командам

// SportsEvent тип (упрощённый, совместимый с sports-data.ts)
interface SportsEvent {
  id: string;
  sport: string;
  sportKey: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  startTime: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  source: string;
}

const TSDB_KEY = '3'; // бесплатный test key
const TSDB_BASE = `https://www.thesportsdb.com/api/v1/json/${TSDB_KEY}`;

// Кэш на 30 минут
const cache = new Map<string, { data: SportsEvent[]; ts: number }>();
const CACHE_TTL = 30 * 60 * 1000;

// MLB команды с их ID в TheSportsDB
const MLB_TEAMS: { name: string; id: string }[] = [
  { name: 'New York Yankees', id: '135260' },
  { name: 'Boston Red Sox', id: '135252' },
  { name: 'Los Angeles Dodgers', id: '135272' },
  { name: 'Atlanta Braves', id: '135268' },
  { name: 'Chicago Cubs', id: '135269' },
  { name: 'Toronto Blue Jays', id: '135265' },
  { name: 'Baltimore Orioles', id: '135251' },
  { name: 'Tampa Bay Rays', id: '135263' },
  { name: 'Minnesota Twins', id: '135259' },
  { name: 'Cleveland Guardians', id: '135254' },
  { name: 'Houston Astros', id: '135256' },
  { name: 'Seattle Mariners', id: '135262' },
  { name: 'Texas Rangers', id: '135264' },
  { name: 'Detroit Tigers', id: '135255' },
  { name: 'Kansas City Royals', id: '135257' },
  { name: 'Chicago White Sox', id: '135253' },
  { name: 'Pittsburgh Pirates', id: '135277' },
  { name: 'Cincinnati Reds', id: '135270' },
  { name: 'Arizona Diamondbacks', id: '135267' },
  { name: 'San Francisco Giants', id: '135273' },
  { name: 'San Diego Padres', id: '135271' },
  { name: 'Philadelphia Phillies', id: '135276' },
  { name: 'Washington Nationals', id: '135266' },
  { name: 'New York Mets', id: '135261' },
  { name: 'Miami Marlins', id: '135269' },
  { name: 'Colorado Rockies', id: '135275' },
  { name: 'Los Angeles Angels', id: '135258' },
  { name: 'Milwaukee Brewers', id: '135274' },
  { name: 'Athletics', id: '135250' },
  { name: 'St. Louis Cardinals', id: '136908' },
];

// WNBA команды
const WNBA_TEAMS: { name: string; id: string }[] = [
  { name: 'Las Vegas Aces', id: '135281' },
  { name: 'New York Liberty', id: '135282' },
  { name: 'Connecticut Sun', id: '135283' },
  { name: 'Minnesota Lynx', id: '135284' },
  { name: 'Seattle Storm', id: '135285' },
  { name: 'Washington Mystics', id: '135286' },
  { name: 'Chicago Sky', id: '135287' },
  { name: 'Los Angeles Sparks', id: '135288' },
  { name: 'Atlanta Dream', id: '135289' },
  { name: 'Dallas Wings', id: '135290' },
  { name: 'Indiana Fever', id: '135291' },
  { name: 'Phoenix Mercury', id: '135292' },
  { name: 'Toronto Tempo', id: '135293' },
  { name: 'Portland Fire', id: '135294' },
  { name: 'Golden State Valkyries', id: '135295' },
];

interface TSDBEvent {
  idEvent: string;
  strEvent: string;
  dateEvent: string;
  strTime: string;
  strHomeTeam: string;
  strAwayTeam: string;
  idHomeTeam: string;
  idAwayTeam: string;
  strLeague: string;
  strSport: string;
}

/**
 * Получить матчи на указанную дату через TheSportsDB
 */
export async function getTSDBEvents(
  sportKey: string,
  date: string, // YYYY-MM-DD
): Promise<SportsEvent[]> {
  const cacheKey = `tsdb-${sportKey}-${date}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.data;
  }

  const teams = sportKey === 'baseball' ? MLB_TEAMS : sportKey === 'basketball' ? WNBA_TEAMS : [];
  if (teams.length === 0) return [];

  const events: SportsEvent[] = [];
  const seenEventIds = new Set<string>();

  // Запрашиваем следующий матч для каждой команды (ограничиваем до 10 параллельных)
  const batchSize = 10;
  for (let i = 0; i < teams.length; i += batchSize) {
    const batch = teams.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (team) => {
        try {
          const res = await fetch(`${TSDB_BASE}/eventsnext.php?id=${team.id}`, {
            signal: AbortSignal.timeout(8000),
          });
          if (!res.ok) return [];
          const data = await res.json();
          const events: TSDBEvent[] = data.events || [];
          return events.filter((e) => e.dateEvent === date);
        } catch {
          return [];
        }
      }),
    );

    for (const teamEvents of results) {
      for (const e of teamEvents) {
        if (seenEventIds.has(e.idEvent)) continue;
        seenEventIds.add(e.idEvent);

        // Конвертируем время UTC → Мск
        const timeUtc = e.strTime || '';
        let timeMsk = timeUtc;
        if (timeUtc) {
          try {
            const d = new Date(`${e.dateEvent}T${timeUtc}Z`);
            timeMsk = d.toLocaleTimeString('ru-RU', {
              hour: '2-digit',
              minute: '2-digit',
              timeZone: 'Europe/Moscow',
            });
          } catch {
            // leave as is
          }
        }

        events.push({
          id: `tsdb-${e.idEvent}`,
          sport: sportKey,
          sportKey,
          league: e.strLeague || (sportKey === 'baseball' ? 'MLB' : 'WNBA'),
          homeTeam: e.strHomeTeam,
          awayTeam: e.strAwayTeam,
          startTime: timeMsk,
          status: 'scheduled',
          homeScore: null,
          awayScore: null,
          source: 'TheSportsDB',
        });
      }
    }
  }

  cache.set(cacheKey, { data: events, ts: Date.now() });
  console.log(`[thesportsdb] ${sportKey}: found ${events.length} events for ${date}`);
  return events;
}
