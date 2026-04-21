/**
 * DB에 등록된 pdf_file_id 목록 출력 (한 줄에 하나)
 * pdf-db-compare-ocr-pipeline.py 에서 호출
 *
 * npx tsx scripts/list-db-pdf-ids.ts
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
import { sql } from '../lib/db';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function main() {
  const rows = (await sql`
    SELECT DISTINCT pdf_file_id
    FROM test_records
    WHERE pdf_file_id IS NOT NULL AND trim(pdf_file_id) != ''
  `) as { pdf_file_id: string }[];
  for (const r of rows) {
    const s = (r.pdf_file_id || '').trim().replace(/\\/g, '/');
    if (s) console.log(s);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
