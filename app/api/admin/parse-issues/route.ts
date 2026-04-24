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
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isApprovedSession(session)) {
    return NextResponse.json({ error: 'Forbidden: approval required' }, { status: 403 });
  }
  if (!isAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '200', 10), 1000);

  const rows = await sql`
    SELECT id, date::text, farm_code, disease, test_type, result, pdf_file_id, details, created_at::text
    FROM test_records
    WHERE details ILIKE '%ELISA_JUDGEMENT_FALLBACK%'
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;

  return NextResponse.json({ issues: rows, total: rows.length });
}

