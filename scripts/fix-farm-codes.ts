/**
 * farm_code 정규화: "(세균) 25-04547 DB3025" → DB3025
 * FARMS에 없는 farm_code를 getFarmCode로 해석해 올바른 코드로 UPDATE
 *
 * npx tsx scripts/fix-farm-codes.ts [--dry-run]
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const { sql } = await import('../lib/db');
  const { getFarmCode } = await import('../lib/mail-pipeline/farm-mapping');
  const { FARMS } = await import('../lib/farms');

  const registered = new Set(Object.keys(FARMS));
  const rows = (await sql`
    SELECT id, farm_code, date::text, disease, test_type
    FROM test_records
    WHERE farm_code IS NOT NULL AND trim(farm_code) != ''
  `) as { id: number; farm_code: string; date: string; disease: string; test_type: string }[];

  const toFix = rows.filter((r) => !registered.has(r.farm_code));
  if (toFix.length === 0) {
    console.log('정규화할 farm_code가 없습니다.');
    return;
  }

  console.log(`FARMS 미등록 farm_code ${toFix.length}건 발견.`);

  let updated = 0;
  const failed: string[] = [];

  for (const r of toFix) {
    const resolved = getFarmCode(r.farm_code) as string;
    if (resolved && resolved !== r.farm_code && registered.has(resolved)) {
      if (!dryRun) {
        await sql`UPDATE test_records SET farm_code = ${resolved} WHERE id = ${r.id}`;
      }
      console.log(`  ${r.farm_code} → ${resolved} (${r.date} ${r.disease})`);
      updated++;
    } else {
      failed.push(r.farm_code);
    }
  }

  console.log(`\n${dryRun ? '[dry-run] ' : ''}${updated}건 정규화 완료.`);
  if (failed.length) {
    const unique = [...new Set(failed)];
    console.log(`해석 실패 ${unique.length}종:`, unique.slice(0, 10).join(', '), unique.length > 10 ? '...' : '');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
