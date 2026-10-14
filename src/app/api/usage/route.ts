import { NextResponse } from 'next/server';
import { getUsage } from '@/lib/picks-service';

export const dynamic = 'force-dynamic';

export async function GET() {
  const usage = getUsage();
  return NextResponse.json({
    success: true,
    ...usage,
  });
}
