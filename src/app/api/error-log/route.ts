import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/error-log — получить журнал ошибок
export async function GET(req: NextRequest) {
  const resolved = req.nextUrl.searchParams.get('resolved');
  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '50');

  try {
    const errors = await db.errorLog.findMany({
      where: resolved === 'true' ? {} : { resolved: false },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    // Группируем по категориям для статистики
    const byCategory: Record<string, number> = {};
    const byDate: Record<string, number> = {};
    for (const e of errors) {
      byCategory[e.category] = (byCategory[e.category] || 0) + 1;
      byDate[e.date] = (byDate[e.date] || 0) + 1;
    }

    return NextResponse.json({
      success: true,
      errors,
      stats: {
        total: errors.length,
        byCategory,
        byDate,
      },
    });
  } catch {
    return NextResponse.json({ success: false, errors: [], error: 'Failed to fetch error log' });
  }
}

// POST /api/error-log — записать новую ошибку
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { category, severity, message, details } = body;

    if (!category || !message) {
      return NextResponse.json({ success: false, error: 'Missing category or message' });
    }

    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' });

    const error = await db.errorLog.create({
      data: {
        date: today,
        category,
        severity: severity || 'warning',
        message,
        details: details || null,
      },
    });

    return NextResponse.json({ success: true, error });
  } catch {
    return NextResponse.json({ success: false, error: 'Failed to create error log' });
  }
}

// PATCH /api/error-log?id=X — отметить ошибку как решённую
export async function PATCH(req: NextRequest) {
  try {
    const id = parseInt(req.nextUrl.searchParams.get('id') || '0');
    if (!id) {
      return NextResponse.json({ success: false, error: 'Missing id' });
    }

    await db.errorLog.update({
      where: { id },
      data: { resolved: true },
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: 'Failed to update error' });
  }
}
