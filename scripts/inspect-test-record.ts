import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function main() {
  const raw = process.argv[2];
  const id = raw ? Number(raw) : NaN;
  if (!Number.isFinite(id)) {
    console.error('Usage: npx tsx scripts/inspect-test-record.ts <record_id>');
    process.exit(1);
  }

  const { sql } = await import('../lib/db');
  const rows = (await sql`
    SELECT id, date::text, farm_code, disease, test_type, result, pdf_file_id, method, details, created_at::text
    FROM test_records
    WHERE id = ${id}
    LIMIT 1
  `) as any[];

  if (!rows.length) {
    console.log('NOT_FOUND');
    return;
  }

  const r = rows[0];
  console.log(JSON.stringify(r, null, 2));

  const pdf = String(r.pdf_file_id ?? '').trim();
  if (pdf) {
    const samePdf = (await sql`
      SELECT id, date::text, farm_code, disease, test_type, result
      FROM test_records
      WHERE pdf_file_id = ${pdf}
      ORDER BY id ASC
      LIMIT 50
    `) as any[];
    console.log('\n--- same pdf_file_id (top 50) ---');
    for (const x of samePdf) {
      console.log(`${x.id}\t${x.date}\t${x.farm_code}\t${x.disease}\t${x.test_type}\t${x.result}`);
    }
  }

  if (typeof (sql as any).end === 'function') await (sql as any).end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

