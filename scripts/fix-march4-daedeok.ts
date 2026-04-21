/**
 * 3월4일 성진(DB1001) → 다비연구소(DB9001) 잘못 매핑 수정
 * (접수번호 26-01875, 농장정보=다비연구소인 결과가 성진으로 들어간 경우)
 *
 * npx tsx scripts/fix-march4-daedeok.ts
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  const { sql } = await import('../lib/db');

  const res = await sql`
    UPDATE test_records
    SET farm_code = 'DB9001'
    WHERE date = '2026-03-04' AND farm_code = 'DB1001'
    RETURNING id, date, disease, test_type
  `;

  console.log(`3월4일 성진→다비연구소 수정: ${res.length}건`);
  for (const r of res as { id: number; date: string; disease: string; test_type: string }[]) {
    console.log(`  ${r.date} ${r.disease} ${r.test_type}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
