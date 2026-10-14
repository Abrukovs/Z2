import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

interface Body {
  ids: string[];
}

export async function POST(req: NextRequest) {
  try {
    const body: Body = await req.json();
    const ids = Array.isArray(body?.ids) ? body.ids.filter((x) => typeof x === 'string') : [];

    if (ids.length === 0) {
      return NextResponse.json({
        success: true,
        stats: null,
        message: 'Нет избранных пиков',
      });
    }

    // Загружаем избранные пики из БД
    const picks = await db.storedPick.findMany({
      where: { id: { in: ids } },
      orderBy: { pickDate: 'desc' },
    });

    if (picks.length === 0) {
      return NextResponse.json({
        success: true,
        stats: null,
        message: 'Избранные пики не найдены в БД',
      });
    }

    const SPORT_ICONS_DB: Record<string, string> = {
      football: '⚽', basketball: '🏀', tennis: '🎾',
      hockey: '🏒', esports: '🎮', baseball: '⚾', volleyball: '🏐',
    };

    const total = picks.length;
    const won = picks.filter((p) => p.result === 'won').length;
    const lost = picks.filter((p) => p.result === 'lost').length;
    const push = picks.filter((p) => p.result === 'push').length;
    const pending = picks.filter((p) => p.result === 'pending').length;
    const settled = won + lost + push;

    // Финансы
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
    const profit = Math.round((ret - stake) * 100) / 100;
    const roi = stake > 0 ? Math.round(((ret - stake) / stake) * 100 * 100) / 100 : 0;
    const winRate = settled > 0 ? Math.round((won / settled) * 100 * 100) / 100 : 0;

    const picksInfo = picks.map((p) => ({
      id: p.id,
      team1: p.team1,
      team2: p.team2,
      sport: p.sport,
      sportKey: p.sportKey,
      sportIcon: SPORT_ICONS_DB[p.sportKey] || '🏆',
      league: p.league,
      market: p.market,
      selection: p.selection,
      odds: p.odds,
      confidence: p.confidence,
      confidenceScore: p.confidenceScore,
      result: p.result as 'pending' | 'won' | 'lost' | 'push' | 'no_result',
      pickDate: p.pickDate,
    }));

    return NextResponse.json({
      success: true,
      stats: {
        total,
        settled,
        won,
        lost,
        pending,
        winRate,
        profit,
        roi,
        picks: picksInfo,
      },
    });
  } catch (error) {
    console.error('user-stats API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'unknown error',
        stats: null,
      },
      { status: 500 },
    );
  }
}
