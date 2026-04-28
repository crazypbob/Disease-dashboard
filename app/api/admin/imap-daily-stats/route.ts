import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';
import { isApprovedSession } from '@/lib/require-approved';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? process.env.ALLOWED_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  if (ADMIN_EMAILS.length === 0) return true;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isApprovedSession(session)) {
    return NextResponse.json({ error: 'Forbidden: approval required' }, { status: 403 });
  }
  if (!isAdmin(session.user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const days = Math.min(Math.max(parseInt(searchParams.get('days') ?? '30', 10) || 30, 1), 365);

  const rows = (await sql`
    SELECT
      day::text AS day,
      save_path_files,
      audit_ok,
      audit_err,
      imap_on_count,
      generated_at::text AS generated_at,
      notes
    FROM imap_daily_stats
    WHERE day >= (CURRENT_DATE - ${days}::int)
    ORDER BY day DESC
  `) as unknown as Array<{
    day: string;
    save_path_files: number;
    audit_ok: number;
    audit_err: number;
    imap_on_count: number | null;
    generated_at: string;
    notes: string | null;
  }>;

  const items = rows.map((r) => {
    const disk = Number(r.save_path_files ?? 0);
    const ok = Number(r.audit_ok ?? 0);
    const err = Number(r.audit_err ?? 0);
    const mismatch = disk !== ok;
    return {
      day: r.day,
      savePathFiles: disk,
      auditOk: ok,
      auditErr: err,
      imapOnCount: r.imap_on_count ?? null,
      generatedAt: r.generated_at,
      notes: r.notes ?? null,
      mismatch,
      hint:
        mismatch && ok === 0 && disk > 0
          ? '디스크에는 파일이 있는데 IMAP_AUDIT_LOG 기록이 없음(로그 미설정/파일 수동 복사 가능)'
          : mismatch && ok > 0 && disk === 0
            ? 'IMAP_AUDIT_LOG에는 저장 기록이 있는데 디스크에 없음(SAVE_PATH/경로/삭제 여부 확인)'
            : mismatch
              ? '디스크 파일 수와 감사 로그 기록 수가 다름(중복/에러/수동 처리 포함 가능)'
              : null,
    };
  });

  return NextResponse.json({
    ok: true,
    items,
    meta: {
      days,
      generatedAt: new Date().toISOString(),
      note: 'NAS가 push-imap-daily-stats로 적재한 일별 집계(옵션3).',
    },
  });
}

