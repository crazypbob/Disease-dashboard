/**
 * ocr-pipeline/output/results.xlsx → antibody_titers upsert
 * + 그룹 요약(+/?/-)을 test_records(ELISA)로 upsert (매트릭스 표기용)
 *
 * 사용:
 *   npx tsx scripts/import-titers-from-results.ts --file=ocr-pipeline/output/results.xlsx
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

function normalizeDate(v: string): string {
  if (!v) return '';
  const m1 = String(v).match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (m1) return `${m1[1]}-${m1[2].padStart(2, '0')}-${m1[3].padStart(2, '0')}`;
  const m2 = String(v).match(/(\d{4})(\d{2})(\d{2})/);
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;
  return String(v).trim();
}

function buildNasRelativePath(date: string, filename: string): string | null {
  if (!date || !filename?.trim() || !/\.pdf$/i.test(filename)) return null;
  const m = String(date).match(/^(\d{4})[-./]?(\d{1,2})/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  return `${year}-${String(month).padStart(2, '0')}/${filename.trim()}`;
}

function normalizeFarmCode(raw: string): string {
  const s = String(raw ?? '').trim();
  const ms = s.match(/\d{4}/g);
  return ms && ms.length > 0 ? ms[ms.length - 1]! : '';
}

function findColumn(headers: string[], names: string[]): number {
  const lower = headers.map((h) => String(h ?? '').toLowerCase().replace(/\s/g, ''));
  for (const n of names) {
    const idx = lower.findIndex((h) => h === n.toLowerCase().replace(/\s/g, '') || h.includes(n.toLowerCase().replace(/\s/g, '')));
    if (idx >= 0) return idx;
  }
  return -1;
}

type Row = {
  farm_code: string;
  test_date: string;
  disease: string;
  animal_no: number;
  sp_value: number | null;
  age_days: number | null;
  age_range: string | null;
  source_file: string | null;
  pdf_file_id: string | null;
  needs_review: boolean;
};

function normalizeDiseaseTarget(raw: string): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const up = s.toUpperCase();
  if (up.includes('PRRS')) return 'PRRS';
  if (up === 'MH' || up.includes('MYCO') || up.includes('MYCOPLASMA') || up.includes('HYOPNEUMONIAE')) return 'MH';
  if (up.includes('APP')) return 'APP';
  if (up.includes('SIV') || up.includes('INFLUENZA')) return 'SIV';
  if (up.includes('FMD') || up.includes('구제역')) return 'FMD';
  if (up.includes('LAWSONIA') || up.includes('회장염')) return 'Lawsonia';
  return null;
}

function parseNumberList(raw: string): number[] {
  const s = String(raw ?? '').trim();
  if (!s) return [];
  return s
    .split(/[,;\s]+/)
    .map((t) => parseFloat(String(t).replace(/[^\d.-]/g, '')))
    .filter((n) => Number.isFinite(n));
}

function classify(disease: string, v: number): 'positive' | 'suspect' | 'negative' {
  const d = (disease ?? '').toUpperCase();
  // PRRS/MH: 0.4+ 양성, 0.3~0.4 의양성, 0.3 미만 음성 (0.25 기준 삭제)
  if (d === 'PRRS' || d === 'MH') {
    if (v >= 0.4) return 'positive';
    if (v >= 0.3) return 'suspect';
    return 'negative';
  }
  if (d === 'APP') {
    if (v >= 50) return 'positive';
    if (v >= 40) return 'suspect';
    return 'negative';
  }
  if (d === 'SIV') {
    // <=0.6 positive, otherwise negative
    if (v <= 0.6) return 'positive';
    return 'negative';
  }
  return 'negative';
}

function summarizeGroup(disease: string, values: number[]): '+' | '?' | '-' {
  let hasPos = false;
  let hasSus = false;
  for (const v of values) {
    const c = classify(disease, v);
    if (c === 'positive') hasPos = true;
    else if (c === 'suspect') hasSus = true;
  }
  if (hasPos) return '+';
  if (hasSus) return '?';
  return '-';
}

async function main() {
  const args = process.argv.slice(2);
  const fileArg = args.find((a) => a.startsWith('--file='));
  const skipSummary = args.includes('--skip-summary');
  const defaultPath = path.join(process.cwd(), 'ocr-pipeline', 'output', 'results.xlsx');
  const xlsxPath = fileArg?.replace('--file=', '').trim() || defaultPath;

  if (!fs.existsSync(xlsxPath)) {
    console.error(`파일을 찾을 수 없습니다: ${xlsxPath}`);
    process.exit(1);
  }

  const wb = XLSX.readFile(xlsxPath);
  const rows: Row[] = [];

  if (wb.SheetNames.includes('항체가')) {
    // 포맷 A: sheet '항체가' (롱 테이블)
    const sheet = wb.Sheets['항체가'];
    const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
    if (!data.length) {
      console.error(`시트 '항체가'에 데이터가 없습니다.`);
      process.exit(1);
    }

    const headers = (data[0] ?? []).map((h) => String(h ?? ''));
    const idxFarm = findColumn(headers, ['farm_code', 'farm', '농장코드', 'farm_id']);
    const idxDate = findColumn(headers, ['test_date', '날짜', '접수일자', 'date']);
    const idxDis = findColumn(headers, ['disease', '질병']);
    const idxNo = findColumn(headers, ['animal_no', 'sample_index', '순번', '번호']);
    const idxSp = findColumn(headers, ['sp_value', 's/p', 'sp', 's/p값']);
    const idxAge = findColumn(headers, ['age_days', '일령']);
    const idxRange = findColumn(headers, ['age_range', '구간']);
    const idxSrc = findColumn(headers, ['source_file', '파일명']);
    const idxPdf = findColumn(headers, ['pdf_file_id', 'PDF_파일ID', 'pdf']);
    const idxNeeds = findColumn(headers, ['needs_review', '미입력', 'pending']);

    if (idxFarm < 0 || idxDate < 0 || idxDis < 0 || idxNo < 0 || idxSp < 0) {
      console.error('필수 컬럼 누락. 헤더:', headers);
      process.exit(1);
    }

    for (let i = 1; i < data.length; i++) {
      const r = data[i] ?? [];
      const get = (idx: number) => (idx >= 0 ? String(r[idx] ?? '').trim() : '');

      const farm_code = normalizeFarmCode(get(idxFarm));
      const test_date = normalizeDate(get(idxDate));
      const disease = get(idxDis).toUpperCase();
      const animal_no = parseInt(get(idxNo), 10);
      const sp_value = (() => {
        const t = get(idxSp);
        const n = parseFloat(t);
        return Number.isFinite(n) ? n : null;
      })();
      const age_days =
        idxAge >= 0
          ? (() => {
              const n = parseInt(get(idxAge), 10);
              return Number.isFinite(n) ? n : null;
            })()
          : null;
      const age_range = idxRange >= 0 ? get(idxRange) || null : null;
      const source_file = idxSrc >= 0 ? get(idxSrc) || null : null;
      const pdfRaw = idxPdf >= 0 ? get(idxPdf) : '';
      const pdf_file_id =
        pdfRaw && !pdfRaw.includes('/') && /\.pdf$/i.test(pdfRaw) ? buildNasRelativePath(test_date, pdfRaw) : (pdfRaw || null);
      const needs_review =
        idxNeeds >= 0 ? get(idxNeeds).toLowerCase() === 'true' || get(idxNeeds) === '1' : age_days == null && !age_range;

      if (!farm_code || !test_date || !disease || !Number.isFinite(animal_no) || animal_no <= 0) continue;
      rows.push({ farm_code, test_date, disease, animal_no, sp_value, age_days, age_range, source_file, pdf_file_id, needs_review });
    }
  } else {
    // 포맷 B: sheet '결과'에 S/P_VALUES + S/P_TARGETS가 들어있는 경우
    const sheetName = wb.SheetNames.includes('결과') ? '결과' : wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
    if (!data.length) {
      console.error(`시트 '${sheetName}'에 데이터가 없습니다.`);
      process.exit(1);
    }

    const headers = (data[0] ?? []).map((h) => String(h ?? ''));
    const idxFarm = findColumn(headers, ['farm_code', 'farm', '농장코드', 'farm_id', '농장명']);
    const idxDate = findColumn(headers, ['test_date', '날짜', '접수일자', 'date']);
    const idxSrc = findColumn(headers, ['source_file', '파일명']);
    const idxPdf = findColumn(headers, ['pdf_file_id', 'PDF_파일ID', 'pdf']);
    const idxVals = findColumn(headers, ['S/P_VALUES', 'SP_VALUES', 'sp_values', 'S/P값들']);
    const idxTargets = findColumn(headers, ['S/P_TARGETS', 'SP_TARGETS', 'targets', '대상']);
    const idxPrrsSp = findColumn(headers, ['PRRS_S/P', 'PRRS_SP', 'PRRS S/P', 'PRRS S-P']);

    // (현재 운영) S/P_VALUES/S/P_TARGETS가 비어 있는 경우가 많아 PRRS_S/P 폴백을 허용한다.
    const canUseGeneric = idxVals >= 0 && idxTargets >= 0;
    const canUsePrrsOnly = idxPrrsSp >= 0;
    if (idxFarm < 0 || idxDate < 0 || (!canUseGeneric && !canUsePrrsOnly)) {
      console.error(
        `시트 '${sheetName}'에서 항체가를 추출할 수 없습니다. 필요 컬럼: (농장/날짜 + (S/P_VALUES+S/P_TARGETS) 또는 PRRS_S/P). 헤더:`,
        headers
      );
      process.exit(1);
    }

    for (let i = 1; i < data.length; i++) {
      const r = data[i] ?? [];
      const get = (idx: number) => (idx >= 0 ? String(r[idx] ?? '').trim() : '');

      const farm_code = normalizeFarmCode(get(idxFarm));
      const test_date = normalizeDate(get(idxDate));
      const source_file = idxSrc >= 0 ? get(idxSrc) || null : null;
      const pdfRaw = idxPdf >= 0 ? get(idxPdf) : '';
      const pdf_file_id =
        pdfRaw && !pdfRaw.includes('/') && /\.pdf$/i.test(pdfRaw) ? buildNasRelativePath(test_date, pdfRaw) : (pdfRaw || null);
      if (!farm_code || !test_date) continue;

      // 1) 일반(멀티질병) 포맷: 값+타겟이 모두 채워진 경우
      if (canUseGeneric) {
        const values = parseNumberList(get(idxVals));
        const targets = get(idxTargets)
          .split(/[,;\s]+/)
          .map(normalizeDiseaseTarget)
          .filter(Boolean) as string[];

        if (values.length > 0 && targets.length > 0) {
          const n = Math.min(targets.length, values.length);
          for (let j = 0; j < n; j++) {
            rows.push({
              farm_code,
              test_date,
              disease: targets[j]!,
              animal_no: j + 1,
              sp_value: values[j]!,
              age_days: null,
              age_range: null,
              source_file,
              pdf_file_id,
              needs_review: true,
            });
          }
          continue;
        }
      }

      // 2) PRRS 전용 폴백: PRRS_S/P에만 샘플 값이 들어있는 경우
      if (canUsePrrsOnly) {
        const prrsValues = parseNumberList(get(idxPrrsSp));
        if (prrsValues.length === 0) continue;
        for (let j = 0; j < prrsValues.length; j++) {
          rows.push({
            farm_code,
            test_date,
            disease: 'PRRS',
            animal_no: j + 1,
            sp_value: prrsValues[j]!,
            age_days: null,
            age_range: null,
            source_file,
            pdf_file_id,
            needs_review: true,
          });
        }
      }
    }
  }

  // 동일 키(farm_code, test_date, disease, animal_no)가 한 파일 내/재처리로 중복될 수 있어 dedupe한다.
  // (ON CONFLICT upsert를 한 쿼리에서 여러 번 때리면 Postgres가 에러를 낸다)
  if (rows.length > 0) {
    const m = new Map<string, Row>();
    for (const r of rows) {
      const k = `${r.farm_code}|${r.test_date}|${r.disease}|${r.animal_no}`;
      m.set(k, r);
    }
    const deduped = Array.from(m.values());
    if (deduped.length !== rows.length) {
      // eslint-disable-next-line no-console
      console.log(`dedupe: ${rows.length} → ${deduped.length}`);
    }
    rows.splice(0, rows.length, ...deduped);
  }

  if (rows.length === 0) {
    console.log('적재할 항체가 행이 없습니다.');
    return;
  }

  const { sql } = await import('../lib/db');

  // 행 단위 INSERT는 너무 느려져서 chunk upsert로 처리한다.
  const CHUNK = 200;
  let upserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const farm_codes = chunk.map((r) => r.farm_code);
    const test_dates = chunk.map((r) => r.test_date);
    const diseases = chunk.map((r) => r.disease);
    const animal_nos = chunk.map((r) => r.animal_no);
    const sp_values = chunk.map((r) => r.sp_value);
    const source_files = chunk.map((r) => r.source_file);
    const pdf_file_ids = chunk.map((r) => r.pdf_file_id);
    const needs_reviews = chunk.map((r) => r.needs_review);

    await sql`
      INSERT INTO antibody_titers
        (farm_code, test_date, disease, animal_no, sp_value, source_file, pdf_file_id, needs_review)
      SELECT *
      FROM UNNEST(
        ${farm_codes}::text[],
        ${test_dates}::date[],
        ${diseases}::text[],
        ${animal_nos}::int[],
        ${sp_values}::real[],
        ${source_files}::text[],
        ${pdf_file_ids}::text[],
        ${needs_reviews}::boolean[]
      )
      ON CONFLICT (farm_code, test_date, disease, animal_no)
      DO UPDATE SET
        sp_value     = EXCLUDED.sp_value,
        source_file  = EXCLUDED.source_file,
        pdf_file_id  = EXCLUDED.pdf_file_id,
        needs_review = EXCLUDED.needs_review
    `;
    upserted += chunk.length;
    if (i === 0 || (i + CHUNK) % (CHUNK * 10) === 0) {
      // eslint-disable-next-line no-console
      console.log(`... upsert ${Math.min(i + CHUNK, rows.length)}/${rows.length}`);
    }
  }

  if (skipSummary) {
    if (typeof sql.end === 'function') await sql.end();
    console.log(`완료: antibody_titers upsert ${upserted}행 (요약 스킵)`);
    return;
  }

  // 그룹 요약(+/?/-) → test_records upsert (test_type='ELISA')
  const groupMap = new Map<string, { farm_code: string; test_date: string; disease: string; values: number[] }>();
  for (const r of rows) {
    if (r.sp_value == null) continue;
    const k = `${r.farm_code}|${r.test_date}|${r.disease}`;
    const g = groupMap.get(k) ?? { farm_code: r.farm_code, test_date: r.test_date, disease: r.disease, values: [] };
    g.values.push(r.sp_value);
    groupMap.set(k, g);
  }

  let summaryUpserts = 0;
  for (const g of groupMap.values()) {
    const result = summarizeGroup(g.disease, g.values);
    const existing = await sql`
      SELECT id FROM test_records
      WHERE date = ${g.test_date}::date
        AND farm_code = ${g.farm_code}
        AND disease = ${g.disease}
        AND test_type = 'ELISA'
      LIMIT 1
    `;
    if (existing.length > 0) {
      await sql`UPDATE test_records SET result = ${result}, details = 'TITER_SUMMARY' WHERE id = ${(existing[0] as { id: number }).id}`;
    } else {
      await sql`
        INSERT INTO test_records (date, farm_code, disease, test_type, result, pdf_file_id, method, details)
        VALUES (${g.test_date}::date, ${g.farm_code}, ${g.disease}, 'ELISA', ${result}, NULL, NULL, 'TITER_SUMMARY')
      `;
    }
    summaryUpserts++;
  }

  if (typeof sql.end === 'function') await sql.end();
  console.log(`완료: antibody_titers upsert ${upserted}행, test_records(ELISA) 요약 upsert ${summaryUpserts}그룹`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

