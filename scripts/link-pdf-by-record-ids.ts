/**
 * test_records.id 기준으로 pdf_file_id(Google Drive 파일 ID·URL) 일괄 연결.
 *
 *   npx tsx scripts/link-pdf-by-record-ids.ts --csv=scripts/data/pdf-link-matrix-2026-04.example.csv
 *   npx tsx scripts/link-pdf-by-record-ids.ts --csv=links.csv --dry-run
 *
 * CSV 컬럼(헤더, 대소문자 무관):
 *   - record_id (또는 id) — 필수
 *   - pdf_file_id | drive_id | drive_file_id — 필수(빈 행 스킵)
 *   - farm_code, date — 선택(로그용)
 *
 * 같은 날·같은 농장이면 보통 **같은 PDF ID**를 여러 record_id 행에 반복해 넣으면 됨.
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import { extractDriveFileId } from '../lib/drive';

function parseArgs() {
  const argv = process.argv.slice(2);
  const csvArg = argv.find((a) => a.startsWith('--csv='))?.slice('--csv='.length).trim() ?? '';
  const dryRun = argv.includes('--dry-run');
  return { csvPath: csvArg ? path.resolve(csvArg) : '', dryRun };
}

function parseCsvLine(line: string): string[] {
  return line.split(',').map((c) => c.replace(/^\s*"|"\s*$/g, '').trim());
}

async function main() {
  const { csvPath, dryRun } = parseArgs();
  if (!csvPath || !fs.existsSync(csvPath)) {
    console.error('사용법: npx tsx scripts/link-pdf-by-record-ids.ts --csv=경로 [--dry-run]');
    process.exit(1);
  }

  const raw = fs.readFileSync(csvPath, 'utf-8');
  const lines = raw.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#'));
  if (lines.length < 2) {
    console.error('CSV에 헤더+데이터 행이 필요합니다.');
    process.exit(1);
  }

  const headers = parseCsvLine(lines[0]!).map((h) => h.toLowerCase().replace(/\s/g, '_'));
  const idCol = headers.findIndex((h) => h === 'record_id' || h === 'id');
  const pdfCol = headers.findIndex(
    (h) => h.includes('pdf') || h === 'drive_id' || h === 'drive_file_id'
  );
  if (idCol < 0 || pdfCol < 0) {
    console.error('CSV에 record_id(또는 id)와 pdf_file_id(또는 drive_id) 컬럼이 필요합니다.');
    process.exit(1);
  }
  const farmCol = headers.findIndex((h) => h === 'farm_code' || h === 'farm');
  const dateCol = headers.findIndex((h) => h === 'date');

  const { sql } = await import('../lib/db');
  let ok = 0;
  let skip = 0;

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]!);
    const idStr = cols[idCol]?.trim() ?? '';
    const rawPdf = cols[pdfCol]?.trim() ?? '';
    if (!idStr || !rawPdf) {
      skip++;
      continue;
    }
    const recordId = parseInt(idStr, 10);
    if (!Number.isFinite(recordId)) {
      console.warn(`스킵(잘못된 id): ${idStr}`);
      skip++;
      continue;
    }
    const driveId = extractDriveFileId(rawPdf) ?? extractDriveFileId(rawPdf.replace(/\s/g, ''));
    if (!driveId) {
      console.warn(`스킵(Drive ID 파싱 실패): record_id=${recordId} value=${rawPdf.slice(0, 40)}…`);
      skip++;
      continue;
    }

    const farm = farmCol >= 0 ? cols[farmCol] : '';
    const date = dateCol >= 0 ? cols[dateCol] : '';
    const label = [farm, date].filter(Boolean).join(' ');

    const rows = (await sql`
      SELECT id, pdf_file_id FROM test_records WHERE id = ${recordId} LIMIT 1
    `) as { id: number; pdf_file_id: string | null }[];
    if (!rows.length) {
      console.warn(`없는 record_id: ${recordId}`);
      skip++;
      continue;
    }
    if (rows[0].pdf_file_id?.trim()) {
      console.log(`스킵(이미 링크): id=${recordId} ${label}`);
      skip++;
      continue;
    }

    if (dryRun) {
      console.log(`[dry-run] UPDATE id=${recordId} → pdf_file_id=${driveId} ${label}`);
      ok++;
    } else {
      await sql`UPDATE test_records SET pdf_file_id = ${driveId} WHERE id = ${recordId}`;
      console.log(`연결: id=${recordId} ${label} → ${driveId.slice(0, 18)}…`);
      ok++;
    }
  }

  console.log(`\n완료: 연결 ${ok}건, 스킵 ${skip}건${dryRun ? ' (dry-run)' : ''}`);

  if (typeof (sql as any).end === 'function') await (sql as any).end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
