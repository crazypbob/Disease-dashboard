/**
 * 조산(DB3001) 레코드에 PDF Drive ID 수동 연결
 *
 * 사용법:
 *   npx tsx scripts/link-josan-pdf.ts --date=2025-01-03 --disease=PRRS --type=ELISA --id=여기에_Drive_파일ID
 *   npx tsx scripts/link-josan-pdf.ts --date=2025-12-27 --disease=PRRS --type=ELISA --id=xxx  # 여러 건 반복
 *
 * 또는 CSV로 일괄:
 *   date,disease,test_type,drive_id
 *   2025-01-03,PRRS,ELISA,1abc...
 *   npx tsx scripts/link-josan-pdf.ts --csv=links.csv
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env.local' });

function extractDriveId(input: string): string | null {
  if (!input) return null;
  const m = String(input).match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  const m2 = String(input).match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m2) return m2[1];
  if (/^[a-zA-Z0-9_-]{10,}$/.test(String(input).trim()) && !/^test-|^batch-/.test(String(input))) return String(input).trim();
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const csvArg = args.find((a) => a.startsWith('--csv='));
  const dateArg = args.find((a) => a.startsWith('--date='));
  const diseaseArg = args.find((a) => a.startsWith('--disease='));
  const typeArg = args.find((a) => a.startsWith('--type='));
  const idArg = args.find((a) => a.startsWith('--id='));
  const dryRun = args.includes('--dry-run');

  const farm = 'DB3001';

  if (csvArg) {
    const csvPath = csvArg.replace('--csv=', '').trim();
    if (!fs.existsSync(csvPath)) {
      console.error('CSV 파일 없음:', csvPath);
      process.exit(1);
    }
    const content = fs.readFileSync(csvPath, 'utf-8');
    const lines = content.split(/\r?\n/).filter((l) => l.trim());
    const headers = (lines[0] ?? '').split(',').map((h) => h.trim().toLowerCase());
    const dateIdx = headers.findIndex((h) => h.includes('date') || h === '날짜');
    const diseaseIdx = headers.findIndex((h) => h.includes('disease') || h === '질병');
    const typeIdx = headers.findIndex((h) => h.includes('type') || h.includes('검사'));
    const idIdx = headers.findIndex((h) => h.includes('id') || h.includes('drive'));

    if (dateIdx < 0 || idIdx < 0) {
      console.error('CSV에 date, drive_id 컬럼 필요');
      process.exit(1);
    }

    const { sql } = await import('../lib/db');
    let updated = 0;
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => c.trim());
      const date = (cols[dateIdx] ?? '').replace(/\./g, '-');
      const disease = diseaseIdx >= 0 ? (cols[diseaseIdx] ?? 'PRRS').trim() : 'PRRS';
      const testType = typeIdx >= 0 ? (cols[typeIdx] ?? 'ELISA').trim() : 'ELISA';
      const driveId = extractDriveId(cols[idIdx] ?? '');
      if (!date || !driveId) continue;

      const existing = await sql`
        SELECT id, pdf_file_id FROM test_records
        WHERE farm_code = ${farm} AND date = ${date} AND disease = ${disease} AND test_type = ${testType}
        LIMIT 1
      `;
      if (existing.length === 0) {
        console.log(`스킵 (레코드 없음): ${date} ${disease} ${testType}`);
        continue;
      }
      const row = existing[0] as { id: number; pdf_file_id: string | null };
      if (row.pdf_file_id && row.pdf_file_id.trim()) {
        console.log(`스킵 (이미 링크 있음): ${date} ${disease} ${testType}`);
        continue;
      }
      if (!dryRun) {
        await sql`UPDATE test_records SET pdf_file_id = ${driveId} WHERE id = ${row.id}`;
        updated++;
        console.log(`연결: ${date} ${disease} ${testType} → ${driveId.slice(0, 20)}...`);
      } else {
        console.log(`[dry-run] 연결 예정: ${date} ${disease} ${testType} → ${driveId.slice(0, 20)}...`);
        updated++;
      }
    }
    console.log(`\n완료: ${updated}건 ${dryRun ? '(dry-run)' : '업데이트'}`);
    return;
  }

  if (!dateArg || !idArg) {
    console.log(`
사용법:
  단건: npx tsx scripts/link-josan-pdf.ts --date=2025-01-03 --disease=PRRS --type=ELISA --id=Drive파일ID
  CSV:  npx tsx scripts/link-josan-pdf.ts --csv=links.csv
  미리보기: --dry-run 추가

예: npx tsx scripts/link-josan-pdf.ts --date=2025-01-03 --disease=PRRS --type=ELISA --id=1abc123xyz...
`);
    process.exit(1);
  }

  const date = dateArg.replace('--date=', '').trim().replace(/\./g, '-');
  const disease = (diseaseArg?.replace('--disease=', '') ?? 'PRRS').trim();
  const testType = (typeArg?.replace('--type=', '') ?? 'ELISA').trim();
  const driveId = extractDriveId(idArg.replace('--id=', '').trim());

  if (!driveId) {
    console.error('유효한 Drive 파일 ID가 필요합니다. (공유 링크에서 /d/ 와 /view 사이 값)');
    process.exit(1);
  }

  const { sql } = await import('../lib/db');
  const existing = await sql`
    SELECT id, pdf_file_id FROM test_records
    WHERE farm_code = ${farm} AND date = ${date} AND disease = ${disease} AND test_type = ${testType}
    LIMIT 1
  `;
  if (existing.length === 0) {
    console.error(`해당 레코드 없음: ${date} ${disease} ${testType}`);
    process.exit(1);
  }
  const row = existing[0] as { id: number; pdf_file_id: string | null };
  if (row.pdf_file_id && row.pdf_file_id.trim()) {
    console.log('이미 링크 있음. 덮어쓰려면 DB에서 수동 변경하세요.');
    process.exit(0);
  }
  if (!dryRun) {
    await sql`UPDATE test_records SET pdf_file_id = ${driveId} WHERE id = ${row.id}`;
    console.log(`연결 완료: ${date} ${disease} ${testType}`);
  } else {
    console.log(`[dry-run] 연결 예정: ${date} ${disease} ${testType} → ${driveId.slice(0, 25)}...`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
