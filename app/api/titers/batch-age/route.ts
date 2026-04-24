import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';
import { isApprovedSession } from '@/lib/require-approved';

type Body = {
  farm_code: string;
  test_date: string;
  disease: string;
  age_days?: number | null;
  age_range?: string | null;
};

function normalizeFarmCode(raw: string | null | undefined): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const m = s.match(/(\d{4})$/);
  return m ? m[1] : null;
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (session?.user && !isApprovedSession(session)) {
    return NextResponse.json({ error: 'Forbidden: approval required' }, { status: 403 });
  }
  const adminEmails = (process.env.ADMIN_EMAILS ?? process.env.ALLOWED_EMAILS ?? '')
    .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  const isAdmin = session?.user?.email &&
    (adminEmails.length === 0 || adminEmails.includes(session.user.email.toLowerCase()));
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body: Body = await req.json();
  const { farm_code, test_date, disease, age_days, age_range } = body;
  const fc = normalizeFarmCode(farm_code);

  if (!fc || !test_date || !disease)
    return NextResponse.json({ error: 'farm_code, test_date, disease 필수' }, { status: 400 });
  if (age_days == null && !age_range)
    return NextResponse.json({ error: 'age_days 또는 age_range 중 하나 필수' }, { status: 400 });

  const result = await sql`
    UPDATE antibody_titers
    SET
      age_days     = ${age_days ?? null},
      age_range    = ${age_range ?? null},
      needs_review = FALSE
    WHERE COALESCE(farm_code, farm_id) = ${fc}
      AND test_date = ${test_date}::date
      AND disease   = ${disease}
    RETURNING id
  `;

  return NextResponse.json({ ok: true, updated: result.length });
}
