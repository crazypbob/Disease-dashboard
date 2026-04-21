/**
 * OCR results.xlsx에서 특정 날짜/농장 행을 출력 (누락 원인 확인용)
 *
 * 사용:
 *   npx tsx scripts/inspect-ocr-excel-rows.ts --date=2026-03-20 --farm=DB3001 --file="X:/ocr-pipeline/output/results.xlsx"
 *   npx tsx scripts/inspect-ocr-excel-rows.ts --date=2026-03-20 --farm=조산
 */
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';

function argValue(key: string): string | null {
  const a = process.argv.slice(2).find((x) => x.startsWith(`${key}=`));
  return a ? a.slice(key.length + 1) : null;
}

function main() {
  const fileArg = argValue('--file');
  const date = (argValue('--date') ?? '').trim();
  const farm = (argValue('--farm') ?? '').trim();

  const cwd = process.cwd();
  const candidates = [
    fileArg,
    path.join(cwd, 'ocr-pipeline', 'output', 'results.xlsx'),
    path.join(cwd, 'ocr-pipeline', 'output', 'result.xlsx'),
    path.join(cwd, 'scripts', 'results.xlsx'),
  ].filter(Boolean) as string[];

  let xlsxPath = '';
  for (const p of candidates) {
    if (p && fs.existsSync(p)) {
      xlsxPath = p;
      break;
    }
  }
  if (!xlsxPath) {
    console.error('results.xlsx를 찾을 수 없습니다. --file로 경로를 지정하세요.');
    process.exit(1);
  }

  const wb = XLSX.readFile(xlsxPath);
  const sheetName = wb.SheetNames.includes('결과') ? '결과' : wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
  const headers = (data[0] ?? []).map((h) => String(h ?? ''));

  const dateIdx = headers.findIndex((h) => /날짜|접수/i.test(h));
  const farmIdx = headers.findIndex((h) => /농장/i.test(h));

  if (!date && !farm) {
    console.log('필터 없음: --date 또는 --farm을 지정하세요.');
    console.log('헤더:', headers.join(' | '));
    process.exit(0);
  }

  const matches: string[][] = [];
  for (let i = 1; i < data.length; i++) {
    const row = (data[i] ?? []) as unknown as string[];
    const rowDate = dateIdx >= 0 ? String(row[dateIdx] ?? '').trim() : '';
    const rowFarm = farmIdx >= 0 ? String(row[farmIdx] ?? '').trim() : '';
    const dateOk = date ? rowDate.includes(date) : true;
    const farmOk = farm ? (rowFarm.includes(farm) || row.some((c) => String(c ?? '').includes(farm))) : true;
    if (dateOk && farmOk) matches.push(row.map((c) => String(c ?? '').trim()));
  }

  console.log('파일:', xlsxPath);
  console.log('시트:', sheetName);
  console.log('매칭 행 수:', matches.length);
  console.log('헤더:', headers.join(' | '));
  console.log();

  for (const [idx, row] of matches.slice(0, 20).entries()) {
    const preview = row
      .map((v, i) => {
        if (!v) return null;
        const h = headers[i] ?? String(i);
        return `${h}=${v}`;
      })
      .filter(Boolean)
      .join(' | ');
    console.log(`--- row ${idx + 1} ---`);
    console.log(preview);
  }
  if (matches.length > 20) console.log(`... (${matches.length - 20} more)`);
}

main();

