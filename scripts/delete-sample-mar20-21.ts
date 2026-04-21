/**
 * 3/21 성진·대덕 PRRS, 3/20 성진 PED 테스트 샘플 삭제
 * 실행: npx tsx scripts/delete-sample-mar20-21.ts [--dry-run]
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const { sql } = await import('../lib/db');
  const { FARMS } = await import('../lib/farms');

  // 삭제 대상: 3/21 성진(DB1001)·대덕(DB1002) PRRS, 3/20 성진(DB1001) PED
  const targets = [
    { date: '2026-03-21', farm_code: 'DB1001', disease: 'PRRS' },
    { date: '2026-03-21', farm_code: 'DB1002', disease: 'PRRS' },
    { date: '2026-03-20', farm_code: 'DB1001', disease: 'PED' },
  ] as const;

  const rows = await sql`
    SELECT id, date::text, farm_code, disease, test_type, result
    FROM test_records
    WHERE (date = '2026-03-21' AND farm_code IN ('DB1001','DB1002') AND disease = 'PRRS')
       OR (date = '2026-03-20' AND farm_code = 'DB1001' AND disease = 'PED')
    ORDER BY date, farm_code, disease, test_type
  ` as { id: number; date: string; farm_code: string; disease: string; test_type: string; result: string }[];

  if (rows.length === 0) {
    console.log('삭제할 레코드가 없습니다.');
    return;
  }

  console.log('삭제 대상:');
  for (const r of rows) {
    const name = FARMS[r.farm_code as keyof typeof FARMS]?.name ?? r.farm_code;
    console.log(`  ${r.date} ${name}(${r.farm_code}) ${r.disease} ${r.test_type} | ${r.result}`);
  }
  console.log(`총 ${rows.length}건`);

  if (dryRun) {
    console.log('\n--dry-run: 실제 삭제하지 않음. 실행하려면 --dry-run 없이 실행하세요.');
    return;
  }

  const ids = rows.map((r) => r.id);
  await sql`DELETE FROM test_records WHERE id = ANY(${ids})`;
  console.log(`\n삭제 완료: ${rows.length}건`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
