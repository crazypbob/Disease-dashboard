/**
 * 같은 pdf_file_id가 서로 다른 날짜·농장에 여러 건 매핑된 경우 검출
 * (파싱 오류·잘못된 링크 할당 의심)
 *
 * npx tsx scripts/check-duplicate-pdf.ts
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  const { sql } = await import('../lib/db');

  const rows = (await sql`
    SELECT pdf_file_id, COUNT(*)::int as cnt,
           array_agg(DISTINCT date) as dates,
           array_agg(DISTINCT farm_code) as farms,
           array_agg(DISTINCT disease) as diseases
    FROM test_records
    WHERE pdf_file_id IS NOT NULL AND trim(pdf_file_id) != ''
    GROUP BY pdf_file_id
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC
    LIMIT 50
  `) as {
    pdf_file_id: string;
    cnt: number;
    dates: string[];
    farms: string[];
    diseases: string[];
  }[];

  if (rows.length === 0) {
    console.log('중복 pdf_file_id 없음.');
    return;
  }

  console.log('=== 의심 중복: 같은 PDF가 여러 날짜/농장에 매핑됨 ===\n');
  for (const r of rows) {
    const dates = Array.isArray(r.dates) ? r.dates : [r.dates];
    const farms = Array.isArray(r.farms) ? r.farms : [r.farms];
    const diseases = Array.isArray(r.diseases) ? r.diseases : [r.diseases];
    const suspect =
      dates.length > 1 || farms.length > 1
        ? ' ⚠️ 의심'
        : diseases.length > 1
          ? ' (동일 농장·날짜, 다른 질병 → 정상일 수 있음)'
          : '';
    console.log(`pdf: ${r.pdf_file_id.slice(0, 30)}...`);
    console.log(`  건수: ${r.cnt} | 날짜: ${dates.join(', ')} | 농장: ${farms.join(', ')} | 질병: ${diseases.join(', ')}${suspect}`);
    console.log('');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
