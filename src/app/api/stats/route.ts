import { NextResponse } from 'next/server';
import {
  updatePendingResults,
  computeStats,
} from '@/lib/stats-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
  try {
    // Сначала проверяем и обновляем результаты для pending пиков (бесплатно — ESPN API)
    const checkInfo = await updatePendingResults();
    // Затем считаем статистику из БД (локально, 0 токенов)
    const stats = await computeStats();
    return NextResponse.json({
      success: true,
      ...stats,
      checkInfo,
    });
  } catch (error) {
    console.error('stats API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'unknown error',
      },
      { status: 500 },
    );
  }
}
