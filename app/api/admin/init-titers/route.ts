import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';

export async function POST() {
  const session = await getServerSession(authOptions);
  const adminEmails = (process.env.ADMIN_EMAILS ?? process.env.ALLOWED_EMAILS ?? '')
    .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  const isAdmin = session?.user?.email &&
    (adminEmails.length === 0 || adminEmails.includes(session.user.email.toLowerCase()));
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  await sql`
    CREATE TABLE IF NOT EXISTS antibody_titers (
      id           SERIAL      PRIMARY KEY,
      -- 익명 코드(뒤 4자리). 과거 호환 farm_id는 존재할 수 있으나, 신규는 farm_code를 사용.
      farm_code    TEXT,
      farm_id      TEXT,
      test_date    DATE        NOT NULL,
      disease      TEXT        NOT NULL,
      animal_no    INTEGER     NOT NULL,
      age_days     INTEGER,
      age_range    TEXT,
      parity_group TEXT,
      sp_value     REAL,
      source_file  TEXT,
      pdf_file_id  TEXT,
      needs_review BOOLEAN     NOT NULL DEFAULT FALSE,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // 기존 테이블( farm_id만 존재 ) 호환: farm_code 컬럼 보장 및 backfill
  await sql`ALTER TABLE antibody_titers ADD COLUMN IF NOT EXISTS farm_code TEXT`;
  await sql`ALTER TABLE antibody_titers ADD COLUMN IF NOT EXISTS parity_group TEXT`;
  await sql`ALTER TABLE antibody_titers ADD COLUMN IF NOT EXISTS pdf_file_id TEXT`;
  await sql`
    UPDATE antibody_titers
    SET farm_code = RIGHT(farm_id, 4)
    WHERE (farm_code IS NULL OR farm_code = '')
      AND farm_id ~ '\\d{4}$'
  `;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_titers_upsert
      ON antibody_titers(farm_code, test_date, disease, animal_no)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_titers_farm_date
      ON antibody_titers(farm_code, test_date)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_titers_disease
      ON antibody_titers(farm_code, disease)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_titers_pending
      ON antibody_titers(needs_review) WHERE needs_review = TRUE
  `;

  return NextResponse.json({ ok: true, message: 'antibody_titers 테이블 생성 완료' });
}
