import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET — все пики с cross-check данными (для парадокс-аналитики)
export async function GET() {
  try {
    const picks = await db.storedPick.findMany({
      where: { crossCheckAgree: { not: null } },
      select: {
        id: true,
        sportKey: true,
        sport: true,
        market: true,
        odds: true,
        result: true,
        crossCheckAgree: true,
        crossCheckConfidence: true,
      },
    });
    return NextResponse.json({ success: true, picks });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'failed', picks: [] },
      { status: 500 },
    );
  }
}
