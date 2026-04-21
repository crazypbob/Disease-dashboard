/**
 * 대덕(DB1002) 3월 17일 레코드 확인
 * npx tsx scripts/check-daedeok-mar17.ts
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  const { sql } = await import('../lib/db');

  const rows = (await sql`
    SELECT id, date::text, farm_code, disease, test_type, result, pdf_file_id
    FROM test_records
    WHERE farm_code = 'DB1002' AND date::text LIKE '%-03-17'
    ORDER BY date DESC
  `) as { id: number; date: string; farm_code: string; disease: string; test_type: string; result: string; pdf_file_id: string | null }[];

  console.log('\n=== 대덕(DB1002) 3월 17일 레코드 ===');
  if (rows.length === 0) {
    console.log('데이터 없음. 해당 날짜 결과가 DB에 등록되지 않았을 수 있습니다.');
    console.log('\n가능한 원인:');
    console.log('  1. 메일/GAS 파이프라인으로 아직 ingest 안 됨');
    console.log('  2. import-from-sheet-csv로 시트에서 수동 import 필요');
    console.log('  3. 검사결과DB 시트에 해당 행이 없음');
    return;
  }
  const base = 'https://drive.google.com/file/d/';
  for (const r of rows) {
    const link = r.pdf_file_id ? `${base}${r.pdf_file_id}/view` : '(PDF미연결)';
    console.log(`${r.date} | ${r.disease} ${r.test_type} | ${r.result} | ${link}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
