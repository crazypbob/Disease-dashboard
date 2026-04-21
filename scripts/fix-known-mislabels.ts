import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

type RecordRow = {
  id: number;
  date: string;
  farm_code: string;
  disease: string;
  test_type: string;
  result: string | null;
  pdf_file_id: string | null;
  details: string | null;
};

async function main() {
  const { sql } = await import('../lib/db');

  const targets = [
    { farm: 'DB2006', date: '2026-03-18' },
    { farm: 'DB2006', date: '2026-03-12' },
    { farm: 'DB2011', date: '2026-01-26' },
  ];

  for (const t of targets) {
    const rows = (await sql`
      SELECT id, date, farm_code, disease, test_type, result, pdf_file_id, details
      FROM test_records
      WHERE farm_code = ${t.farm} AND date = ${t.date}
      ORDER BY id ASC
    `) as RecordRow[];

    console.log(`\n== BEFORE ${t.farm} ${t.date} (${rows.length}) ==`);
    for (const r of rows) {
      console.log(`${r.id}\t${r.disease}\t${r.test_type}\t${r.result ?? ''}\t${r.pdf_file_id ?? ''}`);
    }
  }

  // 1) 대월(DB2006) 3/18, 3/12: 항체가 검사(ELISA)인데 '유전자분석'으로 들어간 케이스 정정
  const fixDaewol = await sql`
    UPDATE test_records
    SET test_type = 'ELISA'
    WHERE farm_code = 'DB2006'
      AND date IN ('2026-03-18','2026-03-12')
      AND disease = 'PRRS'
      AND test_type = '유전자분석'
    RETURNING id
  `;
  console.log(`\nUpdated DB2006 PRRS 유전자분석 → ELISA: ${fixDaewol.length} rows`);

  // 2) 서후(DB2011) 1/26: Clostridium novyi 세균 항목이 PRRS로 잘못 들어간 케이스 정정
  //    안전하게 'PRRS' + 'PCR/유전자분석'만 대상. (정확 레이블은 세균/세균배양)
  const fixSeohu = await sql`
    UPDATE test_records
    SET disease = '세균', test_type = '세균배양'
    WHERE farm_code = 'DB2011'
      AND date = '2026-01-26'
      AND disease = 'PRRS'
      AND test_type IN ('PCR', '유전자분석')
    RETURNING id
  `;
  console.log(`Updated DB2011 2026-01-26 PRRS → 세균/세균배양: ${fixSeohu.length} rows`);

  for (const t of targets) {
    const rows = (await sql`
      SELECT id, date, farm_code, disease, test_type, result, pdf_file_id, details
      FROM test_records
      WHERE farm_code = ${t.farm} AND date = ${t.date}
      ORDER BY id ASC
    `) as RecordRow[];

    console.log(`\n== AFTER ${t.farm} ${t.date} (${rows.length}) ==`);
    for (const r of rows) {
      console.log(`${r.id}\t${r.disease}\t${r.test_type}\t${r.result ?? ''}\t${r.pdf_file_id ?? ''}`);
    }
  }

  if (typeof (sql as any).end === 'function') await (sql as any).end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

