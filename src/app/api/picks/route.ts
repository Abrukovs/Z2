import { NextRequest, NextResponse } from 'next/server';
import {
  generateDailyPicks,
  getArchivedPicks,
  getArchivedDates,
  type Pick,
} from '@/lib/picks-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const sport = searchParams.get('sport') || 'all';
  const confidence = searchParams.get('confidence') || 'all';
  const force = searchParams.get('force') === '1';
  const date = searchParams.get('date'); // YYYY-MM-DD для архива
  const listDates = searchParams.get('dates') === '1'; // список всех дат архива

  // ====== Режим архива: список дат ======
  if (listDates) {
    try {
      const dates = await getArchivedDates();
      return NextResponse.json({ success: true, dates });
    } catch (e) {
      return NextResponse.json(
        { success: false, error: 'failed to load dates', dates: [] },
        { status: 500 },
      );
    }
  }

  // ====== Режим архива: пики за конкретную дату ======
  if (date) {
    try {
      const archived = await getArchivedPicks(date);
      let filtered = archived;
      if (sport && sport !== 'all') {
        filtered = filtered.filter((p) => p.sportKey === sport);
      }
      if (confidence && confidence !== 'all') {
        filtered = filtered.filter((p) => p.confidence === confidence);
      }
      return NextResponse.json({
        success: true,
        date,
        archived: true,
        count: filtered.length,
        total: archived.length,
        generatedAt: filtered[0]?.generatedAt ?? null,
        picks: filtered,
      });
    } catch (e) {
      return NextResponse.json(
        { success: false, error: 'archive load failed', picks: [], count: 0 },
        { status: 500 },
      );
    }
  }

  // ====== Режим: сегодняшние пики (как раньше) ======
  try {
    const {
      picks,
      cached,
      date: todayDate,
      usage,
      activeLeagues,
      sportsSearched,
      filteredOut,
    } = await generateDailyPicks({ force });

    let filtered: Pick[] = picks;
    if (sport && sport !== 'all') {
      filtered = filtered.filter((p) => p.sportKey === sport);
    }
    if (confidence && confidence !== 'all') {
      filtered = filtered.filter((p) => p.confidence === confidence);
    }

    return NextResponse.json({
      success: true,
      date: todayDate,
      cached,
      count: filtered.length,
      total: picks.length,
      generatedAt: picks[0]?.generatedAt ?? null,
      picks: filtered,
      usage,
      activeLeagues,
      sportsSearched,
      filteredOut,
    });
  } catch (error) {
    console.error('picks API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'unknown error',
        picks: [],
        count: 0,
      },
      { status: 500 },
    );
  }
}
