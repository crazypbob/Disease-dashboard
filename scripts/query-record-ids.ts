/**
 * 일회성: npx tsx scripts/query-record-ids.ts 669 2444 5491 5489
 */
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function main() {
  const ids = process.argv.slice(2).map((s) => parseInt(s, 10)).filter((n) => Number.isFinite(n));
  if (ids.length === 0) {
    console.error('Usage: npx tsx scripts/query-record-ids.ts <id> [...]');
    process.exit(2);
  }
  const { sql } = await import('../lib/db');
  const rows = await sql`
    SELECT id, date::text, farm_code, disease, test_type, result, pdf_file_id, method, details
    FROM test_records
    WHERE id = ANY(${ids})
    ORDER BY id
  `;
  console.log(JSON.stringify(rows, null, 2));
  if (typeof sql.end === 'function') await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
