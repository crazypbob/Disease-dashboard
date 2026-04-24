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
    { farm: 'DB1003', date: '2026-04-21' },
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

  // 3) 디앤디(DB1003) 4/21: PRRS 유전자(유전자분석) 열은 Clostridium 오분류로만 쓰였다고 가정하고 전부 삭제.
  //    (pdf_file_id가 NAS 경로만 있어 LIKE 조건에 안 걸리는 경우가 있어 조건을 넓힘.)
  const delDndPrrsGenomic = await sql`
    DELETE FROM test_records
    WHERE farm_code = 'DB1003'
      AND date = '2026-04-21'
      AND disease = 'PRRS'
      AND test_type = '유전자분석'
    RETURNING id
  `;
  const delIds = (delDndPrrsGenomic as { id: number }[]).map((r) => r.id);
  console.log(
    `Deleted DB1003 2026-04-21 PRRS/유전자분석 rows: ${delDndPrrsGenomic.length} (ids: ${delIds.join(', ') || 'none'})`
  );

  // 3b) 디앤디(DB1003) 4/21: 전북대 Cl.novyi 항원/PCR **음성**인데 DB에 V·+로 잘못 들어간 경우.
  //     과거에 V→+ 로 고치던 로직은 음성 건에 오적용되므로 **제거**하고, 해당 행은 음성(-)으로 맞춤.
  const fixDndBacteriaNeg = await sql`
    UPDATE test_records
    SET result = '-'
    WHERE farm_code = 'DB1003'
      AND date = '2026-04-21'
      AND disease = '세균'
      AND test_type = '세균배양'
      AND result IN ('+', 'V', 'v')
    RETURNING id, result
  `;
  console.log(
    `Updated DB1003 2026-04-21 세균/세균배양 잘못된 양성표기 → 음성(-): ${fixDndBacteriaNeg.length} rows`
  );

  // 4) 한빛청주(DB3023): 검증표 기준 오탐 PRRS 항체(ELISA) 양성 → 음성, 미시행 SIV 행 삭제
  const hanbitFalsePrrsAbIds = [
    1119, 1132, 1143, 1151, 1173, 1198, 1204, 1211, 1235, 1245, 1256, 5528, 5535, 5537, 4358, 4416, 5545,
  ];
  let hanbitPrrsUpdated = 0;
  for (const id of hanbitFalsePrrsAbIds) {
    const u = (await sql`
      UPDATE test_records
      SET result = '-'
      WHERE id = ${id}
        AND farm_code = 'DB3023'
        AND disease = 'PRRS'
        AND test_type = 'ELISA'
      RETURNING id
    `) as { id: number }[];
    hanbitPrrsUpdated += u.length;
  }
  console.log(`Updated DB3023 false PRRS ELISA → 음성(-): ${hanbitPrrsUpdated} rows (expected ${hanbitFalsePrrsAbIds.length})`);

  const delHanbitSiv = await sql`
    DELETE FROM test_records
    WHERE id = 1318 AND farm_code = 'DB3023' AND disease = 'SIV'
    RETURNING id
  `;
  console.log(`Deleted DB3023 spurious SIV row id=1318: ${delHanbitSiv.length} rows`);

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

