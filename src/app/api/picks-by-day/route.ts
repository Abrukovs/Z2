import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/picks-by-day?date=2026-08-12 — пики за конкретную дату (для tooltip на графике)
export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ success: false, picks: [] });
  }

  try {
    const picks = await db.storedPick.findMany({
      where: { pickDate: date },
      select: {
        team1: true,
        team2: true,
        sportKey: true,
        sport: true,
        market: true,
        selection: true,
        odds: true,
        result: true,
        homeScore: true,
        awayScore: true,
        crossCheckAgree: true,
        crossCheckModel: true,
        crossCheckConfidence: true,
        confidenceScore: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const SPORT_ICONS: Record<string, string> = {
      football: '⚽', basketball: '🏀', tennis: '🎾',
      hockey: '🏒', esports: '🎮', baseball: '⚾', volleyball: '🏐',
    };

    return NextResponse.json({
      success: true,
      picks: picks.map((p) => {
        const isBaseball = p.sportKey === 'baseball';
        const isSkipped = p.crossCheckModel === 'skipped-baseball' || p.crossCheckModel === 'skipped-tennis';
        // Для бейсбола: только Z (N скрыт)
        // Для остальных: Z+N если есть crossCheckAgree
        const showN = !!p.crossCheckAgree && !isBaseball && !isSkipped;
        return {
          team1: p.team1,
          team2: p.team2,
          icon: SPORT_ICONS[p.sportKey] || '🏆',
          sportKey: p.sportKey,
          market: p.market,
          selection: p.selection,
          odds: p.odds,
          result: p.result,
          homeScore: p.homeScore,
          awayScore: p.awayScore,
          confidenceScore: p.confidenceScore,
          // Cross-check информация
          showN,
          crossCheck: p.crossCheckAgree,
          crossCheckConfidence: p.crossCheckConfidence,
          zOnly: isBaseball || isSkipped, // только Z.ai, без N
        };
      }),
    });
  } catch {
    return NextResponse.json({ success: false, picks: [] });
  }
}
