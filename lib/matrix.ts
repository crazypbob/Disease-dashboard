import type { FarmCode } from '@/lib/farms';
import { FARMS, FARM_GROUPS } from '@/lib/farms';
import { prrsAssaySlot } from '@/lib/assay';

export type MatrixRecord = {
  id: number;
  date: string;
  farm_code: string;
  disease: string;
  test_type: string;
  result: string;
  pdf_file_id: string | null;
};

/** PRRS: 날짜당 Ag·Ab 한 열 / 그 외: 기존처럼 한 열 */
export type MatrixColumn =
  | { kind: 'prrs_merged'; key: string; date: string }
  | { kind: 'ab_ag_merged'; key: string; date: string; disease: string }
  | { kind: 'single'; key: string; date: string; test_type: string; disease: string };

function isPRRS(disease: string) {
  return disease.trim().toUpperCase() === 'PRRS';
}

function isMergedAbAgDisease(disease: string) {
  const d = disease.trim().toUpperCase();
  return d === 'PRRS' || d === 'MH' || d === 'APP' || d === 'SIV';
}

/** PRRS 유전자염기서열분석 → 일반 PRRS와 별도 열로 표시 */
function isPRRSGenomic(testType: string) {
  const t = testType.trim();
  return t.includes('유전자') || t.includes('염기서열');
}

/** 단일 열 키 (PRRS 제외 레코드용) */
export function columnKey(r: Pick<MatrixRecord, 'date' | 'test_type' | 'disease'>) {
  return `${r.date}\t${r.test_type}\t${r.disease}`;
}

/** YYYY-MM-DD → 해당 주 월요일 (로컬 달력, 월요일 시작) */
export function mondayOfWeek(isoDate: string): string {
  const s = isoDate.slice(0, 10);
  const [yy, mm, dd] = s.split('-').map((x) => parseInt(x, 10));
  if (!Number.isFinite(yy) || !Number.isFinite(mm) || !Number.isFinite(dd)) return s;
  const d = new Date(yy, mm - 1, dd);
  const day = d.getDay(); // 0=일 … 6=토
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dayNum = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dayNum}`;
}

/** 월요일 YYYY-MM-DD → 일요일 YYYY-MM-DD (같은 주) */
export function sundayOfWeek(mondayYmd: string): string {
  const s = mondayYmd.slice(0, 10);
  const [yy, mm, dd] = s.split('-').map((x) => parseInt(x, 10));
  if (!Number.isFinite(yy) || !Number.isFinite(mm) || !Number.isFinite(dd)) return s;
  const d = new Date(yy, mm - 1, dd);
  d.setDate(d.getDate() + 6);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dayNum = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dayNum}`;
}

/** 주간 열 헤더: MM-DD ~ MM-DD */
export function formatWeekRangeLabel(mondayYmd: string): string {
  const a = formatMonthDay(mondayYmd);
  const b = formatMonthDay(sundayOfWeek(mondayYmd));
  return `${a}~${b}`;
}

export type MatrixGranularity = 'day' | 'week';

/** 같은 날짜(또는 주) 안에서 질병 열 표시 순: PRRS → PED → SIV → APP → MH → MHR → 세균 → 기타 */
function matrixColumnDiseaseRank(col: MatrixColumn): number {
  if (col.kind === 'prrs_merged') return 5;
  const d = (col.kind === 'ab_ag_merged' ? col.disease : col.disease).trim();
  if (d === 'PRRS 유전자') return 15;
  if (d === '세균') return 70;
  if (d.includes('감수성')) return 75;
  const u = d.toUpperCase();
  const order: Record<string, number> = {
    PED: 20,
    PEDV: 20,
    SIV: 30,
    APP: 40,
    MH: 50,
    MHR: 60,
  };
  if (order[u] !== undefined) return order[u];
  return 1000;
}

function bucketDate(date: string, granularity: MatrixGranularity): string {
  return granularity === 'week' ? mondayOfWeek(date) : date;
}

