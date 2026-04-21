/**
 * 농장주소록 xlsx → public/data/farm-locations.json
 * 기본: `농장주소록_좌표추가.xlsx` 시트 `농장주소록(250401)` 의 위도(LAT)·경도(LON) 열(__EMPTY_11/12) 사용
 * 좌표가 비어 있거나 한국 범위 밖이면 Nominatim 지오코딩(행당 ~1.1초)
 * npx tsx scripts/build-farm-locations-from-xlsx.ts --file=농장주소록-규모(250401 기준).xlsx
 * npx tsx scripts/build-farm-locations-from-xlsx.ts --skip-geocode
 */
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { getFarmCode } from '../lib/mail-pipeline/farm-mapping';
import type { FarmLocationRecord, FarmLocationsFile } from '../lib/farm-location-types';

const SHEET = '농장주소록(250401)';
/** 좌표 열(위도 LAT / 경도 LON) 포함본 — `농장주소록-규모(250401 기준).xlsx` 는 `--file=` 로 지정 */
const DEFAULT_XLSX = '농장주소록_좌표추가.xlsx';
const OUT = path.join(process.cwd(), 'public', 'data', 'farm-locations.json');
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const UA = 'disease-dashboard-farm-geocode/1.0 (internal; +https://localhost)';

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function normalizeCode(raw: unknown): string {
  if (raw === null || raw === undefined || raw === '') return '';
  const s = String(raw).trim();
  if (!s) return '';
  /** 위탁·육성 등 부코드는 지도상 별도 마커로 유지 (getFarmCode 병합 방지) */
  if (/^DB\d+-\d+$/i.test(s)) return s.replace(/^db/i, 'DB');
  if (/^DB\d+/i.test(s)) return getFarmCode(s) as string;
  const n = Number(s);
  if (!Number.isNaN(n) && n >= 1000 && n < 10000) return `DB${n}`;
  if (/^\d{4}-\d+$/i.test(s)) return getFarmCode(`DB${s}`) as string;
  return getFarmCode(s) as string;
}

function isHeaderRow(row: Record<string, unknown>): boolean {
  const c = String(row.__EMPTY_1 ?? '').trim();
  const n = String(row.__EMPTY ?? '').trim();
  return c === '코드번호' || n === '본장';
}

type RawRow = Record<string, unknown>;

function toCoord(v: unknown): number | null {
  if (v === '' || v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** `농장주소록_좌표추가.xlsx` 등: __EMPTY_11=위도(LAT), __EMPTY_12=경도(LON). 구형 파일은 비어 있음. */
function parseRowsFrom250401(sheet: XLSX.WorkSheet): FarmLocationRecord[] {
  const rows = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: '' });
  const out: FarmLocationRecord[] = [];

  for (const row of rows) {
    if (isHeaderRow(row)) continue;
    const name = String(row.__EMPTY ?? '').trim();
    const codeRaw = row.__EMPTY_1;
    const vet = String(row.__EMPTY_2 ?? '').trim();
    const address = String(row.__EMPTY_3 ?? '').trim();
    const subName = String(row.__EMPTY_7 ?? '').trim();
    const subCodeRaw = row.__EMPTY_8;
    const subAddress = String(row.__EMPTY_9 ?? '').trim();
    const rowLat = toCoord(row.__EMPTY_11);
    const rowLng = toCoord(row.__EMPTY_12);

    const farm_code = normalizeCode(codeRaw);
    const sheetWgs =
      rowLat != null &&
      rowLng != null &&
      rowLat >= 33 &&
      rowLat <= 39 &&
      rowLng >= 124 &&
      rowLng <= 133
        ? { lat: rowLat, lng: rowLng }
        : { lat: null as number | null, lng: null as number | null };

    if (farm_code && address) {
      out.push({
        farm_code,
        name: name || farm_code,
        vet,
        address,
        lat: sheetWgs.lat,
        lng: sheetWgs.lng,
      });
    }

    const subCode = normalizeCode(subCodeRaw);
    if (subCode && subAddress) {
      out.push({
        farm_code: subCode,
        name: subName || subCode,
        vet,
        address: subAddress,
        lat: sheetWgs.lat,
        lng: sheetWgs.lng,
      });
    }
  }

  const seen = new Set<string>();
  const dedup: FarmLocationRecord[] = [];
  for (const r of out) {
    const k = `${r.farm_code}|${r.address}`;
    if (seen.has(k)) continue;
    seen.add(k);
    dedup.push(r);
  }
  const seenGeo = new Set<string>();
  const dedupGeo: FarmLocationRecord[] = [];
  for (const r of dedup) {
    if (r.lat == null || r.lng == null) {
      dedupGeo.push(r);
      continue;
    }
    const gk = `${r.farm_code}|${r.lat}|${r.lng}`;
    if (seenGeo.has(gk)) continue;
    seenGeo.add(gk);
    dedupGeo.push(r);
  }
  return dedupGeo;
}

