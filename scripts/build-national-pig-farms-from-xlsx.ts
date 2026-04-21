/**
 * 전국돼지농장_행안부기준.xlsx → public/data/national-pig-farms.json
 * 클라이언트: 축산일련번호·WGS84 좌표·시도(1단어)만. 농장명·주소 문자열 미포함.
 * npx tsx scripts/build-national-pig-farms-from-xlsx.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import proj4 from 'proj4';
import type { NationalPigFarmRecord, NationalPigFarmsFile } from '../lib/national-pig-farm-types';

const DEFAULT_FILE = '전국돼지농장_행안부기준.xlsx';
const SHEET = 'Sheet1';
const OUT = path.join(process.cwd(), 'public', 'data', 'national-pig-farms.json');

/** Korea 2000 / Central Belt — 행안부 좌표정보(X)(Y) 일반적 */
proj4.defs(
  'EPSG:5179',
  '+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=500000 +ellps=GRS80 +units=m +no_defs'
);

function parseSidoFromRow(row: Record<string, unknown>): string | undefined {
  const road = String(row['도로명주소'] ?? '').trim();
  const jibun = String(row['지번주소'] ?? '').trim();
  const addr = road || jibun;
  if (!addr) return undefined;
  const first = addr.split(/\s+/)[0];
  if (
    /(특별시|광역시|특별자치시|도|특별자치도)$/.test(first) ||
    first.endsWith('시') ||
    first.endsWith('도')
  ) {
    return first;
  }
  return undefined;
}

function toNumber(v: unknown): number | null {
  if (v === '' || v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function main() {
  const arg = process.argv.find((a) => a.startsWith('--file='));
  const xlsxPath = path.resolve(process.cwd(), arg ? arg.slice('--file='.length) : DEFAULT_FILE);

  if (!fs.existsSync(xlsxPath)) {
    console.error('파일 없음:', xlsxPath);
    process.exit(1);
  }

  const wb = XLSX.readFile(xlsxPath);
  if (!wb.SheetNames.includes(SHEET)) {
    console.error('시트 없음:', SHEET);
    process.exit(1);
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[SHEET], { defval: '' });
  const farms: NationalPigFarmRecord[] = [];

  for (const row of rows) {
    const kind = String(row['주사육업종'] ?? '').trim();
    if (kind && kind !== '돼지') continue;

    const seqRaw = row['축산일련번호'];
    if (seqRaw === '' || seqRaw === null || seqRaw === undefined) continue;
    const livestockSeq = String(seqRaw).trim();

    const x = toNumber(row['좌표정보(X)']);
    const y = toNumber(row['좌표정보(Y)']);
    if (x == null || y == null) continue;

    let lng: number;
    let lat: number;
    try {
      const wgs = proj4('EPSG:5179', 'WGS84', [x, y]) as [number, number];
      lng = wgs[0];
      lat = wgs[1];
    } catch {
      continue;
    }
    if (lat < 33 || lat > 39 || lng < 124 || lng > 132) continue;

    const sido = parseSidoFromRow(row);
    farms.push({ livestockSeq, lat, lng, ...(sido ? { sido } : {}) });
  }

  const payload: NationalPigFarmsFile = {
    generatedAt: new Date().toISOString(),
    sourceFile: path.basename(xlsxPath),
    sheet: SHEET,
    crsNote:
      '좌표정보(X)(Y)를 EPSG:5179(Korea 2000 / Central Belt) 가정 후 WGS84로 변환. 편차 시 출처 좌표계 확인.',
    rowCount: farms.length,
    farms,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2), 'utf-8');
  console.log('저장:', OUT, '건수:', farms.length);
}

main();
