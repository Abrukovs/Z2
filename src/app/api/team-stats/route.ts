import { NextRequest, NextResponse } from 'next/server';
import { getTeamStats } from '@/lib/stats-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const team = searchParams.get('team') || '';
  const limit = Math.min(parseInt(searchParams.get('limit') || '5', 10) || 5, 20);

  if (!team || team.length < 3) {
    return NextResponse.json(
      { success: false, error: 'team parameter required (min 3 chars)', stats: null },
      { status: 400 },
    );
  }

  try {
    const stats = await getTeamStats(team, limit);
    if (!stats) {
      return NextResponse.json({
        success: true,
        stats: null,
        message: 'Нет исторических данных для этой команды',
      });
    }
    return NextResponse.json({ success: true, stats });
  } catch (error) {
    console.error('team-stats API error:', error);
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
