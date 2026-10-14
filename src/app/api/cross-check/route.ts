import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { crossCheckPick, saveCrossCheckResult, getCrossCheckStats } from '@/lib/cross-check';
import type { Pick as PickType, Confidence } from '@/lib/picks-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 минут — для массовой обработки

const SPORT_ICONS_DB: Record<string, string> = {
  football: '⚽', basketball: '🏀', tennis: '🎾',
  hockey: '🏒', esports: '🎮', baseball: '⚾', volleyball: '🏐',
};

interface StoredPickRow {
  id: string;
  sport: string;
  sportKey: string;
  league: string;
  team1: string;
  team2: string;
  startTime: string;
  market: string;
  selection: string;
  odds: string;
  confidence: string;
  confidenceScore: number;
  dataSource: string;
  reasoning: string;
  risk: string;
  pickDate: string;
  crossCheckAgree: string | null;
}

function storedToPick(p: StoredPickRow): PickType {
  return {
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
    reasoning: p.reasoning || '',
    risk: p.risk || '',
    sourceQuote: '',
    sourceUrl: '',
    sourceName: '',
    dataSource: p.dataSource,
    generatedAt: new Date().toISOString(),
  };
}

// GET — статистика по cross-check
export async function GET() {
  try {
    const stats = await getCrossCheckStats();
    return NextResponse.json({ success: true, stats });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'failed to load stats' },
      { status: 500 },
    );
  }
}

// POST — запустить cross-check
// body: { mode: 'today' | 'date' | 'all' | 'single', date?: string, pickId?: string, limit?: number }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const mode = body.mode || 'today';
    const limit = Math.min(body.limit || 50, 200);

    let picks: StoredPickRow[] = [];

    if (mode === 'single' && body.pickId) {
      // Одиночный пик по id
      const single = await db.storedPick.findUnique({ where: { id: body.pickId } });
      if (single) picks = [single as unknown as StoredPickRow];
    } else if (mode === 'date' && body.date) {
      // Все пики за указанную дату
      picks = (await db.storedPick.findMany({
        where: { pickDate: body.date },
        orderBy: { createdAt: 'asc' },
      })) as unknown as StoredPickRow[];
    } else if (mode === 'today') {
      // Сегодняшние пики
      const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' });
      picks = (await db.storedPick.findMany({
        where: { pickDate: today },
        orderBy: { createdAt: 'asc' },
      })) as unknown as StoredPickRow[];
    } else if (mode === 'all') {
      // Все пики без cross-check
      picks = (await db.storedPick.findMany({
        where: { crossCheckAgree: null },
        orderBy: { createdAt: 'desc' },
        take: limit,
      })) as unknown as StoredPickRow[];
    } else {
      return NextResponse.json(
        { success: false, error: 'invalid mode. Use: today | date | all | single' },
        { status: 400 },
      );
    }

    if (picks.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Нет пиков для cross-check',
        processed: 0,
        results: [],
      });
    }

    // Выполняем cross-check последовательно
    const results = [];
    let processed = 0;
    let agreed = 0;
    let disagreed = 0;

    for (const storedPick of picks) {
      const pick = storedToPick(storedPick);
      const result = await crossCheckPick(pick);

      if (result) {
        await saveCrossCheckResult(pick.id, result);
        results.push({
          pickId: pick.id,
          team1: pick.team1,
          team2: pick.team2,
          ...result,
        });
        processed += 1;
        if (result.agree === 'agree') agreed += 1;
        else if (result.agree === 'disagree') disagreed += 1;
      }

      // Задержка между запросами (кроме последнего)
      // gpt-oss-20b:free — reasoning модель, медленнее + free tier rate limit
      if (picks.indexOf(storedPick) < picks.length - 1) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    return NextResponse.json({
      success: true,
      mode,
      total: picks.length,
      processed,
      agreed,
      disagreed,
      results,
    });
  } catch (error) {
    console.error('cross-check API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'unknown error',
      },
      { status: 500 },
    );
  }
}
