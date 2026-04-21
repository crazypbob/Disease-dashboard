import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function main() {
  const args = process.argv.slice(2);
  const getArg = (key: string) => args.find((a) => a.startsWith(key + '='))?.slice(key.length + 1) ?? '';

  const farm = getArg('--farm');
  const date = getArg('--date'); // YYYY-MM-DD
  const from = getArg('--from');
  const to = getArg('--to');
  const limit = parseInt(getArg('--limit') || '200', 10);

  if (!farm) {
    console.error('Usage: npx tsx scripts/debug-records.ts --farm=DB3001 [--date=YYYY-MM-DD | --from=YYYY-MM-DD --to=YYYY-MM-DD] [--limit=200]');
    process.exit(2);
  }

  const { sql } = await import('../lib/db');

  let rows: unknown[];
  if (date) {
    rows = await sql`
      SELECT date::text, farm_code, disease, test_type, result, pdf_file_id, details
      FROM test_records
      WHERE farm_code = ${farm} AND date = ${date}
      ORDER BY disease, test_type
      LIMIT ${limit}
    `;
  } else {
    const f = from || '1900-01-01';
    const t = to || '2999-12-31';
    rows = await sql`
      SELECT date::text, farm_code, disease, test_type, result, pdf_file_id, details
      FROM test_records
      WHERE farm_code = ${farm} AND date >= ${f} AND date <= ${t}
      ORDER BY date DESC, disease, test_type
      LIMIT ${limit}
    `;
  }

  console.log(JSON.stringify(rows, null, 2));
  if (typeof sql.end === 'function') await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

