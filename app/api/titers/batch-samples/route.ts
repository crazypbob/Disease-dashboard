import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';

type Body = {
  ids: number[];
  age_days?: number | null;
  age_range?: string | null;
  parity_group?: string | null;
  needs_review?: boolean;
};

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  const adminEmails = (process.env.ADMIN_EMAILS ?? process.env.ALLOWED_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const isAdmin =
    session?.user?.email &&
    (adminEmails.length === 0 || adminEmails.includes(session.user.email.toLowerCase()));
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body: Body = await req.json();
  const ids = Array.isArray(body.ids) ? body.ids.map((x) => parseInt(String(x), 10)).filter((n) => Number.isFinite(n)) : [];
  if (ids.length === 0) return NextResponse.json({ error: 'ids(non-empty) required' }, { status: 400 });

  if (body.age_days == null && !body.age_range && !body.parity_group) {
    return NextResponse.json({ error: 'age_days 또는 age_range 또는 parity_group 중 하나 이상 필요' }, { status: 400 });
  }

  const updated = await sql`
    UPDATE antibody_titers
    SET
      age_days = COALESCE(${body.age_days ?? null}, age_days),
      age_range = COALESCE(${body.age_range ?? null}, age_range),
      parity_group = COALESCE(${body.parity_group ?? null}, parity_group),
      needs_review = COALESCE(${body.needs_review ?? null}, needs_review)
    WHERE id = ANY(${ids})
    RETURNING id
  `;

  return NextResponse.json({ ok: true, updated: updated.length });
}

