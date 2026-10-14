// ====== TheSportsDB / ESPN — бесплатные источники расписания ======
// ESPN unofficial API: бесплатный, без ключа, отдаёт точные матчи дня в JSON.
// Используется для турниров, где веб-поиск даёт галлюцинации:
// ЧМ по футболу, WNBA, MLB. Для тенниса/киберспорта остаётся веб-поиск.

export interface SportsEvent {
  sportKey: string;       // football, basketball, baseball
  sportLabel: string;     // Футбол
  sportIcon: string;      // ⚽
  league: string;         // FIFA World Cup 2026
  team1: string;          // home team
  team2: string;          // away team
  startTimeMsk: string;   // HH:MM по Мск
  startTimeUtc: string;   // ISO UTC
  source: string;         // 'ESPN'
  sourceUrl: string;      // ссылка на матч (если есть)
  status: string;         // 'scheduled' | 'in-progress' | 'final'
}

// Кэш на 30 минут, чтобы не дёргать ESPN на каждый запрос
interface ApiCache {
  ts: number;
  data: SportsEvent[];
}
const apiCache = new Map<string, ApiCache>();
const API_CACHE_TTL = 30 * 60 * 1000;

// Маппинг sportKey → конфиг ESPN endpoint
const ESPN_SOURCES: {
  sportKey: string;
  sportLabel: string;
  sportIcon: string;
  leagueFilter?: string[]; // если задано — берём только эти лиги
  path: string;            // /sports/soccer/fifa.world
  leagueName?: string;     // короткое имя лиги для отображения (АПЛ, Ла Лига и т.д.)
}[] = [
  {
    sportKey: 'football',
    sportLabel: 'Футбол',
    sportIcon: '⚽',
    path: 'soccer/fifa.world',
    leagueFilter: ['FIFA World Cup', 'World Cup', 'World Cup Qualifying'],
  },
  // Лига наций УЕФА — международная пауза (сентябрь-ноябрь)
  // Когда клубные лиги не играют — Лига наций обязательно!
  {
    sportKey: 'football',
    sportLabel: 'Футбол',
    sportIcon: '⚽',
    path: 'soccer/uefa.nations',
    leagueName: 'Лига наций УЕФА',
  },
  // Клубные лиги — ESPN отдаёт точное расписание и результаты
  // Решает проблему галлюцинаций дат от Z.ai (веб-поиск)
  {
    sportKey: 'football',
    sportLabel: 'Футбол',
    sportIcon: '⚽',
    path: 'soccer/eng.1',
    leagueName: 'АПЛ',
  },
  {
    sportKey: 'football',
    sportLabel: 'Футбол',
    sportIcon: '⚽',
    path: 'soccer/esp.1',
    leagueName: 'Ла Лига',
  },
  {
    sportKey: 'football',
    sportLabel: 'Футбол',
    sportIcon: '⚽',
    path: 'soccer/ita.1',
    leagueName: 'Серия А',
  },
  {
    sportKey: 'football',
    sportLabel: 'Футбол',
    sportIcon: '⚽',
    path: 'soccer/ger.1',
    leagueName: 'Бундеслига',
  },
  {
    sportKey: 'football',
    sportLabel: 'Футбол',
    sportIcon: '⚽',
    path: 'soccer/fra.1',
    leagueName: 'Лига 1',
  },
  {
    sportKey: 'football',
    sportLabel: 'Футбол',
    sportIcon: '⚽',
    path: 'soccer/rus.1',
    leagueName: 'РПЛ',
  },
  {
    sportKey: 'basketball',
    sportLabel: 'Баскетбол',
    sportIcon: '🏀',
    path: 'basketball/wnba',
  },
  {
    sportKey: 'basketball',
    sportLabel: 'Баскетбол',
    sportIcon: '🏀',
    path: 'basketball/nba',
    leagueName: 'НБА',
  },
  {
    sportKey: 'baseball',
    sportLabel: 'Бейсбол',
    sportIcon: '⚾',
    path: 'baseball/mlb',
  },
  {
    sportKey: 'hockey',
    sportLabel: 'Хоккей',
    sportIcon: '🏒',
    path: 'hockey/nhl',
    leagueName: 'НХЛ',
  },
];

