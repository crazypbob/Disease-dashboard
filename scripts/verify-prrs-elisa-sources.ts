/**
 * PRRS ELISA(항체) — DB 행 vs results.xlsx `PRRS_항체` 셀 대조 (매트릭스 점검용)
 *
 * 사용:
 *   npm.cmd exec -- tsx scripts/verify-prrs-elisa-sources.ts
 *   npm.cmd exec -- tsx scripts/verify-prrs-elisa-sources.ts --from=2026-04-07 --to=2026-04-13 --farms=DB1001,DB1003
 *   npm.cmd exec -- tsx scripts/verify-prrs-elisa-sources.ts --file=X:/ocr-pipeline/output/results.xlsx
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { getFarmCode } from '../lib/mail-pipeline/farm-mapping';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

function argValue(key: string): string | null {
  const a = process.argv.slice(2).find((x) => x.startsWith(`${key}=`));
  return a ? a.slice(key.length + 1) : null;
}

function findXlsxPath(explicit?: string | null): string | null {
  const cwd = process.cwd();
  const outputPath = process.env.OCR_OUTPUT_PATH?.trim();
  const candidates: string[] = [];
  if (explicit) candidates.push(explicit);
  if (outputPath) {
    candidates.push(path.join(outputPath, 'result.xlsx'));
    candidates.push(path.join(outputPath, 'results.xlsx'));
    candidates.push(outputPath);
  }
  candidates.push(path.join(cwd, 'ocr-pipeline', 'output', 'result.xlsx'));
  candidates.push(path.join(cwd, 'ocr-pipeline', 'output', 'results.xlsx'));
  candidates.push(path.join(cwd, 'scripts', 'results.xlsx'));
  for (const p of candidates) {
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  }
  return null;
}

function normalizeDateCell(v: unknown, xlsx: typeof XLSX): string {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === 'number' && v > 20000 && xlsx.SSF?.parse_date_code) {
    const o = xlsx.SSF.parse_date_code(v) as { y: number; m: number; d: number } | null;
    if (o?.y) {
      return `${o.y}-${String(o.m).padStart(2, '0')}-${String(o.d).padStart(2, '0')}`;
    }
  }
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d{4}\/\d{2}\/\d{2}/.test(s)) return s.replace(/\//g, '-').slice(0, 10);
  return s;
}

async function main() {
  const fromStr = (argValue('--from') ?? '2026-04-07').trim();
  const toStr = (argValue('--to') ?? '2026-04-13').trim();
  const farmsArg = (argValue('--farms') ?? 'DB1001,DB1003').trim();
  const farms = farmsArg.split(',').map((s) => s.trim()).filter(Boolean);
  const fileArg = argValue('--file');

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL이 없습니다. .env.local을 확인하세요.');
    process.exit(1);
  }

  const { sql } = await import('../lib/db');
  const rows = await sql`
    SELECT id, date::text AS date, farm_code, disease, test_type, result, pdf_file_id
    FROM test_records
    WHERE disease = 'PRRS'
      AND test_type = 'ELISA'
      AND farm_code = ANY(${farms})
      AND date >= ${fromStr}::date
      AND date <= ${toStr}::date
    ORDER BY farm_code, date::text, id
  `;

  console.log('=== DB: PRRS + ELISA ===');
  console.log(`기간: ${fromStr} ~ ${toStr}, 농장: ${farms.join(', ')}`);
  console.log(`행 수: ${rows.length}`);
  console.log(JSON.stringify(rows, null, 2));

  const xlsxPath = findXlsxPath(fileArg);
  if (!xlsxPath) {
    console.log('\n=== results.xlsx ===');
    console.log('파일 없음 (OCR_OUTPUT_PATH / ocr-pipeline/output/results.xlsx / scripts/results.xlsx).');
    process.exit(0);
  }

  const wb = XLSX.readFile(xlsxPath, { cellDates: true });
  const sheetName = wb.SheetNames.includes('결과') ? '결과' : wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
  const headers = (data[0] ?? []).map((h) => String(h ?? ''));
  const dateIdx = headers.findIndex((h) => /날짜|접수/i.test(h));
  const farmIdx = headers.findIndex((h) => /농장/i.test(h));
  const fileIdx = headers.findIndex((h) => /파일명/i.test(h));
  const prrsAbIdx = headers.findIndex((h) => String(h).trim() === 'PRRS_항체');

  console.log('\n=== results.xlsx ===');
  console.log('파일:', xlsxPath);
  console.log('시트:', sheetName, '| PRRS_항체 열:', prrsAbIdx >= 0 ? headers[prrsAbIdx] : '(열 없음)');

  if (dateIdx < 0 || farmIdx < 0 || prrsAbIdx < 0) {
    console.log('날짜/농장/PRRS_항체 열을 찾지 못했습니다. 헤더:', headers.join(' | '));
    process.exit(0);
  }

  type Key = string;
  const xlsxByFarmDate = new Map<Key, string>();
  for (let i = 1; i < data.length; i++) {
    const row = (data[i] ?? []) as unknown as string[];
    const d = normalizeDateCell(row[dateIdx], XLSX);
    const farmCol = String(row[farmIdx] ?? '').trim();
    const fileCol = fileIdx >= 0 ? String(row[fileIdx] ?? '').trim() : '';
    const merged = [farmCol, fileCol].filter(Boolean).join(' ');
    const rowFarmDb = String(getFarmCode(merged) || getFarmCode(farmCol));
    const cell = String(row[prrsAbIdx] ?? '').trim();
    if (!d) continue;
    for (const fc of farms) {
      if (rowFarmDb !== fc) continue;
      const k = `${fc}|${d}`;
      const prev = xlsxByFarmDate.get(k);
      if (prev === undefined || (prev === '' && cell !== '')) xlsxByFarmDate.set(k, cell);
    }
  }

  console.log('\n=== DB vs xlsx PRRS_항체 (같은 farm_code + date) ===');
  for (const r of rows as Array<{
    id: number;
    date: string;
    farm_code: string;
    result: string;
    pdf_file_id: string | null;
  }>) {
    const d = String(r.date).slice(0, 10);
    const k = `${r.farm_code}|${d}`;
    const xcell = xlsxByFarmDate.get(k) ?? '(xlsx에 해당 farm+date 행 없음)';
    console.log(`${r.farm_code} ${d} | DB id=${r.id} result=${JSON.stringify(r.result)} pdf=${r.pdf_file_id ?? ''}`);
    console.log(`  xlsx PRRS_항체: ${xcell}`);
  }

  if (typeof (sql as { end?: () => Promise<void> }).end === 'function') {
    await (sql as { end: () => Promise<void> }).end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
