/**
 * 검사결과DB 시트 CSV → Neon DB import
 *
 * 사용법:
 * 1. Google 시트 "검사결과DB" → 파일 → 다운로드 → CSV(.csv)
 * 2. 저장 위치: scripts/검사결과DB.csv (또는 --file 경로 지정)
 * 3. npm run import:sheet
 *
 * 실행: npx tsx scripts/import-from-sheet-csv.ts [--file=경로]
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env.local' });

async function main() {
  const args = process.argv.slice(2);
  const fileArg = args.find((a) => a.startsWith('--file='));
  const defaultPath = path.join(process.cwd(), 'scripts', '검사결과DB.csv');
  const csvPath = fileArg?.replace('--file=', '').trim() || defaultPath;

  if (!fs.existsSync(csvPath)) {
    console.error(
      `파일을 찾을 수 없습니다:\n  ${csvPath}\n` +
        `다른 경로라면: npx tsx scripts/import-from-sheet-csv.ts --file=경로`
    );
    process.exit(1);
  }

  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    console.error('CSV에 데이터가 없습니다.');
    process.exit(1);
  }

  const headers = parseCSVLine(lines[0]);
  const dateIdx = findColumn(headers, ['접수일자', 'date', '날짜']);
  const farmIdx = findColumn(headers, ['농장코드', 'farm_code', 'farm']);
  const farmNameIdx = findColumn(headers, ['농장명', 'farm_name', 'farmName']);
  const accessNoIdx = findColumn(headers, ['접수번호', 'accession_no', 'accessionNo']);
  const diseaseIdx = findColumn(headers, ['질병명', 'disease']);
  const typeIdx = findColumn(headers, ['검사종류', 'test_type', '검사']);
  const resultIdx = findColumn(headers, ['결과', 'result']);
  const fileIdIdx = findColumn(headers, ['PDF_파일ID', 'pdf_file_id', 'file_id', '파일ID']);

  if (dateIdx < 0 || farmIdx < 0 || diseaseIdx < 0 || resultIdx < 0) {
    console.error('필수 컬럼 누락. 헤더:', headers);
    process.exit(1);
  }

  const { sql } = await import('../lib/db');
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const seen = new Set<string>();

  const { getFarmCode } = await import('../lib/mail-pipeline/farm-mapping');
  const { FARMS } = await import('../lib/farms');
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    const date = normalizeDate(cols[dateIdx]);
    const farmRaw = (cols[farmIdx] || '').trim();
    const farmNameRaw = farmNameIdx >= 0 ? (cols[farmNameIdx] || '').trim() : '';
    let farm = extractFarmCode(farmRaw);
    if (!farm || farm.length > 20 || !(farm in FARMS)) {
      const resolved = getFarmCode(farmRaw || farmNameRaw) as string;
      if (resolved && resolved.length <= 20 && resolved in FARMS) farm = resolved;
    }
    const disease = normalizeDisease((cols[diseaseIdx] || '').trim());
    const typeRaw = (cols[typeIdx] || '').trim();
    const accessNo = accessNoIdx >= 0 ? (cols[accessNoIdx] || '').trim() : '';
    const isGenomic = farmRaw.includes('염기서열') || accessNo.includes('염기서열') || typeRaw.includes('염기서열') || typeRaw.includes('유전자');
    const testType = isGenomic ? '유전자분석' : normalizeTestType(typeRaw);
    const result = (cols[resultIdx] || '').trim() || '-';
    const fileId = fileIdIdx >= 0 ? extractDriveId((cols[fileIdIdx] || '').trim()) : null;

    if (!date || !farm || farm.length > 20 || !disease) {
      skipped++;
      continue;
    }

    const key = `${date}_${farm}_${disease}_${testType}`;
    if (seen.has(key)) {
      skipped++;
      continue;
    }
    seen.add(key);

    const existing = await sql`
      SELECT id, pdf_file_id FROM test_records WHERE date = ${date} AND farm_code = ${farm} AND disease = ${disease} AND test_type = ${testType} LIMIT 1
    `;
    if (existing.length > 0) {
      if (fileId && (!existing[0].pdf_file_id || existing[0].pdf_file_id.trim() === '')) {
        try {
          await sql`
            UPDATE test_records SET pdf_file_id = ${fileId} WHERE id = ${(existing[0] as { id: number }).id}
          `;
          updated++;
        } catch (e) {
          console.warn(`행 ${i + 1} 업데이트 오류:`, (e as Error).message);
          skipped++;
        }
      } else {
        skipped++;
      }
      continue;
    }

    try {
      await sql`
        INSERT INTO test_records (date, farm_code, disease, test_type, result, pdf_file_id, method, details)
        VALUES (${date}, ${farm}, ${disease}, ${testType}, ${result}, ${fileId}, null, null)
      `;
      inserted++;
    } catch (e) {
      console.warn(`행 ${i + 1} 오류:`, (e as Error).message);
      skipped++;
    }
  }

  console.log(`완료: ${inserted}건 삽입, ${updated}건 Drive 링크 업데이트, ${skipped}건 스킵`);
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuote = !inQuote;
    } else if (inQuote) {
      cur += c;
    } else if (c === ',' || c === '\t') {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur.trim());
  return result;
}

function findColumn(headers: string[], names: string[]): number {
  const lower = headers.map((h) => h.toLowerCase().replace(/\s/g, ''));
  for (const n of names) {
    const idx = lower.findIndex((h) => h.includes(n.toLowerCase().replace(/\s/g, '')));
    if (idx >= 0) return idx;
  }
  return -1;
}

function normalizeDate(v: string): string {
  if (!v) return '';
  const m1 = v.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (m1) return `${m1[1]}-${m1[2].padStart(2, '0')}-${m1[3].padStart(2, '0')}`;
  const m2 = v.match(/(\d{4})(\d{2})(\d{2})/);
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;
  return v;
}

function normalizeDisease(v: string): string {
  if (!v) return 'PRRS';
  const u = v.toUpperCase();
  if (u.includes('SIV') || u.includes('인플루엔자') || u.includes('IAV')) return 'IAV';
  if (u.includes('PED')) return 'PED';
  if (u.includes('PRRS')) return 'PRRS';
  if (u.includes('PCV')) return 'PCV2';
  if (u.includes('APP') || u.includes('파스튜렐라') || u.includes('Pasteurella')) return 'APP';
  if (u.includes('마이코플라즈마') || u.includes('Mycoplasma') || u.includes('MH')) return '세균';
  return v || 'PRRS';
}

function normalizeTestType(v: string): string {
  if (!v) return 'PCR';
  if (v.includes('항체') || v.includes('ELISA') || v.includes('혈청')) return 'ELISA';
  return 'PCR';
}

function extractFarmCode(v: string): string {
  if (!v || v.length <= 20) return v;
  const m = v.match(/DB\d{4}/i);
  if (m) return m[0].toUpperCase();
  return v.slice(0, 20);
}

function extractDriveId(input: string): string | null {
  if (!input) return null;
  const m = input.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  const m2 = input.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m2) return m2[1];
  if (/^[a-zA-Z0-9_-]{10,}$/.test(input) && !/^test-\d/i.test(input)) return input;
  return null;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
