/**
 * results.xlsx 구조·내용 점검 (전북대 파싱 디버깅용)
 *
 * npx tsx scripts/inspect-ocr-excel.ts
 * npx tsx scripts/inspect-ocr-excel.ts --file=ocr-pipeline/output/results.xlsx
 */
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';

function main() {
  const args = process.argv.slice(2);
  const fileArg = args.find((a) => a.startsWith('--file='));
  const cwd = process.cwd();
  const candidates = [
    fileArg?.replace('--file=', ''),
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
    console.error('results.xlsx를 찾을 수 없습니다.');
    process.exit(1);
  }

  console.log('=== Excel 구조 점검 ===');
  console.log('파일:', xlsxPath);
  const wb = XLSX.readFile(xlsxPath);
  const sheetName = wb.SheetNames.includes('결과') ? '결과' : wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });

  console.log('\n[1] 헤더:', (data[0] ?? []).map((h, i) => `${i}:${String(h ?? '').slice(0, 15)}`).join(' | '));

  const headers = (data[0] ?? []).map((h) => String(h ?? ''));
  const dateIdx = headers.findIndex((h) => /접수|날짜|date/i.test(h));
  const farmIdx = headers.findIndex((h) => /농장|farm/i.test(h));
  const prrsIdx = headers.findIndex((h) => /PRRS|결과/i.test(h));

  console.log('[2] 날짜 컬럼:', dateIdx >= 0 ? dateIdx : '없음');
  console.log('[3] 농장 컬럼:', farmIdx >= 0 ? farmIdx : '없음');
  console.log('[4] PRRS 등 결과 컬럼:', prrsIdx >= 0 ? prrsIdx : '없음');

  const a1Len = String((data[1] as string[])?.[0] ?? '').length;
  const restEmpty = (data[1] as string[])?.slice(1).every((v) => !String(v ?? '').trim());
  console.log('[5] 2행 A열 길이:', a1Len, '| 나머지 비어있음:', restEmpty, '→ 단일컬럼 가능:', a1Len > 60 && restEmpty);

  console.log('\n[6] 전북대·문강·2010 포함 행 샘플 (최대 5개):');
  let count = 0;
  for (let i = 1; i < data.length && count < 5; i++) {
    const row = data[i] ?? [];
    const rowStr = JSON.stringify(row).slice(0, 200);
    if (/전북대|문강|2010|vetdxlab|jbnu|네스트/i.test(rowStr)) {
      console.log(`  행${i + 1}:`, rowStr + (rowStr.length >= 200 ? '...' : ''));
      count++;
    }
  }
  if (count === 0) console.log('  (해당 없음)');

  console.log('\n[7] 전체 행 수:', data.length - 1);
}

main();
