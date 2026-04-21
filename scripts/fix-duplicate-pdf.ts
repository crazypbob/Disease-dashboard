/**
 * 의심 중복 pdf_file_id: 여러 날짜/농장에 걸친 경우 해당 레코드들의 pdf_file_id를 NULL로 설정
 * (사용자가 수동으로 올바른 링크 재연결 필요)
 *
 * npx tsx scripts/fix-duplicate-pdf.ts [--dry-run]
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const { sql } = await import('../lib/db');

  const dupes = (await sql`
    SELECT pdf_file_id, COUNT(*)::int as cnt,
           array_agg(DISTINCT date::text) as dates,
           array_agg(DISTINCT farm_code) as farms
    FROM test_records
    WHERE pdf_file_id IS NOT NULL AND trim(pdf_file_id) != ''
    GROUP BY pdf_file_id
    HAVING COUNT(DISTINCT (date, farm_code)) > 1
  `) as { pdf_file_id: string; cnt: number; dates: string[]; farms: string[] }[];

  if (dupes.length === 0) {
    console.log('수정할 의심 중복이 없습니다.');
    return;
  }

  console.log(`의심 중복 ${dupes.length}건 발견.`);
  const idsToNull = new Set<string>();
  for (const d of dupes) {
    const dates = Array.isArray(d.dates) ? d.dates : [String(d.dates)];
    const farms = Array.isArray(d.farms) ? d.farms : [String(d.farms)];
    console.log(`  pdf: ${d.pdf_file_id.slice(0, 25)}... | 날짜: ${dates.join(',')} | 농장: ${farms.join(',')}`);
    idsToNull.add(d.pdf_file_id);
  }

  let total = 0;
  for (const pdfId of idsToNull) {
    const rows = (await sql`
      SELECT id FROM test_records WHERE pdf_file_id = ${pdfId}
    `) as { id: number }[];
    total += rows.length;
    if (!dryRun) {
      for (const r of rows) {
        await sql`UPDATE test_records SET pdf_file_id = NULL WHERE id = ${r.id}`;
      }
    }
  }

  console.log(`\n${total}개 레코드의 pdf_file_id를 NULL로 설정합니다.`);

  if (dryRun) {
    console.log('--dry-run: 실제 DB 변경 없음');
    return;
  }
  console.log('완료. drive-link 문서를 참고해 올바른 PDF 링크를 재연결하세요.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
