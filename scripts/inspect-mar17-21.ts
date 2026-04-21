/**
 * results.xlsx + DB에서 3/17, 3/21 성진·대덕 데이터 확인
 * npx tsx scripts/inspect-mar17-21.ts
 */
import * as dotenv from 'dotenv';
import * as XLSX from 'xlsx';
import * as path from 'path';

dotenv.config({ path: '.env.local' });

function findCol(h: string[], names: string[]) {
  for (const n of names) {
    const i = h.findIndex((x) => String(x).toLowerCase().includes(n.toLowerCase()));
    if (i >= 0) return i;
  }
  return -1;
}

async function main() {
  const xlsxPath = path.join(process.cwd(), 'scripts', 'results.xlsx');
  const wb = XLSX.readFile(xlsxPath);
  const data = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[0]], { header: 1 });
  const headers = (data[0] ?? []).map(String);
  const dateIdx = findCol(headers, ['날짜', 'date', '접수일자']);
  const farmIdx = findCol(headers, ['농장명', '농장', 'farm']);
  const fileIdx = findCol(headers, ['파일명', 'file']);

  // Excel 날짜는 숫자(44925) 또는 문자열일 수 있음
  const toStr = (v: unknown) => {
    if (v == null) return '';
    if (typeof v === 'number') return String(v);
    return String(v).trim();
  };
  const normDate = (v: string) => {
    const m = v.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
    const m2 = v.match(/(\d{4})(\d{2})(\d{2})/);
    if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;
    return v;
  };

  console.log('\n=== results.xlsx: 3/17, 3/21 + 대덕/성진 ===');
  const xlsxRows: string[][] = [];
  const anyMar: string[][] = [];
  for (let i = 1; i < data.length; i++) {
    const r = data[i] ?? [];
    const dRaw = toStr(r[dateIdx]);
    const d = normDate(dRaw) || dRaw;
    const f = toStr(r[farmIdx]);
    const isDate = /202[56]-03-(17|21)/.test(d) || /03[-./]17|03[-./]21/.test(d) || /03[-./]17|03[-./]21/.test(dRaw);
    const isFarm = /대덕|성진|DB1001|DB1002|성진종돈|대덕종돈/.test(f);
    if (isDate && isFarm) xlsxRows.push([d, f, String(r[fileIdx] ?? '').slice(0, 60)]);
    if (isDate) anyMar.push([d, f, String(r[fileIdx] ?? '').slice(0, 55)]);
  }
  if (xlsxRows.length > 0) {
    xlsxRows.forEach((x, i) => console.log('  ', i + 1, '|', x[0], '|', x[1], '|', x[2]));
  } else {
    console.log('  (3/17·3/21 + 대덕/성진 매칭 없음)');
    console.log('\n  [3/17 또는 3/21 전체 행]', anyMar.length, '건');
    anyMar.slice(0, 30).forEach((x, i) => console.log('   ', i + 1, '|', x[0], '|', x[1], '|', x[2]));
    if (anyMar.length > 30) console.log('   ... 외', anyMar.length - 30, '건');
  }
  const allDates = data.slice(1).map((r) => normDate(toStr((r ?? [])[dateIdx]))).filter(Boolean);
  const uniq = [...new Set(allDates)].sort();
  const mar26 = uniq.filter((d) => d.startsWith('2026-03'));
  console.log('\n  [results.xlsx 날짜 범위]', uniq[0], '~', uniq[uniq.length - 1]);
  console.log('  [2026-03 전체]', mar26.length, '일:', mar26.join(', '));
  const daedeokSeongjin = data.slice(1).filter((r) => {
    const f = toStr((r ?? [])[farmIdx]);
    return /대덕|성진|DB1001|DB1002|성진종돈|대덕종돈/.test(f);
  });
  const farmsByDate = new Map<string, Set<string>>();
  for (const r of daedeokSeongjin) {
    const d = normDate(toStr((r ?? [])[dateIdx]));
    if (!d) continue;
    if (!farmsByDate.has(d)) farmsByDate.set(d, new Set());
    farmsByDate.get(d)!.add(toStr((r ?? [])[farmIdx]));
  }
  const recent = [...farmsByDate.entries()].filter(([d]) => d >= '2026-01').sort((a, b) => b[0].localeCompare(a[0])).slice(0, 15);
  console.log('\n  [대덕/성진 최근 날짜별]');
  recent.forEach(([d, farms]) => console.log('    ', d, ':', [...farms].join(', ')));

  const { sql } = await import('../lib/db');
  console.log('\n=== DB: 3/17, 3/21 대덕(DB1002)·성진(DB1001) ===');
  const dbRows = (await sql`
    SELECT id, date::text as d, farm_code, disease, test_type, result, pdf_file_id
    FROM test_records
    WHERE farm_code IN ('DB1001','DB1002')
      AND (date::text LIKE '%-03-17' OR date::text LIKE '%-03-21')
    ORDER BY date, farm_code, disease, test_type
  `) as { id: number; d: string; farm_code: string; disease: string; test_type: string; result: string; pdf_file_id: string | null }[];
  const byDate = new Map<string, typeof dbRows>();
  for (const r of dbRows) {
    const key = r.d;
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push(r);
  }
  const base = 'https://drive.google.com/file/d/';
  for (const [d, rows] of [...byDate.entries()].sort()) {
    console.log('\n  ', d, ':', rows.length, '건');
    rows.forEach((r) => {
      const link = r.pdf_file_id ? `${base}${r.pdf_file_id}/view` : '(PDF미연결)';
      console.log('      ', r.farm_code, r.disease, r.test_type, r.result, '|', link);
    });
  }
  if (dbRows.length === 0) console.log('  (DB에 해당 데이터 없음)');
}

main().catch(console.error);
