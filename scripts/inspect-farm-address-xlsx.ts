/**
 * 농장주소록 xlsx 시트·헤더·샘플 행 출력
 * npx tsx scripts/inspect-farm-address-xlsx.ts
 * npx tsx scripts/inspect-farm-address-xlsx.ts --file=농장주소록-규모(250401 기준).xlsx
 */
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';

const cwd = process.cwd();
const arg = process.argv.find((a) => a.startsWith('--file='));
const defaultName = '농장주소록-규모(250401 기준).xlsx';
const xlsxPath = arg
  ? path.resolve(cwd, arg.slice('--file='.length))
  : path.join(cwd, defaultName);

if (!fs.existsSync(xlsxPath)) {
  console.error('파일 없음:', xlsxPath);
  process.exit(1);
}

const wb = XLSX.readFile(xlsxPath);
console.log('파일:', xlsxPath);
console.log('시트:', wb.SheetNames.join(', '));

for (const name of wb.SheetNames) {
  const sheet = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  console.log('\n=== 시트:', name, '===');
  console.log('행 수:', rows.length);
  if (rows.length > 0) {
    const keys = Object.keys(rows[0]);
    console.log('열:', keys.join(' | '));
    for (let i = 0; i < Math.min(5, rows.length); i++) {
      console.log('샘플', i + 1, ':', JSON.stringify(rows[i], null, 0));
    }
  }
}
