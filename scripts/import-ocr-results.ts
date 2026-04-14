/**
 * NAS OCR 파이프라인 results.xlsx → Neon DB import
 *
 * OCR 형식: 한 행에 여러 질병 컬럼 (PRRS_결과, PED_결과, PRRS_항체 등)
 * 전북대(vetdxlab) A열 전용: --format=single-column (자동 감지 가능)
 *
 * 사용법:
 *   npx tsx scripts/import-ocr-results.ts --file=scripts/results.xlsx
 *   npx tsx scripts/import-ocr-results.ts --file=ocr-pipeline/output/results.xlsx
 *   npx tsx scripts/import-ocr-results.ts --file=... --format=single-column  # 전북대 A열 형식
 *   npx tsx scripts/import-ocr-results.ts --file=... --replace  # 기존 레코드도 새 결과로 업데이트
 *
 * 진행 표시(기본 켜짐, 100행마다 stdout):
 *   --progress=50   # 50행마다 로그
 *   --no-progress   # 진행 로그 끔
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

/** 0이면 진행 로그 비활성화 */
function parseProgressEvery(args: string[]): number {
  if (args.includes('--no-progress')) return 0;
  const raw = args.find((a) => a.startsWith('--progress='));
  if (raw) {
    const n = parseInt(raw.split('=')[1] ?? '', 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 100;
}

function findColumn(headers: string[], names: string[]): number {
  const lower = headers.map((h) => String(h ?? '').toLowerCase().replace(/\s/g, ''));
  for (const n of names) {
    const idx = lower.findIndex((h) => h.includes(n.toLowerCase().replace(/\s/g, '')));
    if (idx >= 0) return idx;
  }
  return -1;
}

function normalizeDate(v: string): string {
  if (!v) return '';
  const m1 = String(v).match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (m1) return `${m1[1]}-${m1[2].padStart(2, '0')}-${m1[3].padStart(2, '0')}`;
  const m2 = String(v).match(/(\d{4})(\d{2})(\d{2})/);
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;
  return String(v).trim();
}

/** 셀에 '양성판정기준' 등이 섞이면 부분 문자열 '양성'으로 + 오인 → 기준 블록 앞만 사용 */
function stripSerumCriteriaNoiseForResult(raw: string): string {
  let s = String(raw ?? '').trim();
  if (!s) return s;
  if (/양성\s*판정\s*기준|양성판정기준|판정기준\s*S\/?P/i.test(s)) {
    const cut = s.split(/양성\s*판정\s*기준/i)[0]?.trim() ?? '';
    const cut2 = cut.split(/양성판정기준/i)[0]?.trim() ?? cut;
    s = cut2.split(/판정기준/i)[0]?.trim() ?? cut2;
  }
  return s.trim();
}

function toResult(v: string): string {
  const raw = stripSerumCriteriaNoiseForResult(String(v ?? '').trim());
  const s = raw.toUpperCase();
  if (s === '?' || raw === '의심' || s === 'EQUIVOCAL' || s === '±') return '?';
  if (s === '+' || s === '양성' || s === '검출') return '+';
  if (s === '-' || s === '음성' || s === '불검출') return '-';
  // 양성/음성이 아닌 "결과지 존재"형 (항생제 감수성 검사 등)
  if (s === 'V' || raw === '있음' || raw.includes('결과지') || raw.includes('보고서')) return 'V';
  // DB 스키마(result varchar(10)) 보호:
  // - 여기서 긴 문자열을 그대로 반환하면 import 시 "value too long" 에러가 난다.
  // - 숫자(S/P) 기반 판정은 PRRS ELISA 컬럼에서만 별도 처리한다.
  // - 그 외 미해독/잡문자는 안전하게 음성(-)으로 둔다. (원문은 judgement_fallback/details로 추적)
  if (!raw) return '-';
  if (/의심|EQUIVOCAL|±/i.test(raw)) return '?';
  if (/양성|검출|\+/.test(raw)) return '+';
  if (/음성|불검출|\-/.test(raw)) return '-';
  return '-';
}

/** PRRS ELISA S/P ratio 가정 범위. APP 흉막폐렴(S/P Value % 등)은 스케일이 넓어 이 함수로 import하지 않음 */
const PRRS_SP_RATIO_MIN = -1;
const PRRS_SP_RATIO_MAX = 10;

function isPlausiblePrrsSpRatio(n: number): boolean {
  return Number.isFinite(n) && n >= PRRS_SP_RATIO_MIN && n <= PRRS_SP_RATIO_MAX;
}

/** PRRS ELISA: S/P 숫자만 있는 셀(쉼표 구분) → + / ? / - */
function resultFromPrrsElisaCell(val: string): string | null {
  const t = String(val ?? '').trim();
  if (!t) return null;
  if (/양성|음성|의심|검출|불검출|^\?$/i.test(t) || /^[+-]$/.test(t.trim())) return null;
  // 도드람 등: "0.03 (-)", "-0.01 (-)" — 판정 괄호가 있으면 S/P 부호와 무관하게 우선
  const tailJudge = t.match(/(-?\d+\.?\d*)\s*[\(（]\s*([+?-])\s*[\)）]/);
  if (tailJudge) {
    const spNum = parseFloat(tailJudge[1]);
    if (isPlausiblePrrsSpRatio(spNum)) {
      const j = tailJudge[2];
      if (j === '+') return '+';
      if (j === '?' || j === '±') return '?';
      if (j === '-') return '-';
    }
  }
  const nums = t
    .split(/[,;\s]+/)
    .map((x) => parseFloat(x.replace(/[^\d.-]/g, '')))
    .filter((n) => Number.isFinite(n))
    .filter(isPlausiblePrrsSpRatio);
  if (nums.length === 0) return null;
  if (nums.some((n) => n >= 0.4)) return '+';
  if (nums.some((n) => n >= 0.3 && n < 0.4)) return '?';
  return '-';
}

function extractFarmCode(v: string): string {
  if (!v || String(v).length <= 20) return String(v ?? '').trim();
  const m = String(v).match(/DB\d{4}/i);
  if (m) return m[0].toUpperCase();
  return String(v).slice(0, 20);
}

function extractDriveId(input: string): string | null {
  if (!input) return null;
  const m = String(input).match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  const m2 = String(input).match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m2) return m2[1];
  if (/^[a-zA-Z0-9_-]{10,}$/.test(String(input)) && !/^test-\d/i.test(String(input))) return String(input);
  return null;
}

/** date(YYYY-MM-DD) + filename → NAS 상대경로 (2026-03/xxx.pdf) */
function buildNasRelativePath(date: string, filename: string): string | null {
  if (!date || !filename?.trim() || !/\.pdf$/i.test(filename)) return null;
  const m = String(date).match(/^(\d{4})[-./]?(\d{1,2})/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  return `${year}-${String(month).padStart(2, '0')}/${filename.trim()}`;
}

function aggregatePrrsElisa(nums: number[]): string {
  if (nums.some((n) => n >= 0.4)) return '+';
  if (nums.some((n) => n >= 0.3 && n < 0.4)) return '?';
  return '-';
}

/** PRRS 항체 구간 근처에서 S/P 형태 실수만 추출 (날짜 등 다른 숫자 배제) */
function extractPrrsElisaSpFromText(text: string): number[] {
  const idx = text.search(/PRRS\s*[Vv]?\s*항체|PRRS\s*Ab|PRRS\s*ELISA|S\s*\/\s*P/i);
  const slice = idx >= 0 ? text.slice(idx, idx + 1500) : text;
  const nums: number[] = [];
  const re = /(-?\d+\.\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(slice)) !== null) {
    const n = parseFloat(m[1]);
    if (Number.isFinite(n) && n >= -1 && n <= 10) nums.push(n);
  }
  return nums;
}

/** 전북대(vetdxlab) A열 전용: 한 셀 텍스트에서 date, farm, results 추출 */
interface ParsedSingleRow {
  date: string;
  farm: string;
  fileId: string | null;
  results: { disease: string; testType: string; result: string }[];
}

type ExistingRecord = { id: number; pdf_file_id: string | null };

function parseSingleColumnRow(text: string): ParsedSingleRow | null {
  if (!text || text.length < 10) return null;
  const t = text.replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim();

  const dateMatch =
    t.match(/접수일(?:자)?[:：]?\s*(\d{4})[-./년\s]?(\d{1,2})[-./월\s]?(\d{1,2})/) ||
    t.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/) ||
    t.match(/(\d{4})[-./]?(\d{1,2})[-./]?(\d{1,2})/) ||
    t.match(/(\d{8})/);
  const date = dateMatch
    ? dateMatch[2]
      ? `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${(dateMatch[3] || '01').padStart(2, '0')}`
      : `${dateMatch[1].slice(0, 4)}-${dateMatch[1].slice(4, 6)}-${dateMatch[1].slice(6, 8)}`
    : '';

  const farmCodeMatch = t.match(/D[BA]\d{4}/i) || t.match(/DB\d{4}/i);
  let farm = farmCodeMatch
    ? farmCodeMatch[0].replace(/^DA/i, 'DB').toUpperCase()
    : '';
  if (!farm) {
    const nameMatch =
      t.match(/농장정보[:：]?\s*([^\n,(]+)/) ||
      t.match(/농장명[:：]\s*([^\n,(]+)/) ||
      t.match(/의뢰기관[:：]\s*([^\n,(]+)/) ||
      t.match(/의뢰자[:：]\s*([^\n,(]+)/) ||
      t.match(/농장[:：]\s*([^\n,(]+)/) ||
      t.match(/검체명[:：]\s*([^\n,(]+)/);
    if (nameMatch) farm = nameMatch[1].trim().replace(/\s+/g, ' ');
  }

  const results: { disease: string; testType: string; result: string }[] = [];
  const patterns: { regex: RegExp; disease: string; testType: string }[] = [
    { regex: /PRRS\s*(?:Ag|항원|V?\s*)?PCR[:：]?\s*(양성|음성|검출|불검출|\+|\-)/gi, disease: 'PRRS', testType: 'PCR' },
    { regex: /PED(?:V)?\s*(?:PCR|항원)?[:：]?\s*(양성|음성|검출|불검출|\+|\-)/gi, disease: 'PED', testType: 'PCR' },
    { regex: /TGE[:：]?\s*(양성|음성|검출|불검출|\+|\-)/gi, disease: 'TGE', testType: 'PCR' },
    { regex: /PRRS\s*(?:Ab|항체|혈청)[:：]?\s*(양성|음성|검출|불검출|\+|\-)/gi, disease: 'PRRS', testType: 'ELISA' },
    { regex: /PCV2\s*항체[:：]?\s*(양성|음성|검출|불검출|\+|\-)/gi, disease: 'PCV2', testType: 'ELISA' },
    { regex: /APP\s*항체[:：]?\s*(양성|음성|검출|불검출|\+|\-)/gi, disease: 'APP', testType: 'ELISA' },
    // Clostridium novyi 등 세균성 항목(서후 2026-01-26 케이스 대응)
    { regex: /Clostridium\s*(?:novyi|noyvi)[^+\-?]*(양성|음성|검출|불검출|\+|\-)/gi, disease: '세균', testType: '세균배양' },
    { regex: /Myco|마이코|세균[:：]?\s*(양성|음성|검출|불검출|\+|\-)/gi, disease: '세균', testType: 'ELISA' },
    { regex: /SIV|인플루엔자[:：]?\s*(양성|음성|검출|불검출|\+|\-)/gi, disease: 'SIV', testType: 'PCR' },
    { regex: /(?:\bMH\b|Mycoplasma\s*hyopneumoniae|M\.?\s*hyopneumoniae)\s*(?:PCR|항원)?[:：]?\s*(양성|음성|검출|불검출|\+|\-)/gi, disease: 'MH', testType: 'PCR' },
    { regex: /(?:\bMHR\b|Mycoplasma\s*hyorhinis|M\.?\s*hyorhinis)\s*(?:PCR|항원)?[:：]?\s*(양성|음성|검출|불검출|\+|\-)/gi, disease: 'MHR', testType: 'PCR' },
    { regex: /(?:\bAPP\b|Actinobacillus\s*pleuropneumoniae|A\.?\s*pleuropneumoniae)\s*(?:PCR|항원)?[:：]?\s*(양성|음성|검출|불검출|\+|\-)/gi, disease: 'APP', testType: 'PCR' },
  ];
  for (const { regex, disease, testType } of patterns) {
    const m = t.match(regex);
    if (m) {
      const valMatch = m[0].match(/(양성|음성|검출|불검출|\+|\-)/i);
      const val = valMatch ? valMatch[1] : m[0].trim();
      results.push({ disease, testType, result: toResult(val) });
    }
  }

  // "분석결과/추출결과"는 문서마다 의미가 달라서(항체가 검사인데도 분석결과로 표기되는 케이스 존재)
  // 문서 전체 문맥을 보고 testType을 추론한다.
  const analysisResult = t.match(/(?:추출결과|분석결과)[:：]?\s*(양성|음성|검출|불검출|\+|\-)/i);
  if (analysisResult) {
    const val = analysisResult[1];
    const hasPrrs = /PRRS/i.test(t);
    if (hasPrrs) {
      const looksLikeAb = /항체|ELISA|S\s*\/\s*P/i.test(t);
      const looksLikePcr = /\bPCR\b|항원/i.test(t);
      const testType = looksLikeAb ? 'ELISA' : looksLikePcr ? 'PCR' : '유전자분석';
      results.push({ disease: 'PRRS', testType, result: toResult(val) });
    }
  }

  const prrsElisaNums = extractPrrsElisaSpFromText(t);
  const elisaIdx = results.findIndex((x) => x.disease === 'PRRS' && x.testType === 'ELISA');
  if (prrsElisaNums.length > 0) {
    const agg = aggregatePrrsElisa(prrsElisaNums);
    if (elisaIdx >= 0) results[elisaIdx] = { ...results[elisaIdx], result: agg };
    else results.push({ disease: 'PRRS', testType: 'ELISA', result: agg });
  }

  if (!date || !farm || results.length === 0) return null;
  let fileId: string | null = null;
  const fileMatch = t.match(/(\d{8}_[^\s]+\.pdf)/i) || t.match(/([\w\-\.]+\.pdf)/i);
  if (fileMatch) {
    const fn = fileMatch[1];
    fileId = buildNasRelativePath(date, fn);
  }
  return { date, farm, fileId, results };
}

/** A열 형식 감지: 데이터 row의 A열에 긴 텍스트가 있고 다른 컬럼은 비어 있음 */
function isLikelySingleColumnFormat(data: (string[] | Record<string, unknown>)[]): boolean {
  if (data.length < 2) return false;
  let rowsWithLongA = 0;
  for (let i = 1; i < Math.min(data.length, 6); i++) {
    const row = data[i];
    const arr = Array.isArray(row) ? (row as unknown[]) : Object.values(row as object);
    const aVal = String(arr[0] ?? '').trim();
    const restEmpty = arr.slice(1).every((v) => !String(v ?? '').trim());
    if (aVal.length > 60 && restEmpty) rowsWithLongA++;
  }
  return rowsWithLongA >= 2;
}

/** OCR 컬럼 → (disease, testType) 매핑 */
const DISEASE_COLUMNS: { col: string; disease: string; testType: string }[] = [
  { col: 'PRRS_결과', disease: 'PRRS', testType: 'PCR' },
  { col: 'PED_결과', disease: 'PED', testType: 'PCR' },
  { col: 'PEDV_결과', disease: 'PED', testType: 'PCR' },
  { col: 'TGE_결과', disease: 'TGE', testType: 'PCR' },
  { col: 'SIV_결과', disease: 'SIV', testType: 'PCR' },
  { col: 'MH_결과', disease: 'MH', testType: 'PCR' },
  { col: 'MHR_결과', disease: 'MHR', testType: 'PCR' },
  { col: 'APP_결과', disease: 'APP', testType: 'PCR' },
  { col: 'PRRS_항체', disease: 'PRRS', testType: 'ELISA' },
  { col: 'PCV2_항체', disease: 'PCV2', testType: 'ELISA' },
  { col: 'APP_항체', disease: 'APP', testType: 'ELISA' },
  { col: 'MH_항체', disease: 'MH', testType: 'ELISA' },
  { col: 'Myco_항체', disease: '세균', testType: 'ELISA' },
  { col: '항생제_감수성', disease: '항생제 감수성검사', testType: '항생제 감수성 검사' },
  { col: '추출결과', disease: 'PRRS', testType: '유전자분석' },
  { col: '분석결과', disease: 'PRRS', testType: '유전자분석' },
];

async function main() {
  const args = process.argv.slice(2);
  const fileArg = args.find((a) => a.startsWith('--file='));
  const dryRun = args.includes('--dry-run');
  const progressEvery = parseProgressEvery(args);
  const defaultPath = path.join(process.cwd(), 'scripts', 'results.xlsx');
  const xlsxPath = fileArg?.replace('--file=', '').trim() || defaultPath;

  if (!fs.existsSync(xlsxPath)) {
    console.error(`파일을 찾을 수 없습니다: ${xlsxPath}`);
    process.exit(1);
  }

  const wb = XLSX.readFile(xlsxPath);
  const sheetName = wb.SheetNames.includes('결과') ? '결과' : wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
  if (!data.length) {
    console.error('Excel에 데이터가 없습니다.');
    process.exit(1);
  }

  const useSingleColumn =
    args.includes('--format=single-column') || args.includes('--format=jbnu-a1');
  const replace = args.includes('--replace');
  const headers = (data[0] ?? []).map((h) => String(h ?? ''));
  const dateIdx = findColumn(headers, ['접수일자', 'date', '날짜']);
  const farmNameIdx = findColumn(headers, ['농장명', 'farm_name', 'farmName', '농장']);
  const fileIdIdx = findColumn(headers, ['PDF_파일ID', 'pdf_file_id', 'file_id', '파일ID', '파일명']);
  const judgementSourceIdx = findColumn(headers, ['판정_출처', 'judgement_source']);
  const judgementFallbackIdx = findColumn(headers, ['판정_미해독', 'judgement_fallback']);

  const diseaseColMap = new Map<string, { disease: string; testType: string }>();
  for (const { col, disease, testType } of DISEASE_COLUMNS) {
    const idx = findColumn(headers, [col]);
    if (idx >= 0) diseaseColMap.set(String(idx), { disease, testType });
  }

  const standardFormatOk = dateIdx >= 0 && farmNameIdx >= 0 && diseaseColMap.size > 0;
  const trySingleColumn =
    useSingleColumn || (!standardFormatOk && isLikelySingleColumnFormat(data));

  if (trySingleColumn) {
    const { sql } = await import('../lib/db');
    const { getFarmCode } = await import('../lib/mail-pipeline/farm-mapping');
    const { FARMS } = await import('../lib/farms');
    const PDF_BASE_PATH = process.env.PDF_BASE_PATH ?? process.env.SAVE_PATH ?? '';

    const findExistingByPdfAndTest = async (
      farmCode: string,
      disease: string,
      testType: string,
      pdfFileId: string | null
    ): Promise<ExistingRecord[]> => {
      if (!pdfFileId) return [];
      return (await sql`
        SELECT id, pdf_file_id
        FROM test_records
        WHERE pdf_file_id = ${pdfFileId}
          AND farm_code = ${farmCode}
          AND disease = ${disease}
          AND test_type = ${testType}
        LIMIT 1
      `) as ExistingRecord[];
    };

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    const seen = new Set<string>();

    if (useSingleColumn || !standardFormatOk) {
      console.log('전북대 A열 형식 감지. 단일 컬럼 파서 사용 (--format=single-column)');
    }

    const startRow = headers.some((h) => /접수|날짜|농장|date|farm/i.test(h)) ? 1 : 0;
    const totalRows = Math.max(0, data.length - startRow);
    const t0 = Date.now();
    if (progressEvery > 0 && totalRows > 0) {
      console.log(`DB 반영 시작 (단일컬럼) · ${totalRows}행 · ${progressEvery}행마다 진행 로그`);
    }
    for (let i = startRow; i < data.length; i++) {
      const row = data[i] ?? [];
      const cols = Array.isArray(row) ? row : [row];
      const a1 = String(cols[0] ?? '').trim();
      const preview = String(cols[5] ?? '').trim(); // OCR_미리보기
      const blob = [a1, preview].filter(Boolean).join(' ');
      if (!blob || blob.length < 20) continue;

      const parsed = parseSingleColumnRow(blob);
      if (!parsed) continue;

      let farm = parsed.farm;
      if (!/^DB\d{4}$/.test(farm)) {
        const resolved = getFarmCode(parsed.farm) as string;
        if (resolved && resolved in FARMS) farm = resolved;
        else continue;
      }

      for (const { disease, testType, result } of parsed.results) {
        const key = `${parsed.date}_${farm}_${disease}_${testType}`;
        if (seen.has(key)) {
          skipped++;
          continue;
        }
        seen.add(key);

        if (dryRun) {
          console.log(`  ${parsed.date} | ${farm} | ${disease} | ${testType} | ${result}`);
          inserted++;
          continue;
        }

        const existingByPdf = await findExistingByPdfAndTest(farm, disease, testType, parsed.fileId);
        if (existingByPdf.length > 0) {
          if (replace) {
            try {
              await sql`UPDATE test_records SET result = ${result}, pdf_file_id = COALESCE(${parsed.fileId}, pdf_file_id) WHERE id = ${(existingByPdf[0] as ExistingRecord).id}`;
              updated++;
            } catch (e) {
              console.warn(`행 ${i + 1} ${disease} 업데이트 오류:`, (e as Error).message);
              skipped++;
            }
          } else {
            skipped++;
          }
          continue;
        }

        const existing = await sql`
          SELECT id, pdf_file_id FROM test_records WHERE date = ${parsed.date} AND farm_code = ${farm} AND disease = ${disease} AND test_type = ${testType} LIMIT 1
        `;
        if (existing.length > 0) {
          if (replace) {
            try {
              await sql`UPDATE test_records SET result = ${result}, pdf_file_id = COALESCE(${parsed.fileId}, pdf_file_id) WHERE id = ${(existing[0] as { id: number }).id}`;
              updated++;
            } catch (e) {
              console.warn(`행 ${i + 1} ${disease} 업데이트 오류:`, (e as Error).message);
              skipped++;
            }
          } else if (
            parsed.fileId &&
            (!(existing[0] as { pdf_file_id: string }).pdf_file_id ||
              (existing[0] as { pdf_file_id: string }).pdf_file_id.trim() === '')
          ) {
            try {
              await sql`UPDATE test_records SET pdf_file_id = ${parsed.fileId} WHERE id = ${(existing[0] as { id: number }).id}`;
              updated++;
            } catch {
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
            VALUES (${parsed.date}, ${farm}, ${disease}, ${testType}, ${result}, ${parsed.fileId}, null, null)
          `;
          inserted++;
        } catch (e) {
          console.warn(`행 ${i + 1} ${disease} 오류:`, (e as Error).message);
          skipped++;
        }
      }
      const done = i - startRow + 1;
      if (progressEvery > 0 && totalRows > 0 && (done % progressEvery === 0 || done === totalRows)) {
        const pct = ((done / totalRows) * 100).toFixed(1);
        const sec = ((Date.now() - t0) / 1000).toFixed(1);
        console.log(
          `  진행 ${done}/${totalRows}행 (${pct}%) · 삽입 ${inserted} · 갱신 ${updated} · 스킵 ${skipped} · 경과 ${sec}s`
        );
      }
    }
    if (typeof sql.end === 'function') await sql.end();
    const totalSec = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`완료: ${inserted}건 삽입, ${updated}건 업데이트, ${skipped}건 스킵 · 총 ${totalSec}s`);
    return;
  }

  if (dateIdx < 0 || farmNameIdx < 0) {
    console.error('필수 컬럼 누락 (날짜, 농장명). 헤더:', headers);
    console.error('전북대 A열 형식이면: npx tsx scripts/import-ocr-results.ts --file=... --format=single-column');
    process.exit(1);
  }

  if (diseaseColMap.size === 0) {
    console.error('질병 결과 컬럼 없음 (PRRS_결과, PED_결과 등). 헤더:', headers);
    console.error('전북대 A열 형식이면: npx tsx scripts/import-ocr-results.ts --file=... --format=single-column');
    process.exit(1);
  }

  if (dryRun) console.log('[--dry-run] 삽입 없이 미리보기');

  const { sql } = await import('../lib/db');
  const { getFarmCode } = await import('../lib/mail-pipeline/farm-mapping');
  const { FARMS } = await import('../lib/farms');
  const PDF_BASE_PATH = process.env.PDF_BASE_PATH ?? process.env.SAVE_PATH ?? '';

  const findExistingByPdfAndTest = async (
    farmCode: string,
    disease: string,
    testType: string,
    pdfFileId: string | null
  ): Promise<ExistingRecord[]> => {
    if (!pdfFileId) return [];
    return (await sql`
      SELECT id, pdf_file_id
      FROM test_records
      WHERE pdf_file_id = ${pdfFileId}
        AND farm_code = ${farmCode}
        AND disease = ${disease}
        AND test_type = ${testType}
      LIMIT 1
    `) as ExistingRecord[];
  };

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const seen = new Set<string>();

  const totalRows = Math.max(0, data.length - 1);
  const t0 = Date.now();
  if (progressEvery > 0 && totalRows > 0) {
    console.log(`DB 반영 시작 · ${totalRows}행 · ${progressEvery}행마다 진행 로그 (--no-progress 로 끔)`);
  }

  for (let i = 1; i < data.length; i++) {
    const row = data[i] ?? [];
    const cols = Array.isArray(row) ? row : [row];
    const get = (idx: number) => (idx >= 0 ? String(cols[idx] ?? '').trim() : '');

    const date = normalizeDate(get(dateIdx));
    const farmNameRaw = get(farmNameIdx);
    let farm = extractFarmCode(farmNameRaw);
    if (!farm || farm.length > 20 || !(farm in FARMS)) {
      const resolved = getFarmCode(farmNameRaw) as string;
      if (resolved && resolved.length <= 20 && resolved in FARMS) farm = resolved;
    }
    const rawFileVal = fileIdIdx >= 0 ? get(fileIdIdx) : '';
    let fileId: string | null = extractDriveId(rawFileVal);
    if (!fileId && PDF_BASE_PATH && rawFileVal && /\.pdf$/i.test(rawFileVal)) {
      fileId = buildNasRelativePath(date, rawFileVal);
    }
    const judgementSource = judgementSourceIdx >= 0 ? get(judgementSourceIdx) : '';
    const judgementFallback = judgementFallbackIdx >= 0 ? get(judgementFallbackIdx) : '';
    const details =
      judgementFallback === '1' || judgementSource === 'S/P'
        ? 'ELISA_JUDGEMENT_FALLBACK'
        : null;

    const filenameDate = (() => {
      // excel의 파일명(또는 PDF_파일ID)에 포함된 YYYYMMDD가 “이전 파서 date(파일명 기준)” 역할을 할 수 있음
      const m = String(rawFileVal ?? '').match(/^(\d{8})/);
      return m ? normalizeDate(m[1]) : '';
    })();

    if (!date || !farm || farm.length > 20) {
      skipped++;
      continue;
    }

    // replace 재처리 시: 날짜를 "접수일자"로 통일하면서,
    // 과거에 "파일명 날짜"로 들어간 stale 레코드(특히 pdf_file_id null)가 남아 매트릭스에 계속 표시될 수 있음.
    // 이 경우, 해당 파일명 날짜(filenamedate)의 null-link 레코드를 먼저 제거한다.
    if (replace && filenameDate && filenameDate !== date) {
      try {
        await sql`
          DELETE FROM test_records
          WHERE date = ${filenameDate}
            AND farm_code = ${farm}
            AND pdf_file_id IS NULL
            AND (
              (disease IN ('PRRS','APP','MH') AND test_type = 'ELISA')
              OR (disease = 'PRRS' AND test_type = 'PCR')
              OR (disease = 'PED' AND test_type = 'PCR')
              OR (disease = 'SIV' AND test_type = 'PCR')
            )
        `;
      } catch {
        // ignore cleanup failure
      }
    }

    for (const [colIdx, { disease, testType }] of diseaseColMap) {
      const val = get(parseInt(colIdx, 10));
      if (!val) continue;
      const fromSp = disease === 'PRRS' && testType === 'ELISA' ? resultFromPrrsElisaCell(val) : null;
      const result = fromSp ?? toResult(val);

      const key = `${date}_${farm}_${disease}_${testType}`;
      if (seen.has(key)) {
        skipped++;
        continue;
      }
      seen.add(key);

      if (dryRun) {
        console.log(`  ${date} | ${farm} | ${disease} | ${testType} | ${result}`);
        inserted++;
        continue;
      }

      const existingByPdf = await findExistingByPdfAndTest(farm, disease, testType, fileId);
      if (existingByPdf.length > 0) {
        if (replace) {
          try {
            await sql`UPDATE test_records SET result = ${result}, pdf_file_id = COALESCE(${fileId}, pdf_file_id), details = COALESCE(${details}, details) WHERE id = ${(existingByPdf[0] as ExistingRecord).id}`;
            updated++;
          } catch (e) {
            console.warn(`행 ${i + 1} ${disease} 업데이트 오류:`, (e as Error).message);
            skipped++;
          }
        } else {
          skipped++;
        }
        continue;
      }

      const existing = await sql`
        SELECT id, pdf_file_id FROM test_records WHERE date = ${date} AND farm_code = ${farm} AND disease = ${disease} AND test_type = ${testType} LIMIT 1
      `;
      if (existing.length > 0) {
        if (replace) {
          try {
            await sql`UPDATE test_records SET result = ${result}, pdf_file_id = COALESCE(${fileId}, pdf_file_id), details = COALESCE(${details}, details) WHERE id = ${(existing[0] as { id: number }).id}`;
            updated++;
          } catch (e) {
            console.warn(`행 ${i + 1} ${disease} 업데이트 오류:`, (e as Error).message);
            skipped++;
          }
        } else if (fileId && (!(existing[0] as { pdf_file_id: string }).pdf_file_id || (existing[0] as { pdf_file_id: string }).pdf_file_id.trim() === '')) {
          try {
            await sql`UPDATE test_records SET pdf_file_id = ${fileId} WHERE id = ${(existing[0] as { id: number }).id}`;
            updated++;
          } catch {
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
          VALUES (${date}, ${farm}, ${disease}, ${testType}, ${result}, ${fileId}, null, ${details})
        `;
        inserted++;
      } catch (e) {
        console.warn(`행 ${i + 1} ${disease} 오류:`, (e as Error).message);
        skipped++;
      }
    }

    const done = i;
    if (progressEvery > 0 && totalRows > 0 && (done % progressEvery === 0 || done === totalRows)) {
      const pct = ((done / totalRows) * 100).toFixed(1);
      const sec = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(
        `  진행 ${done}/${totalRows}행 (${pct}%) · 삽입 ${inserted} · 갱신 ${updated} · 스킵 ${skipped} · 경과 ${sec}s`
      );
    }
  }

  if (typeof sql.end === 'function') await sql.end();
  const totalSec = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`완료: ${inserted}건 삽입, ${updated}건 업데이트, ${skipped}건 스킵 · 총 ${totalSec}s`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
