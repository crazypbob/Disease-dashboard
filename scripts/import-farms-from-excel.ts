/**
 * 농장주소록-규모(250401 기준).xlsx에서 농장 목록 읽어 farms 테이블 및 lib/farms.ts 반영
 * 실행: npx tsx scripts/import-farms-from-excel.ts
 *
 * 파일 위치: disease-dashboard/ 또는 disease-dashboard/../ 에서 *.xlsx 검색
 */
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const GROUP_MAP: Record<string, string> = {
  직영: '직영',
  협력: '협력',
  'SP센터': 'SP센터',
  SP센터: 'SP센터',
  위탁장: '위탁장',
  위탁: '위탁장',
};

function findExcelFile(): string | null {
  const base = process.cwd();
  const candidates = [
    path.join(base, '농장주소록-규모(250401 기준).xlsx'),
    path.join(base, '농장주소록-규모(250401기준).xlsx'),
    path.join(base, '농장주소록-규모.xlsx'),
    path.join(base, '..', '농장주소록-규모(250401 기준).xlsx'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  const dir = fs.readdirSync(base);
  const xlsx = dir.find((f) => f.endsWith('.xlsx') && f.includes('농장'));
  if (xlsx) return path.join(base, xlsx);
  return null;
}

function normalizeHeader(s: string): string {
  return String(s ?? '')
    .trim()
    .replace(/\s+/g, '');
}

function findColumnIdx(headers: string[], aliases: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    const n = normalizeHeader(headers[i]);
    if (aliases.some((a) => n.includes(a) || n === a)) return i;
  }
  return -1;
}

interface FarmRow {
  code: string;
  name: string;
  group: string;
  vet: string;
}

function parseExcel(filePath: string): FarmRow[] {
  const wb = XLSX.readFile(filePath, { type: 'file' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
  if (!data.length) return [];

  // 첫 행이 제목(다비육종 농장 주소록)일 수 있음 → 두 번째 행이 헤더인지 확인
  let headerRowIdx = 0;
  const row0 = (data[0] ?? []).map((h) => String(h ?? ''));
  const row1 = (data[1] ?? []).map((h) => String(h ?? ''));
  if (row1.some((h) => /구분|코드|본장|농장/.test(normalizeHeader(h)))) {
    headerRowIdx = 1;
  }
  const headers = (data[headerRowIdx] ?? []).map((h) => String(h ?? ''));

  const verbose = process.env.VERBOSE === '1' || process.argv.includes('--verbose');
  if (verbose) {
    console.log('헤더:', headers.slice(0, 15));
    console.log('첫 3행:', (data.slice(headerRowIdx + 1, headerRowIdx + 4) ?? []).map((r) => (r ?? []).slice(0, 10)));
  }

  const codeIdx = findColumnIdx(headers, ['코드번호', '농장코드', '코드', 'farmcode', 'code']);
  const nameIdx = findColumnIdx(headers, ['본장', '농장명', '농장', 'name', 'farmname', '이름']);
  const groupIdx = findColumnIdx(headers, ['구분', '그룹', 'group', '분류', '유형']);
  const vetIdx = findColumnIdx(headers, ['담당수의사', '수의사', '담당', 'vet', '담당의']);

  if (codeIdx < 0 && nameIdx < 0) {
    console.warn('농장코드/농장명 컬럼을 찾을 수 없습니다. 헤더:', headers.slice(0, 8));
    return [];
  }

  const rows: FarmRow[] = [];
  for (let i = headerRowIdx + 1; i < data.length; i++) {
    const row = data[i] ?? [];
    const codeRaw = codeIdx >= 0 ? String(row[codeIdx] ?? '').trim() : '';
    const nameRaw = nameIdx >= 0 ? String(row[nameIdx] ?? '').trim() : '';
    const code = codeRaw || (nameRaw ? `DB_${i}` : '');
    const name = nameRaw || code;
    if (!code && !name) continue;

    let codeNorm = code;
    const m = code.match(/D[A-Z]?(\d{4})/i);
    if (m) codeNorm = 'DB' + m[1];

    const groupRaw = groupIdx >= 0 ? String(row[groupIdx] ?? '').trim() : '직영';
    const group = GROUP_MAP[groupRaw] ?? (groupRaw || '직영');
    const vet = vetIdx >= 0 ? String(row[vetIdx] ?? '').trim() || '-' : '-';

    rows.push({ code: codeNorm, name, group, vet });
  }
  return rows;
}

async function main() {
  const filePath = findExcelFile();
  if (!filePath) {
    console.error('농장주소록 xlsx 파일을 찾을 수 없습니다.');
    console.error('disease-dashboard/ 또는 상위 폴더에 농장주소록-규모(250401 기준).xlsx 를 두세요.');
    process.exit(1);
  }

  console.log('파일:', filePath);
  const farms = parseExcel(filePath);
  if (!farms.length) {
    console.error('추출된 농장이 없습니다.');
    process.exit(1);
  }

  console.log(`추출: ${farms.length}건`);

  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.log('DATABASE_URL 없음. farms 테이블 업데이트 생략.');
    console.log('추출 결과 (처음 10건):');
    farms.slice(0, 10).forEach((f) => console.log(`  ${f.code} | ${f.name} | ${f.group} | ${f.vet}`));
    return;
  }

  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(DATABASE_URL);

  for (const f of farms) {
    await sql`
      INSERT INTO farms (code, name, "group", vet)
      VALUES (${f.code}, ${f.name}, ${f.group}, ${f.vet})
      ON CONFLICT (code) DO UPDATE SET
        name = EXCLUDED.name,
        "group" = EXCLUDED.group,
        vet = EXCLUDED.vet
    `;
  }
  console.log('farms 테이블 업데이트 완료.');

  if (process.argv.includes('--sync-farms-ts')) {
    const ordered = [...farms].sort((a, b) => {
      const gOrder = ['직영', '협력', 'SP센터', '위탁장'].indexOf(a.group) - ['직영', '협력', 'SP센터', '위탁장'].indexOf(b.group);
      if (gOrder !== 0) return gOrder;
      return a.code.localeCompare(b.code);
    });
    const lines = ordered.map((f) => `  ${f.code}: { name: '${f.name.replace(/'/g, "\\'")}', group: '${f.group}', vet: '${f.vet.replace(/'/g, "\\'")}' },`);
    console.log('\n--- lib/farms.ts FARMS 객체 (복사 후 교체) ---');
    console.log('export const FARMS = {');
    console.log(lines.join('\n'));
    console.log('} as const;');
  } else {
    console.log('\nlib/farms.ts 동기화: --sync-farms-ts 옵션으로 FARMS 객체 출력');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
