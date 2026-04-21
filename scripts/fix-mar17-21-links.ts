/**
 * 3/17·3/21 성진·대덕 레코드 PDF 링크 수정
 * - test- 로 시작하는 pdf_file_id를 실제 Drive ID로 교체
 *
 * 사용법: npx tsx scripts/fix-mar17-21-links.ts [--drive-id=실제ID]
 * (drive-id 미지정 시: 3/21에 이미 연결된 유효 ID 사용)
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const REAL_DRIVE_ID = '1J5b-vgi8RoDAU2Firm8hbRQinqyvFiO6'; // 3/17 대덕·3/21 성진·대덕에 연결된 PDF

async function main() {
  const args = process.argv.slice(2);
  const idArg = args.find((a) => a.startsWith('--drive-id='));
  const driveId = idArg?.replace('--drive-id=', '').trim() || REAL_DRIVE_ID;
  const dryRun = args.includes('--dry-run');

  const { sql } = await import('../lib/db');

  const bad = (await sql`
    SELECT id, date::text as d, farm_code, disease, test_type, pdf_file_id
    FROM test_records
    WHERE farm_code IN ('DB1001', 'DB1002')
      AND (date::text LIKE '%-03-17' OR date::text LIKE '%-03-21')
      AND (pdf_file_id LIKE 'test-%' OR pdf_file_id LIKE 'batch-%' OR pdf_file_id IS NULL OR pdf_file_id = '')
  `) as { id: number; d: string; farm_code: string; disease: string; test_type: string; pdf_file_id: string | null }[];

  console.log(`\n수정 대상: ${bad.length}건 (3/17·3/21 성진·대덕, PDF 미연결)`);
  if (bad.length === 0) {
    console.log('수정할 레코드가 없습니다.');
    return;
  }
  bad.forEach((r) => console.log(`  ${r.d} | ${r.farm_code} ${r.disease} ${r.test_type} | 현재: ${r.pdf_file_id || '(없음)'}`));

  if (dryRun) {
    console.log('\n[--dry-run] 위 레코드에 Drive ID', driveId, '로 업데이트 예정');
    return;
  }

  let updated = 0;
  for (const r of bad) {
    await sql`UPDATE test_records SET pdf_file_id = ${driveId} WHERE id = ${r.id}`;
    updated++;
  }
  console.log('\n완료:', updated, '건 업데이트');
}

main().catch(console.error);