// Конвертация UTC ISO → Мск HH:MM
function utcToMskHHMM(isoUtc: string): string {
  try {
    const d = new Date(isoUtc);
    if (isNaN(d.getTime())) return '';
    // Мск = UTC+3
    const msk = new Date(d.getTime() + 3 * 60 * 60 * 1000);
    const hh = String(msk.getUTCHours()).padStart(2, '0');
    const mm = String(msk.getUTCMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  } catch {
    return '';
  }
}

function statusFromEspn(state: string): string {
  const s = (state || '').toLowerCase();
  if (s.includes('final') || s.includes('complete')) return 'final';
  // In-progress маркеры: конкретные слова, НЕ цифры (дата/время тоже содержит цифры)
  if (
    s.includes('in progress') ||
    s.includes('progress') ||
    s.includes('live') ||
    s.includes('q1') ||
    s.includes('q2') ||
    s.includes('q3') ||
    s.includes('q4') ||
    s.includes('halftime') ||
    s.includes('half-time') ||
    s.includes('1st period') ||
    s.includes('2nd period') ||
    s.includes('3rd period') ||
    /^\d{1,2}:\d{2}\s/.test(s) || // "12:34 2nd" — время в матче
    /^\d{1,2}-\d{1,2}/.test(s) // "3-2" — счёт в матче
  )
    return 'in-progress';
  return 'scheduled';
}

// Получить матчи дня по виду спорта из ESPN.
// В Next.js окружении fetch и node:https почему-то возвращают 400 от ESPN,
// хотя из bash curl работает. Используем child_process curl как fallback.
async function fetchEspnEvents(
  path: string,
  dateYmd: string,
): Promise<unknown[]> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard?dates=${dateYmd}`;
  const { exec } = await import('child_process');
  return new Promise<unknown[]>((resolve, reject) => {
    exec(
      `curl -s --compressed --max-time 15  "${url}"`,
      { encoding: 'utf8' },
      (err, stdout) => {
        if (err) {
          reject(err);
          return;
        }
        try {
          const data = JSON.parse(stdout) as { events?: unknown[] };
          resolve(data.events || []);
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)));
        }
      },
    );
  });
}

interface EspnEvent {
  name?: string;
  date?: string;
  status?: { type?: { detail?: string; state?: string } };
  competitions?: Array<{
    competitors?: Array<{
      homeAway?: string;
      team?: { displayName?: string; name?: string };
    }>;
    status?: { type?: { detail?: string; state?: string } };
  }>;
  league?: string;
}

// Главная функция: получить все события на дату по всем ESPN-источникам
export async function getTodayEventsFromApi(
  dateYmd: string,
): Promise<SportsEvent[]> {
  const cacheKey = `espn-${dateYmd}`;
  const cached = apiCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < API_CACHE_TTL) {
    return cached.data;
  }

  const all: SportsEvent[] = [];

  for (const src of ESPN_SOURCES) {
    try {
      const events = await fetchEspnEvents(src.path, dateYmd);
      for (const eRaw of events) {
        const e = eRaw as EspnEvent;
        const comps = e.competitions || [];
        const comp = comps[0];
        if (!comp) continue;
        const competitors = comp.competitors || [];
        if (competitors.length < 2) continue;

        // homeAway определяет, кто home/away
        let home = '';
        let away = '';
        for (const c of competitors) {
          const name = c.team?.displayName || c.team?.name || '';
          if (c.homeAway === 'home') home = name;
          else if (c.homeAway === 'away') away = name;
        }
        if (!home || !away) continue;

        const statusRaw =
          comp.status?.type?.detail ||
          e.status?.type?.detail ||
          'scheduled';

        // ФИЛЬТР: NHL preseason И NBA preseason — отбраковываем!
        // Preseason (Split Squad) — не настоящие матчи для ставок
        // Ключевые игроки отдыхают, составы разделены
        const isPreseason =
          (src.path.includes('hockey/nhl') || src.path.includes('basketball/nba')) &&
          (statusRaw.toLowerCase().includes('preseason') ||
            statusRaw.toLowerCase().includes('pre-season') ||
            statusRaw.toLowerCase().includes('split squad') ||
            (comp.status?.type?.name || '').toLowerCase().includes('pre') ||
            (e.season?.slug || '').toLowerCase().includes('pre'));
        if (isPreseason) {
          continue;
        }

        const status = statusFromEspn(statusRaw);

        const isoUtc = e.date || '';
        const startTimeMsk = utcToMskHHMM(isoUtc);

        all.push({
          sportKey: src.sportKey,
          sportLabel: src.sportLabel,
          sportIcon: src.sportIcon,
          league: src.leagueName
            ? src.leagueName // для клубных лиг: АПЛ, Ла Лига, и т.д.
            : src.leagueFilter
              ? // для ЧМ: имя лиги берём из leagueFilter[0] для удобства
                src.leagueFilter[0] === 'FIFA World Cup'
                ? 'Чемпионат мира по футболу'
                : src.sportLabel
              : src.sportLabel === 'Баскетбол'
                ? 'WNBA'
                : src.sportLabel === 'Бейсбол'
                  ? 'MLB'
                  : src.sportLabel,
          team1: home,
          team2: away,
          startTimeMsk,
          startTimeUtc: isoUtc,
          source: 'ESPN',
          sourceUrl: 'https://www.espn.com/',
          status,
        });
      }
    } catch (err) {
      console.error(`[sports-data] ESPN fetch failed for ${src.path}:`, err);
    }
    // Логируем сколько получили из каждого источника
    const gotCount = all.filter(
      (a) => a.sportKey === src.sportKey,
    ).length;
    console.log(`[sports-data] ESPN ${src.path}: ${gotCount} events parsed`);
    // Пауза между источниками
    await new Promise((r) => setTimeout(r, 300));
  }

  // Кэшируем только если есть данные (чтобы не кэшировать ошибки)
  if (all.length > 0) {
    apiCache.set(cacheKey, { ts: Date.now(), data: all });
  }
  return all;
}

// ===== Теннис: получение результатов из ESPN tennis API =====
// ESPN tennis API отдаёт completed матчи с winner и linescores (счёт по сетам)
// Используется для авто-результата теннисных пиков (ATP + WTA)

export interface TennisMatchResult {
  compId: string;
  player1Name: string; // displayName (e.g. "Jacob Fearnley")
  player2Name: string;
  player1Winner: boolean;
  player2Winner: boolean;
  player1Sets: number[]; // игры по сетам [7, 6]
  player2Sets: number[];
  status: string; // "Final" если завершён
  date: string;
}

// Кэш на 1 час (результаты меняются не часто)
const tennisCache = new Map<string, { ts: number; data: TennisMatchResult[] }>();
const TENNIS_CACHE_TTL = 60 * 60 * 1000;

// Транслитерация русских имён в латиницу (для сопоставления с ESPN)
const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

export function transliterateRuToLat(s: string): string {
  const lower = s.toLowerCase();
  let result = '';
  for (const ch of lower) {
    if (TRANSLIT[ch] !== undefined) result += TRANSLIT[ch];
    else result += ch;
  }
  return result;
}

/**
 * Загружает завершённые матчи ATP/WTA из ESPN tennis API.
 * date: YYYY-MM-DD — если передано, загружает результаты за конкретную дату
 *   (для исторических пиков — Уимблдон, Цинциннати и т.д.)
 * Если date не передано — загружает текущие результаты (US Open).
 * Возвращает массив матчей с именами игроков, winner и счётом по сетам.
 */
export async function fetchTennisResults(date?: string): Promise<TennisMatchResult[]> {
  const cacheKey = date ? `tennis-results-${date}` : 'tennis-results-current';
  const cached = tennisCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < TENNIS_CACHE_TTL) {
    return cached.data;
  }

  const results: TennisMatchResult[] = [];
  // Формат даты для ESPN: YYYYMMDD
  const dateEspn = date ? date.replace(/-/g, '') : '';

  // Загружаем ATP и WTA
  for (const tour of ['atp', 'wta']) {
    try {
      const url = dateEspn
        ? `https://site.api.espn.com/apis/site/v2/sports/tennis/${tour}/scoreboard?dates=${dateEspn}`
        : `https://site.api.espn.com/apis/site/v2/sports/tennis/${tour}/scoreboard`;
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) continue;
      const data = await res.json();
      const events = data.events || [];

      for (const event of events) {
        const groupings = event.groupings || [];
        for (const group of groupings) {
          const comps = group.competitions || [];
          for (const comp of comps) {
            const competitors = comp.competitors || [];
            if (competitors.length < 2) continue;

            const status = comp.status?.type?.shortDetail || '';
            const isFinal = comp.status?.type?.completed === true || status === 'Final';

            const home = competitors.find((c: any) => c.homeAway === 'home') || competitors[0];
            const away = competitors.find((c: any) => c.homeAway === 'away') || competitors[1];

            const p1Name = home?.athlete?.displayName || '';
            const p2Name = away?.athlete?.displayName || '';
            if (!p1Name || !p2Name) continue;

            const p1Sets = (home?.linescores || []).map((ls: any) => Number(ls.value) || 0);
            const p2Sets = (away?.linescores || []).map((ls: any) => Number(ls.value) || 0);

            results.push({
              compId: comp.id || '',
              player1Name: p1Name,
              player2Name: p2Name,
              player1Winner: !!home?.winner,
              player2Winner: !!away?.winner,
              player1Sets: p1Sets,
              player2Sets: p2Sets,
              status: isFinal ? 'Final' : status,
              date: comp.date || event.date || '',
            });
          }
        }
      }
    } catch (e) {
      console.error(`[sports-data] ESPN tennis ${tour} error:`, e);
    }
  }

  tennisCache.set(cacheKey, { ts: Date.now(), data: results });
  console.log(`[sports-data] Tennis results${date ? ` (${date})` : ''}: ${results.length} matches loaded`);
  return results;
}

