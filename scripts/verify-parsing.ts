/**
 * 파싱 검증: DB 레코드 샘플 출력 (PDF 대조용)
 * npx tsx scripts/verify-parsing.ts [farm_code] [limit]
 *
 * 예: npx tsx scripts/verify-parsing.ts DB2006 20
 *     → 대월 최근 20건 출력 (날짜, 농장, 질병, 검사, 결과, Drive 링크)
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  const farm = process.argv[2] || null;
  const limit = Math.min(parseInt(process.argv[3] || '30', 10), 100);

  const { sql } = await import('../lib/db');
  const { FARMS } = await import('../lib/farms');

  const rows = (await sql`
    SELECT id, date::text, farm_code, disease, test_type, result, pdf_file_id
    FROM test_records
    ${farm ? sql`WHERE farm_code = ${farm}` : sql``}
    ORDER BY date DESC, farm_code
    LIMIT ${limit}
  `) as { id: number; date: string; farm_code: string; disease: string; test_type: string; result: string; pdf_file_id: string | null }[];

  const base = 'https://drive.google.com/file/d/';
  console.log(`\n=== DB 레코드 샘플 (${farm || '전체'} 최근 ${rows.length}건) ===\n`);
  for (const r of rows) {
    const name = FARMS[r.farm_code as keyof typeof FARMS]?.name ?? r.farm_code;
    const link = r.pdf_file_id ? `${base}${r.pdf_file_id}/view` : '-';
    console.log(`${r.date} | ${name}(${r.farm_code}) | ${r.disease} ${r.test_type} | ${r.result} | ${link}`);
  }
  console.log('\n위 링크로 PDF를 열어 실제 결과지와 대조해 보세요.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
