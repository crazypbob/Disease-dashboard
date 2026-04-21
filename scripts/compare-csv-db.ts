/**
 * CSV vs DB 농장·레코드 비교
 * npx tsx scripts/compare-csv-db.ts
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const csvPath = path.join(process.cwd(), 'scripts', '검사결과DB.csv');
  if (!fs.existsSync(csvPath)) {
    console.error('검사결과DB.csv 없음:', csvPath);
    process.exit(1);
  }

  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  const parseCSVLine = (line: string) => {
    const result: string[] = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') inQuote = !inQuote;
      else if (inQuote) cur += c;
      else if (c === ',' || c === '\t') {
        result.push(cur.trim());
        cur = '';
      } else cur += c;
    }
    result.push(cur.trim());
    return result;
  };

  const headers = parseCSVLine(lines[0]);
  const farmIdx = headers.findIndex((h) => h === '농장코드' || h.includes('farm'));
  const dateIdx = headers.findIndex((h) => h === '접수일자' || h.includes('date'));
  const validFarmRe = /^DB\d{4}(-\d+)?$/i;

  if (farmIdx < 0 || dateIdx < 0) {
    console.error('필수 컬럼 없음. 헤더:', headers);
    process.exit(1);
  }

  const extractFarmCode = (v: string) => {
    if (!v || v.length <= 20) return v;
    const m = v.match(/DB\d{4}/i);
    if (m) return m[0].toUpperCase();
    return v.slice(0, 20);
  };

  const csvByFarm: Record<string, number> = {};
  const csvDates = new Set<string>();
  const invalidFarmSamples: Record<string, number> = {};
  let csvTotal = 0;
  const { FARMS } = await import('../lib/farms');
  for (let i = 2; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    const farmRaw = (cols[farmIdx] || '').trim();
    const farm = extractFarmCode(farmRaw);
    const date = (cols[dateIdx] || '').trim();
    const disease = (cols[headers.findIndex((h) => h === '질병명')] || '').trim();
    const testType = (cols[headers.findIndex((h) => h === '검사종류')] || '').trim();
    if (!farm || farm === '농장코드') continue;
    if (farm.length > 20) {
      invalidFarmSamples[farmRaw.slice(0, 50)] = (invalidFarmSamples[farmRaw.slice(0, 50)] ?? 0) + 1;
      continue;
    }
    if (!disease || !testType) continue;
    csvByFarm[farm] = (csvByFarm[farm] ?? 0) + 1;
    if (date) csvDates.add(date.split(' ')[0]);
    csvTotal++;
  }

  console.log('=== CSV (검사결과DB.csv) 농장별 행 수 ===');
  const csvFarms = Object.keys(csvByFarm).sort();
  for (const f of csvFarms) {
    console.log(`  ${f}: ${csvByFarm[f]}건`);
  }
  console.log(`\n총 ${csvFarms.length}개 농장, ${csvTotal}건`);
  console.log('날짜 범위:', [...csvDates].sort().slice(0, 3).join(', '), '~', [...csvDates].sort().slice(-3).join(', '));
  const invalidKeys = Object.keys(invalidFarmSamples);
  if (invalidKeys.length) {
    console.log('\n[import 스킵] 농장코드 비정형(20자초과/DB####아님) 샘플:');
    invalidKeys.slice(0, 12).forEach((k) => console.log(`  "${k}": ${invalidFarmSamples[k]}건`));
    if (invalidKeys.length > 12) console.log(`  ... 외 ${invalidKeys.length - 12}종`);
  }

  // DB 조회
  const { sql } = await import('../lib/db');
  let dbRows: { farm_code: string; cnt: number }[];
  try {
    dbRows = (await sql`
      SELECT farm_code, COUNT(*)::int as cnt
      FROM test_records
      GROUP BY farm_code
      ORDER BY farm_code
    `) as { farm_code: string; cnt: number }[];
  } catch (e) {
    console.log('\n[DB 연결 불가]', (e as Error).message);
    process.exit(0);
  }
  const dbByFarm: Record<string, number> = {};
  let dbTotal = 0;
  for (const r of dbRows as { farm_code: string; cnt: number }[]) {
    dbByFarm[r.farm_code] = r.cnt;
    dbTotal += r.cnt;
  }

  console.log('\n=== DB (test_records) 농장별 레코드 수 ===');
  const dbFarms = Object.keys(dbByFarm).sort();
  for (const f of dbFarms) {
    console.log(`  ${f}: ${dbByFarm[f]}건`);
  }
  console.log(`\n총 ${dbFarms.length}개 농장, ${dbTotal}건`);

  // 비교
  const csvOnly = csvFarms.filter((f) => !dbFarms.includes(f));
  const dbOnly = dbFarms.filter((f) => !csvFarms.includes(f));
  const both = csvFarms.filter((f) => dbFarms.includes(f));

  console.log('\n=== 비교 ===');
  const notInFarms = [...new Set([...csvFarms, ...dbFarms])].filter((f) => !(f in FARMS));
  if (notInFarms.length) {
    console.log('[참고] FARMS 미등록 farm_code는 대시보드 매트릭스에 표시되지 않음:', notInFarms.slice(0, 8).join(', '));
  }
  if (csvOnly.length) {
    console.log('\nCSV에만 있음 (DB 미수집):', csvOnly.join(', '));
    for (const f of csvOnly) {
      console.log(`  → ${f}: CSV ${csvByFarm[f] ?? 0}건`);
    }
  }
  if (dbOnly.length) {
    console.log('DB에만 있음 (CSV 없음, 메일/수동 등):', dbOnly.join(', '));
  }
  console.log('양쪽 모두:', both.join(', '));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
