/**
 * 조산(DB3001) 점검: 링크 유무, 3/17 누락 원인
 * 실행: npx tsx scripts/inspect-josan.ts
 */
import * as dotenv from 'dotenv';
import * as XLSX from 'xlsx';

dotenv.config({ path: '.env.local' });

async function main() {
  const { sql } = await import('../lib/db');
  const { FARMS } = await import('../lib/farms');
  const base = 'https://drive.google.com/file/d/';

  console.log('=== 조산(DB3001) DB 레코드 전체 ===\n');

  const rows = (await sql`
    SELECT id, date::text, farm_code, disease, test_type, result, pdf_file_id
    FROM test_records
    WHERE farm_code = 'DB3001'
    ORDER BY date DESC, disease, test_type
  `) as { id: number; date: string; farm_code: string; disease: string; test_type: string; result: string; pdf_file_id: string | null }[];

  let withLink = 0;
  let withoutLink = 0;

  for (const r of rows) {
    const link = r.pdf_file_id ? `${base}${r.pdf_file_id}/view` : '(링크없음)';
    const mark = r.result === '+' ? '[+]' : '';
    if (r.pdf_file_id) withLink++;
    else withoutLink++;
    console.log(`${r.date} ${r.disease} ${r.test_type} ${r.result} ${mark} | ${link}`);
  }

  console.log(`\n총 ${rows.length}건 (링크 있음: ${withLink}, 링크 없음: ${withoutLink})`);

  // 3/17 specifically
  const mar17 = rows.filter((r) => r.date?.includes('-03-17'));
  console.log('\n=== 3월 17일 조산 레코드 ===');
  if (mar17.length === 0) {
    console.log('없음 (DB에 3/17 조산 데이터 없음)');
  } else {
    mar17.forEach((r) => {
      const link = r.pdf_file_id ? `${base}${r.pdf_file_id}/view` : '(링크없음)';
      console.log(`  ${r.date} ${r.disease} ${r.test_type} ${r.result} | ${link}`);
    });
  }

  // Check CSV for 3/17 조산
  console.log('\n=== 검사결과DB.csv 내 조산/3월 관련 행 검색 ===');
  const fs = await import('fs');
  const path = await import('path');
  const csvPath = path.join(process.cwd(), 'scripts', '검사결과DB.csv');
  if (fs.existsSync(csvPath)) {
    const csv = fs.readFileSync(csvPath, 'utf-8');
    const lines = csv.split('\n');
    const header = lines[0] ?? '';
    const josanRows = lines.filter((l) => l.includes('DB3001') || l.includes('조산'));
    const mar17Rows = lines.filter((l) => l.includes('2026-03-17') || l.includes('26-0') && l.includes('03'));
    const josanMar = josanRows.filter((l) => l.includes('2026-03') || l.includes('26-0'));
    console.log(`  조산(DB3001) 관련 행: ${josanRows.length}건`);
    console.log(`  CSV 내 2026-03-17 포함 행: ${lines.filter((l) => l.includes('2026-03-17')).length}건`);
    if (josanMar.length > 0) {
      console.log('  조산 2026년 3월 행 (최근 5건):');
      josanMar.slice(0, 5).forEach((l) => console.log('    ', l.slice(0, 120) + '...'));
    }
    // Show any row with 03-17
    const anyMar17 = lines.filter((l) => l.includes('03-17'));
    if (anyMar17.length > 0) {
      console.log('\n  CSV 내 03-17 포함 행:');
      anyMar17.forEach((l) => console.log('    ', l.slice(0, 150)));
    }
  } else {
    console.log('  검사결과DB.csv 없음');
  }

  // results.xlsx structure
  console.log('\n=== results.xlsx 구조 (OCR import용) ===');
  const xlsxPath = path.join(process.cwd(), 'scripts', 'result', 'results.xlsx');
  const altPath = path.join(process.cwd(), 'scripts', 'results.xlsx');
  const targetPath = fs.existsSync(xlsxPath) ? xlsxPath : fs.existsSync(altPath) ? altPath : null;
  if (targetPath) {
    const wb = XLSX.readFile(targetPath);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
    const headers = (data[0] ?? []) as string[];
    console.log('  헤더:', headers.join(' | '));
    const josanInXlsx = (data as string[][]).filter((r) => {
      const row = Array.isArray(r) ? r : [r];
      return row.some((c) => String(c ?? '').includes('조산') || String(c ?? '').includes('DB3001'));
    });
    console.log(`  조산 포함 행: ${josanInXlsx.length}건`);
    if (josanInXlsx.length > 0) {
      console.log('  샘플 (첫 3행):');
      josanInXlsx.slice(0, 3).forEach((r, i) => {
        const row = Array.isArray(r) ? r : [r];
        console.log('    ', i + 1, row.map((c) => String(c ?? '').slice(0, 25)).join(' | '));
      });
    }
  } else {
    console.log('  results.xlsx 없음');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
