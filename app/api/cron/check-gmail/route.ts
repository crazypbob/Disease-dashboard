/**
 * Cron: Gmail → Drive → 파싱 → DB
 * Vercel Cron 또는 외부 스케줄러에서 호출
 * Authorization: Bearer {CRON_SECRET}
 */
import { NextResponse } from 'next/server';
import { runMailPipeline } from '@/lib/mail-pipeline/run';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const { searchParams } = new URL(request.url);
  const token =
    authHeader?.replace(/^Bearer\s+/i, '') ?? searchParams.get('secret') ?? '';
  const secret = process.env.CRON_SECRET ?? '';

  if (!secret || token !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runMailPipeline();
    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (e) {
    console.error('[cron/check-gmail]', e);
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 }
    );
  }
}