/**
 * Найти результат теннисного матча по имени игрока.
 * Сопоставление по части имени (3+ символа) с транслитерацией русских имён.
 * Возвращает null если матч не найден или не завершён.
 */
export function findTennisResult(
  results: TennisMatchResult[],
  team1: string,
  team2: string,
): TennisMatchResult | null {
  // Транслитерируем русские имена в латиницу
  const t1Lat = transliterateRuToLat(team1);
  const t2Lat = transliterateRuToLat(team2);

  // Берём ключевые части имени (фамилию — последнее слово, ≥4 символа)
  const t1Parts = t1Lat.split(/\s+/).filter((s) => s.length >= 4);
  const t2Parts = t2Lat.split(/\s+/).filter((s) => s.length >= 4);

  for (const r of results) {
    if (r.status !== 'Final') continue;
    const p1Lat = r.player1Name.toLowerCase();
    const p2Lat = r.player2Name.toLowerCase();

    // Проверяем совпадение по любой комбинации (team1 = player1, team2 = player2 или наоборот)
    const match1 = t1Parts.some((p) => p1Lat.includes(p) || p1Lat.split(/\s+/).some((w) => w.includes(p)));
    const match2 = t2Parts.some((p) => p2Lat.includes(p) || p2Lat.split(/\s+/).some((w) => w.includes(p)));
    const matchSwapped1 = t1Parts.some((p) => p2Lat.includes(p) || p2Lat.split(/\s+/).some((w) => w.includes(p)));
    const matchSwapped2 = t2Parts.some((p) => p1Lat.includes(p) || p1Lat.split(/\s+/).some((w) => w.includes(p)));

    if ((match1 && match2) || (matchSwapped1 && matchSwapped2)) {
      return r;
    }
  }
  return null;
}

// Фильтр: оставить только предстоящие (scheduled) и не начавшиеся по Мск.
// ВАЖНО: сравниваем полную дату+время UTC, а не только HH:MM. Иначе матч
// в 01:40 МСК (ночь следующего дня) при текущем времени 13:51 МСК будет
// ложно отбракован как «прошедший».
export function filterUpcoming(
  events: SportsEvent[],
  currentTimeMsk: string,
): SportsEvent[] {
  // Текущее время в UTC (для сравнения с startTimeUtc)
  const nowUtc = Date.now();
  // Буфер 30 минут
  const bufferMs = 30 * 60 * 1000;
  return events.filter((e) => {
    if (e.status === 'final' || e.status === 'in-progress') return false;
    if (e.startTimeUtc) {
      const startUtc = Date.parse(e.startTimeUtc);
      if (!isNaN(startUtc)) {
        // Если матч уже начался (с буфером 30 мин) — отбраковываем
        if (startUtc + bufferMs < nowUtc) return false;
      }
    }
    return true;
  });
}