/** 단일 열 조회 키 (주간이면 날짜를 주 월요일로 통일) */
export function singleLookupKey(r: MatrixRecord, granularity: MatrixGranularity): string {
  const d = bucketDate(r.date, granularity);
  if (isPRRS(r.disease) && isPRRSGenomic(r.test_type)) {
    return `${d}\t${r.test_type}\tPRRS 유전자`;
  }
  return `${d}\t${r.test_type}\t${r.disease}`;
}

export function buildMatrixColumns(
  records: MatrixRecord[],
  opts?: { granularity?: MatrixGranularity }
): MatrixColumn[] {
  const granularity: MatrixGranularity = opts?.granularity ?? 'day';
  const prrsDates = new Set<string>();
  const mergedAbAg = new Map<string, Set<string>>(); // disease -> bucket dates
  const singleMap = new Map<string, MatrixColumn>();

  for (const r of records) {
    const b = bucketDate(r.date, granularity);
    if (isPRRS(r.disease) && isPRRSGenomic(r.test_type)) {
      const key =
        granularity === 'week'
          ? `${b}\t${r.test_type}\tPRRS 유전자`
          : columnKey(r);
      if (!singleMap.has(key)) {
        singleMap.set(key, {
          kind: 'single',
          key,
          date: b,
          test_type: r.test_type,
          disease: 'PRRS 유전자',
        });
      }
      continue;
    }
    if (isMergedAbAgDisease(r.disease) && !isPRRSGenomic(r.test_type)) {
      if (isPRRS(r.disease)) prrsDates.add(b);
      else {
        const d = r.disease.trim().toUpperCase();
        if (!mergedAbAg.has(d)) mergedAbAg.set(d, new Set());
        mergedAbAg.get(d)!.add(b);
      }
      continue;
    }
    const key =
      granularity === 'week' ? `${b}\t${r.test_type}\t${r.disease}` : columnKey(r);
    if (!singleMap.has(key)) {
      singleMap.set(key, {
        kind: 'single',
        key,
        date: b,
        test_type: r.test_type,
        disease: r.disease,
      });
    }
  }

  const merged: MatrixColumn[] = [...prrsDates]
    .sort((a, b) => b.localeCompare(a))
    .map((date) => ({
      kind: 'prrs_merged' as const,
      key: `PRRS_MERGED\t${date}`,
      date,
    }));

  const otherMerged: MatrixColumn[] = [];
  for (const [disease, dates] of mergedAbAg) {
    for (const date of [...dates].sort((a, b) => b.localeCompare(a))) {
      otherMerged.push({
        kind: 'ab_ag_merged',
        key: `ABAG_MERGED\t${disease}\t${date}`,
        date,
        disease,
      });
    }
  }

  const singles = [...singleMap.values()];

  const all = [...merged, ...otherMerged, ...singles];
  all.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    const ra = matrixColumnDiseaseRank(a);
    const rb = matrixColumnDiseaseRank(b);
    if (ra !== rb) return ra - rb;
    const kindOrder = (c: MatrixColumn) =>
      c.kind === 'prrs_merged' ? 0 : c.kind === 'ab_ag_merged' ? 1 : 2;
    if (a.kind === 'ab_ag_merged' && b.kind === 'ab_ag_merged') {
      return a.disease.localeCompare(b.disease);
    }
    if (a.kind === 'single' && b.kind === 'single') {
      if (a.disease !== b.disease) return a.disease.localeCompare(b.disease);
      return a.test_type.localeCompare(b.test_type);
    }
    if (kindOrder(a) !== kindOrder(b)) return kindOrder(a) - kindOrder(b);
    return 0;
  });

  const dateMatches = (r: MatrixRecord, colDate: string) =>
    granularity === 'week' ? bucketDate(r.date, granularity) === colDate : r.date === colDate;

  // 날짜별 해당 질병에 레코드가 하나도 없으면 열 생략 (예: 3/20 PRRS 결과 없으면 당일 PRRS 열 표시 안 함)
  return all.filter((col) => {
    if (col.kind === 'prrs_merged') {
      return records.some(
        (r) => dateMatches(r, col.date) && isPRRS(r.disease) && !isPRRSGenomic(r.test_type)
      );
    }
    if (col.kind === 'ab_ag_merged') {
      return records.some(
        (r) =>
          dateMatches(r, col.date) &&
          r.disease.trim().toUpperCase() === col.disease &&
          !isPRRSGenomic(r.test_type)
      );
    }
    return records.some((r) => {
      if (!dateMatches(r, col.date)) return false;
      if (col.disease === 'PRRS 유전자') {
        return isPRRS(r.disease) && isPRRSGenomic(r.test_type) && r.test_type === col.test_type;
      }
      return granularity === 'week' ? singleLookupKey(r, 'week') === col.key : columnKey(r) === col.key;
    });
  });
}

