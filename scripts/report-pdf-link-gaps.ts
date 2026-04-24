/**
 * test_records 기준 PDF/Drive·매트릭스 링크 갭 리포트.
 *
 * - A: 결과는 있는데 pdf_file_id 가 비어 있음 → 매트릭스에서 원본 링크 없음
 * - B: pdf_file_id 가 NAS 상대경로(YYYY-MM/파일.pdf)만 있음 → Drive 미연동(선택 --base 로 디스크 존재 확인)
 * - 요약: Drive ID/URL 형으로 연결된 행 수
 *
 * 사용법:
 *   npx tsx scripts/report-pdf-link-gaps.ts
 *   npx tsx scripts/report-pdf-link-gaps.ts --since=2026-04 --farm=DB1003
 *   npx tsx scripts/report-pdf-link-gaps.ts --base="X:/질병메일링_대시보드/disease-dashboard/ocr-pipeline/input/검사결과_PDF"
 *   npx tsx scripts/report-pdf-link-gaps.ts --csv="x:/질병메일링_대시보드/disease-dashboard/scripts/.pdf-link-gaps.csv"
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import { isLikelyGoogleDriveRef, extractDriveFileId } from '../lib/drive';

const NAS_REL_RE = /^[0-9]{4}-[0-9]{2}\/.+\.pdf$/i;

type Row = {
  id: number;
  date: string;
  farm_code: string;
  disease: string;
  test_type: string;
  result: string | null;
  pdf_file_id: string | null;
};

function parseArgs() {
  const argv = process.argv.slice(2);
  const get = (prefix: string) => argv.find((a) => a.startsWith(prefix))?.slice(prefix.length).trim() ?? '';
  const since = get('--since=');
  const farm = get('--farm=');
  const base =
    get('--base=') ||
    process.env.SAVE_PATH?.trim() ||
    process.env.PDF_BASE_PATH?.trim() ||
    '';
  const csv = get('--csv=');
  const jsonOut = get('--json=');
  const limitStr = get('--limit=');
  const limit = limitStr ? Math.min(Math.max(1, parseInt(limitStr, 10)), 200_000) : 50_000;
  return { since, farm, base: base ? path.resolve(base) : '', csv, jsonOut, limit };
}

function sinceToDateStart(since: string): string | null {
  const t = since.trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  if (/^\d{4}-\d{2}$/.test(t)) return `${t}-01`;
  return t;
}

function csvEscape(s: string | null | undefined): string {
  const v = String(s ?? '');
  if (/[",\r\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function fileOnDisk(baseAbs: string, rel: string): boolean {
  const full = path.join(baseAbs, rel.replace(/\\/g, '/'));
  return fs.existsSync(full);
}

async function main() {
  const { since, farm, base, csv, jsonOut, limit } = parseArgs();
  const sinceStart = sinceToDateStart(since);
  const { sql } = await import('../lib/db');

  const nullTail = farm
    ? sinceStart
      ? sql`AND farm_code = ${farm} AND date >= ${sinceStart}::date`
      : sql`AND farm_code = ${farm}`
    : sinceStart
      ? sql`AND date >= ${sinceStart}::date`
      : sql``;

  const nasTail = nullTail;

  const [nullCount] = (await sql`
    SELECT COUNT(*)::int AS c FROM test_records
    WHERE (pdf_file_id IS NULL OR trim(pdf_file_id) = '')
      AND trim(coalesce(result, '')) <> ''
    ${nullTail}
  `) as { c: number }[];

  const [nasCount] = (await sql`
    SELECT COUNT(*)::int AS c FROM test_records
    WHERE pdf_file_id IS NOT NULL
      AND trim(pdf_file_id) <> ''
      AND trim(pdf_file_id) ~* '^[0-9]{4}-[0-9]{2}/.+\\.pdf$'
    ${nasTail}
  `) as { c: number }[];

  const [driveCount] = (await sql`
    SELECT COUNT(*)::int AS c FROM test_records
    WHERE pdf_file_id IS NOT NULL AND trim(pdf_file_id) <> ''
    ${nullTail}
  `) as { c: number }[];

  const nullRows = (await sql`
    SELECT id, date::text, farm_code, disease, test_type, result, pdf_file_id
    FROM test_records
    WHERE (pdf_file_id IS NULL OR trim(pdf_file_id) = '')
      AND trim(coalesce(result, '')) <> ''
    ${nullTail}
    ORDER BY date DESC, farm_code, id
    LIMIT ${limit}
  `) as Row[];

  const nasRows = (await sql`
    SELECT id, date::text, farm_code, disease, test_type, result, trim(pdf_file_id) AS pdf_file_id
    FROM test_records
    WHERE pdf_file_id IS NOT NULL
      AND trim(pdf_file_id) <> ''
      AND trim(pdf_file_id) ~* '^[0-9]{4}-[0-9]{2}/.+\\.pdf$'
    ${nasTail}
    ORDER BY date DESC, farm_code, id
    LIMIT ${limit}
  `) as Row[];

  let driveLinkedInFilter = 0;
  const allForDriveCheck = (await sql`
    SELECT trim(pdf_file_id) AS pdf_file_id FROM test_records
    WHERE pdf_file_id IS NOT NULL AND trim(pdf_file_id) <> ''
    ${nullTail}
  `) as { pdf_file_id: string }[];
  for (const r of allForDriveCheck) {
    if (isLikelyGoogleDriveRef(r.pdf_file_id) || extractDriveFileId(r.pdf_file_id)) driveLinkedInFilter++;
  }

  const nasWithDisk = base
    ? nasRows.filter((r) => r.pdf_file_id && NAS_REL_RE.test(r.pdf_file_id) && fileOnDisk(base, r.pdf_file_id))
    : [];
  const nasMissingDisk = base
    ? nasRows.filter((r) => r.pdf_file_id && NAS_REL_RE.test(r.pdf_file_id) && !fileOnDisk(base, r.pdf_file_id))
    : [];

  const summary = {
    filters: { farm: farm || null, since: since || null, sinceStart, base: base || null, rowLimit: limit },
    counts: {
      noPdfButHasResult: nullCount?.c ?? 0,
      nasRelativePathRows: nasCount?.c ?? 0,
      anyPdfRefRows: driveCount?.c ?? 0,
      rowsWithDriveLikeRef: driveLinkedInFilter,
    },
    nasOnDisk: base
      ? { withBase: true, rowsWithFilePresent: nasWithDisk.length, rowsFileMissing: nasMissingDisk.length }
      : { withBase: false, hint: 'Pass --base= or set SAVE_PATH to check NAS files on disk.' },
  };

  console.log('\n=== PDF / Drive 링크 갭 요약 ===\n');
  console.log(JSON.stringify(summary, null, 2));

  const DISPLAY = 200;
  console.log('\n--- A: 결과 있음 · pdf_file_id 비어 있음 (표시 최대 ' + DISPLAY + '건 / 조회 ' + nullRows.length + '건) ---');
  for (const r of nullRows.slice(0, DISPLAY)) {
    console.log(`${r.id}\t${r.date}\t${r.farm_code}\t${r.disease}\t${r.test_type}\t${r.result ?? ''}`);
  }
  if ((nullCount?.c ?? 0) > DISPLAY) {
    console.log(`... (A 누락 총 ${nullCount?.c}건, 콘솔은 ${DISPLAY}줄까지. 전체는 --csv 또는 --limit=)`);
  }

  console.log('\n--- B: NAS 상대경로만 (표시 최대 ' + DISPLAY + '건 / 조회 ' + nasRows.length + '건) ---');
  for (const r of nasRows.slice(0, DISPLAY)) {
    const disk = base && r.pdf_file_id ? (fileOnDisk(base, r.pdf_file_id) ? 'Y' : 'N') : '-';
    console.log(`${r.id}\t${r.date}\t${r.farm_code}\t${disk}\t${r.pdf_file_id ?? ''}`);
  }
  if ((nasCount?.c ?? 0) > DISPLAY) {
    console.log(`... (B NAS경로 총 ${nasCount?.c}건, 콘솔은 ${DISPLAY}줄까지. 전체는 --csv 또는 --limit=)`);
  }

  const fixHints = [
    'NAS 경로 + 디스크에 파일 있음 → npx tsx scripts/sync-pdfs-to-drive.ts --base="..." --pending-only',
    'NAS 경로 + 디스크 없음 → python scripts/find-pdfs-under-savepath.py --contains ...',
    'pdf_file_id NULL → 원본 확보 후 ingest, scripts/link-josan-pdf.ts(조산), scripts/link-pdf-by-record-ids.ts --csv=…(record_id+Drive ID 일괄)',
  ];
  console.log('\n=== 해결 힌트 ===\n' + fixHints.map((s) => '· ' + s).join('\n'));

  const csvLines: string[] = [
    [
      'category',
      'id',
      'date',
      'farm_code',
      'disease',
      'test_type',
      'result',
      'pdf_file_id',
      'file_on_disk',
    ].join(','),
  ];

  for (const r of nullRows) {
    csvLines.push(
      [
        'no_pdf',
        r.id,
        r.date,
        csvEscape(r.farm_code),
        csvEscape(r.disease),
        csvEscape(r.test_type),
        csvEscape(r.result),
        '',
        '',
      ].join(',')
    );
  }
  for (const r of nasRows) {
    const rel = (r.pdf_file_id ?? '').replace(/\\/g, '/').trim();
    const onDisk =
      base && rel && NAS_REL_RE.test(rel) ? (fileOnDisk(base, rel) ? 'Y' : 'N') : '';
    csvLines.push(
      [
        'nas_only',
        r.id,
        r.date,
        csvEscape(r.farm_code),
        csvEscape(r.disease),
        csvEscape(r.test_type),
        csvEscape(r.result),
        csvEscape(rel),
        onDisk,
      ].join(',')
    );
  }

  if (csv) {
    fs.writeFileSync(path.resolve(csv), csvLines.join('\n'), 'utf-8');
    console.log(`\nCSV 작성: ${path.resolve(csv)} (${csvLines.length - 1} data rows)`);
  }

  if (jsonOut) {
    const payload = {
      summary,
      noPdfRows: nullRows,
      nasRows: nasRows.map((r) => ({
        ...r,
        file_on_disk:
          base && r.pdf_file_id && NAS_REL_RE.test(r.pdf_file_id)
            ? fileOnDisk(base, r.pdf_file_id)
            : null,
      })),
    };
    fs.writeFileSync(path.resolve(jsonOut), JSON.stringify(payload, null, 2), 'utf-8');
    console.log(`JSON 작성: ${path.resolve(jsonOut)}`);
  }

  if (typeof (sql as any).end === 'function') await (sql as any).end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
