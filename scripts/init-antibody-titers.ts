/**
 * antibody_titers 테이블 생성(로컬/개발용)
 *
 * 사용:
 *   npx tsx scripts/init-antibody-titers.ts
 */
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function main() {
  const { sql } = await import('../lib/db');

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

  // 기존 테이블( farm_id만 존재 ) 호환: farm_code 컬럼 보장
  await sql`ALTER TABLE antibody_titers ADD COLUMN IF NOT EXISTS farm_code TEXT`;
  await sql`ALTER TABLE antibody_titers ADD COLUMN IF NOT EXISTS parity_group TEXT`;
  await sql`ALTER TABLE antibody_titers ADD COLUMN IF NOT EXISTS pdf_file_id TEXT`;
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

  // eslint-disable-next-line no-console
  console.log('ok: antibody_titers ready');
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