export function dateHeaderSpans(columns: MatrixColumn[]) {
  const spans: { date: string; count: number }[] = [];
  for (const c of columns) {
    const last = spans[spans.length - 1];
    if (last && last.date === c.date) last.count += 1;
    else spans.push({ date: c.date, count: 1 });
  }
  return spans;
}

/** dateSpans 기준 연도별 colSpan (한 단계 위 헤더용) */
export function yearHeaderSpans(dateSpans: { date: string; count: number }[]) {
  const result: { year: string; count: number }[] = [];
  for (const span of dateSpans) {
    const year = span.date.slice(0, 4);
    const last = result[result.length - 1];
    if (last && last.year === year) last.count += span.count;
    else result.push({ year, count: span.count });
  }
  return result;
}

/** YYYY-MM-DD → MM-DD */
export function formatMonthDay(date: string): string {
  return date.length >= 10 ? date.slice(5, 10) : date;
}

export function farmCodesInOrder(
  filterFarm: string | string[] | null,
  records: MatrixRecord[]
): string[] {
  const all = Object.keys(FARMS) as FarmCode[];
  const withData = new Set(records.map((r) => r.farm_code));
  if (filterFarm) {
    const arr = Array.isArray(filterFarm) ? filterFarm : [filterFarm];
    const valid = arr.filter((c) => all.includes(c as FarmCode));
    if (valid.length > 0) return valid;
  }
  return all.filter((c) => withData.has(c));
}

/** 농장 행: 그룹별(직영→협력→SP센터→위탁장) 정렬, 그룹 내 FARMS 순서 */
export function farmRowsByGroup(
  filterFarm: string | string[] | null,
  records: MatrixRecord[],
  customerOnly = false
): { group: string; codes: string[] }[] {
  const codes = customerOnly ? customerFarmCodesInOrder(records) : farmCodesInOrder(filterFarm, records);
  if (customerOnly) return [{ group: '고객농장', codes }];
  const byGroup = new Map<string, string[]>();
  for (const g of FARM_GROUPS) byGroup.set(g, []);
  for (const c of codes) {
    const info = FARMS[c as FarmCode];
    const g = info?.group ?? '기타';
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g)!.push(c);
  }
  return FARM_GROUPS.map((g) => ({ group: g, codes: byGroup.get(g) ?? [] })).filter((x) => x.codes.length > 0);
}

/** 고객농장: FARMS에 없는 farm_code만 (레코드 기준, 이름순) */
export function customerFarmCodesInOrder(records: MatrixRecord[]): string[] {
  const registered = new Set(Object.keys(FARMS));
  const codes = [...new Set(records.map((r) => r.farm_code).filter((c) => !registered.has(c)))];
  return codes.sort((a, b) => a.localeCompare(b));
}

export type PrrsPair = { ag: MatrixRecord | null; ab: MatrixRecord | null };

/** 농장·날짜(또는 주 월요일)·별 PRRS Ag/Ab 레코드 (최신 id 우선) */
export function getPrrsPair(
  records: MatrixRecord[],
  farmCode: string,
  date: string,
  granularity: MatrixGranularity = 'day'
): PrrsPair {
  const subset = records.filter((r) => {
    if (r.farm_code !== farmCode || !isPRRS(r.disease)) return false;
    if (granularity === 'week') return mondayOfWeek(r.date) === date;
    return r.date === date;
  });
  let ag: MatrixRecord | null = null;
  let ab: MatrixRecord | null = null;
  for (const r of subset) {
    const slot = prrsAssaySlot(r.test_type);
    if (slot === 'ag') {
      if (!ag || r.id > ag.id) ag = r;
    } else if (slot === 'ab') {
      if (!ab || r.id > ab.id) ab = r;
    }
  }
  return { ag, ab };
}

