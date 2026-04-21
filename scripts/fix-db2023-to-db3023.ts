/**
 * db2023/DB2023 오타 레코드를 DB3023(한빛청주)로 강제 정정.
 *
 * 사용:
 *   npx tsx scripts/fix-db2023-to-db3023.ts [--dry-run]
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const { sql } = await import('../lib/db');

  const before = ['db2023', 'DB2023', 'Db2023', 'dB2023'];
  const target = 'DB3023';

  const rows = (await sql`
    SELECT id, farm_code, date::text, disease, test_type
    FROM test_records
    WHERE farm_code = ANY(${before})
  `) as { id: number; farm_code: string; date: string; disease: string; test_type: string }[];

  if (rows.length === 0) {
    console.log('정정할 레코드가 없습니다. (db2023/DB2023 없음)');
    return;
  }

  console.log(`${rows.length}건 발견: db2023/DB2023 → ${target}`);
  for (const r of rows.slice(0, 20)) {
    console.log(`  #${r.id} ${r.date} ${r.disease} ${r.test_type} ${r.farm_code} → ${target}`);
  }
  if (rows.length > 20) console.log(`  ... (+${rows.length - 20} more)`);

  if (dryRun) {
    console.log('\n[dry-run] 실제 UPDATE는 수행하지 않았습니다.');
    return;
  }

  const res = await sql`
    UPDATE test_records
    SET farm_code = ${target}
    WHERE farm_code = ANY(${before})
  `;
  console.log('\nUPDATE 완료:', res);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