function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Nominatim 실패·--skip-geocode 시 시도 대표점 주변으로 분산 (시각적 뭉침 완화, 여전히 approximate) */
export function fallbackLatLng(address: string, farm_code: string): { lat: number; lng: number } {
  const a = address.trim();
  const rules: Array<{ re: RegExp; lat: number; lng: number }> = [
    { re: /^경기/, lat: 37.35, lng: 127.38 },
    { re: /^서울/, lat: 37.57, lng: 126.98 },
    { re: /^인천/, lat: 37.45, lng: 126.7 },
    { re: /^충북|^충청북도/, lat: 36.8, lng: 127.7 },
    { re: /^충남|^충청남도/, lat: 36.6, lng: 126.65 },
    { re: /^대전/, lat: 36.35, lng: 127.38 },
    { re: /^세종/, lat: 36.48, lng: 127.29 },
    { re: /^경북|^경상북도/, lat: 36.12, lng: 128.35 },
    { re: /^경남|^경상남도/, lat: 35.45, lng: 128.25 },
    { re: /^전북|^전라북도|^전북특별자치도/, lat: 35.8, lng: 127.1 },
    { re: /^전남|^전라남도/, lat: 34.95, lng: 126.95 },
    { re: /^강원|^강원특별자치도/, lat: 37.75, lng: 128.85 },
    { re: /^제주/, lat: 33.5, lng: 126.53 },
  ];
  let base = { lat: 36.5, lng: 127.9 };
  for (const r of rules) {
    if (r.re.test(a)) {
      base = { lat: r.lat, lng: r.lng };
      break;
    }
  }
  const h = hashSeed(farm_code + '|' + a);
  const h2 = hashSeed(a + '|' + farm_code);
  const angle = ((h % 10000) / 10000) * 2 * Math.PI;
  const radiusDeg = 0.02 + ((h2 % 1000) / 1000) * 0.22;
  return {
    lat: base.lat + radiusDeg * Math.cos(angle),
    lng: base.lng + radiusDeg * Math.sin(angle),
  };
}

async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  const q = `${address}, 대한민국`;
  const url = `${NOMINATIM}?${new URLSearchParams({
    q,
    format: 'json',
    limit: '1',
    'accept-language': 'ko',
  })}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': UA },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as Array<{ lat: string; lon: string }>;
  if (!data?.length) return null;
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
}

async function main() {
  const skipGeocode = process.argv.includes('--skip-geocode');
  const arg = process.argv.find((a) => a.startsWith('--file='));
  const xlsxPath = path.resolve(process.cwd(), arg ? arg.slice('--file='.length) : DEFAULT_XLSX);

  if (!fs.existsSync(xlsxPath)) {
    console.error('파일 없음:', xlsxPath);
    process.exit(1);
  }

  const wb = XLSX.readFile(xlsxPath);
  if (!wb.SheetNames.includes(SHEET)) {
    console.error('시트 없음:', SHEET, '가능:', wb.SheetNames.join(', '));
    process.exit(1);
  }
  const sheet = wb.Sheets[SHEET];
  let farms = parseRowsFrom250401(sheet);
  console.log('농장 행:', farms.length);

  if (!skipGeocode) {
    for (let i = 0; i < farms.length; i++) {
      const f = farms[i];
      if (f.lat != null && f.lng != null) continue;
      process.stdout.write(`\r지오코딩 ${i + 1}/${farms.length} ${f.farm_code}…`);
      try {
        const pos = await geocode(f.address);
        if (pos) {
          f.lat = pos.lat;
          f.lng = pos.lng;
        } else {
          f.geocodeError = 'not_found';
        }
      } catch {
        f.geocodeError = 'request_failed';
      }
      await sleep(1100);
    }
    console.log('\n완료');
  }

  for (const f of farms) {
    if (f.lat == null || f.lng == null) {
      const pos = fallbackLatLng(f.address, f.farm_code);
      f.lat = pos.lat;
      f.lng = pos.lng;
      f.approximate = true;
    }
  }

  const payload: FarmLocationsFile = {
    generatedAt: new Date().toISOString(),
    sourceFile: path.basename(xlsxPath),
    sheet: SHEET,
    farms,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2), 'utf-8');
  console.log('저장:', OUT);
  const ok = farms.filter((f) => f.lat != null && f.lng != null).length;
  console.log(`좌표 성공: ${ok}/${farms.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