export function getAbAgPairByDisease(
  records: MatrixRecord[],
  farmCode: string,
  date: string,
  disease: string,
  granularity: MatrixGranularity = 'day'
): PrrsPair {
  const d = (disease ?? '').trim().toUpperCase();
  const subset = records.filter((r) => {
    if (r.farm_code !== farmCode || r.disease.trim().toUpperCase() !== d) return false;
    if (granularity === 'week') return mondayOfWeek(r.date) === date;
    return r.date === date;
  });
  let ag: MatrixRecord | null = null;
  let ab: MatrixRecord | null = null;
  for (const r of subset) {
    const slot = prrsAssaySlot(r.test_type);
    if (slot === 'ag') {
      if (!ag || r.id > ag.id) ag = r;
    } else if (slot === 'ab') {
      if (!ab || r.id > ab.id) ab = r;
    }
  }
  return { ag, ab };
}

export function buildSingleCellMap(
  records: MatrixRecord[],
  columns: MatrixColumn[],
  granularity: MatrixGranularity = 'day'
): Map<string, Map<string, MatrixRecord>> {
  const singleKeys = new Set(
    columns.filter((c): c is Extract<MatrixColumn, { kind: 'single' }> => c.kind === 'single').map((c) => c.key)
  );
  const byFarm = new Map<string, Map<string, MatrixRecord>>();

  for (const r of records) {
    if (isPRRS(r.disease) && !isPRRSGenomic(r.test_type)) continue;
    const ck = granularity === 'week' ? singleLookupKey(r, 'week') : columnKey(r);
    if (!singleKeys.has(ck)) continue;
    if (!byFarm.has(r.farm_code)) byFarm.set(r.farm_code, new Map());
    const row = byFarm.get(r.farm_code)!;
    const existing = row.get(ck);
    if (!existing || r.id > existing.id) row.set(ck, r);
  }
  return byFarm;
}

function singleColumnMatchesRecord(
  col: Extract<MatrixColumn, { kind: 'single' }>,
  r: MatrixRecord,
  granularity: MatrixGranularity = 'day'
): boolean {
  if (granularity === 'week') {
    if (mondayOfWeek(r.date) !== col.date) return false;
  } else if (r.date !== col.date) return false;
  if (col.disease === 'PRRS 유전자') {
    return isPRRS(r.disease) && isPRRSGenomic(r.test_type) && r.test_type === col.test_type;
  }
  return granularity === 'week' ? singleLookupKey(r, 'week') === col.key : columnKey(r) === col.key;
}

/** 표시 중인 농장 행에 그날짜(또는 그 주)에 채울 데이터가 하나도 없으면 해당 열 묶음 전부 제거 */
export function pruneColumnsWithNoVisibleData(
  columns: MatrixColumn[],
  records: MatrixRecord[],
  visibleFarmCodes: string[],
  granularity: MatrixGranularity = 'day'
): MatrixColumn[] {
  if (visibleFarmCodes.length === 0) return [];
  const byDate = new Map<string, MatrixColumn[]>();
  for (const c of columns) {
    const list = byDate.get(c.date) ?? [];
    list.push(c);
    byDate.set(c.date, list);
  }
  const keepDates = new Set<string>();
  for (const [date, cols] of byDate) {
    let dateHasAny = false;
    outer: for (const farm of visibleFarmCodes) {
      for (const col of cols) {
        if (col.kind === 'prrs_merged') {
          const { ag, ab } = getPrrsPair(records, farm, date, granularity);
          if (ag || ab) {
            dateHasAny = true;
            break outer;
          }
        } else if (col.kind === 'ab_ag_merged') {
          const { ag, ab } = getAbAgPairByDisease(records, farm, date, col.disease, granularity);
          if (ag || ab) {
            dateHasAny = true;
            break outer;
          }
        } else {
          if (
            records.some((r) => r.farm_code === farm && singleColumnMatchesRecord(col, r, granularity))
          ) {
            dateHasAny = true;
            break outer;
          }
        }
      }
    }
    if (dateHasAny) keepDates.add(date);
  }
  return columns.filter((c) => keepDates.has(c.date));
}
