'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { farmDisplayLabel } from '@/lib/farm-display';
import { useFarmAnonymize } from '@/hooks/useFarmAnonymize';
import { formatAssayLabel, prrsAssaySlot } from '@/lib/assay';
import { pdfViewUrl } from '@/lib/drive';
import { parseTestResult } from '@/lib/result-display';
import {
  buildMatrixColumns,
  buildSingleCellMap,
  dateHeaderSpans,
  farmRowsByGroup,
  formatMonthDay,
  formatWeekRangeLabel,
  getAbAgPairByDisease,
  getPrrsPair,
  mondayOfWeek,
  pruneColumnsWithNoVisibleData,
  yearHeaderSpans,
  type MatrixColumn,
  type MatrixGranularity,
  type MatrixRecord,
} from '@/lib/matrix';
import { DISEASE_FILTER_OPTIONS, DEFAULT_DISEASES } from '@/lib/disease-filter';
import { SidoAggregateMatrix } from '@/components/SidoAggregateMatrix';
import type { MatrixScope, PublicVetDemoRegion } from '@/lib/matrix-region-filters';

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const DATE_PRESETS = [
  { label: '1개월', months: 1 },
  { label: '3개월', months: 3 },
  { label: '6개월', months: 6 },
  { label: '1년', months: 12 },
] as const;

type DateMode = 'preset' | 'all' | 'custom';

/** 검증 모드에서 선택한 셀 → Cursor 등에 붙여넣기용 */
export type MatrixVerifyPick = {
  farmCode: string;
  farmLabel: string;
  periodLabel: string;
  disease: string;
  assayLabel: string;
  result: string;
  recordId: number | null;
  pdfFileId: string | null;
};

let lastPdfOpen = { url: '', ts: 0 };
function openPdfOnce(url: string) {
  const now = Date.now();
  if (url === lastPdfOpen.url && now - lastPdfOpen.ts < 500) return;
  lastPdfOpen = { url, ts: now };
  window.open(url, '_blank', 'noopener,noreferrer');
}

export type RecordsMatrixViewerProps = {
  matrixScope: Exclude<MatrixScope, 'default'>;
  publicVetRegion?: PublicVetDemoRegion | null;
  localSido?: string | null;
  govCentralView?: 'aggregate' | 'farms';
  vetAssignedName?: string;
  /** 정부 스코프 등에서 농장명·코드 익명 표시 */
  forceFarmAnonymize?: boolean;
};

type RecordsMatrixProps = {
  farm: string | string[] | null;
  customerOnly?: boolean;
  matrixViewer?: RecordsMatrixViewerProps | null;
};

function ResultGlyph({
  record,
  compact,
  noLink,
}: {
  record: MatrixRecord | null;
  compact?: boolean;
  noLink?: boolean;
}) {
  if (!record) {
    return <span className={compact ? 'text-sm text-zinc-300' : 'text-lg text-zinc-300'}>—</span>;
  }
  const { symbol, variant } = parseTestResult(record.result);
  const url = noLink ? null : pdfViewUrl(record.id, record.pdf_file_id);
  const cls =
    variant === 'positive'
      ? compact
        ? 'text-base font-bold text-red-600'
        : 'text-lg font-bold text-red-600'
      : variant === 'negative'
        ? compact
          ? 'text-base font-bold text-emerald-600'
          : 'text-lg font-bold text-emerald-600'
        : variant === 'equivocal'
          ? compact
            ? 'text-base font-bold text-amber-600'
            : 'text-lg font-bold text-amber-600'
          : compact
            ? 'text-sm font-medium text-zinc-700'
            : 'text-sm font-medium text-zinc-700';

  const inner = <span className={cls}>{symbol}</span>;
  if (url) {
    return (
      <span
        role="link"
        tabIndex={0}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          e.nativeEvent.stopImmediatePropagation();
          openPdfOnce(url);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openPdfOnce(url);
          }
        }}
        className="inline-block cursor-pointer rounded px-0.5 underline decoration-zinc-400 underline-offset-2 hover:bg-blue-50"
        title="원본 결과지"
      >
        {inner}
      </span>
    );
  }
  return inner;
}

type AggregateApiPayload = {
  rows: { sido: string; cells: Record<string, { tests: number; positives: number }> }[];
  columnKeys: string[];
  columnMeta: { key: string; month: string; disease: string }[];
};

export function RecordsMatrix({
  farm,
  customerOnly = false,
  matrixViewer = null,
}: RecordsMatrixProps) {
  const sp = useSearchParams();
  const router = useRouter();
  const resetKey = (sp?.get('reset') ?? '').trim();
  const { anonymized } = useFarmAnonymize();
  const effectiveAnonymize = matrixViewer?.forceFarmAnonymize || anonymized;
  const [records, setRecords] = useState<MatrixRecord[]>([]);
  const [aggregatePayload, setAggregatePayload] = useState<AggregateApiPayload | null>(null);
  const [scopeWarning, setScopeWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draftSelectedDiseases, setDraftSelectedDiseases] = useState<Set<string>>(
    () => new Set(DEFAULT_DISEASES)
  );
  const [appliedDiseases, setAppliedDiseases] = useState<Set<string>>(() => new Set(DEFAULT_DISEASES));
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [dateMode, setDateMode] = useState<DateMode>('preset');
  const [datePresetIndex, setDatePresetIndex] = useState(3);
  const [positiveOnly, setPositiveOnly] = useState(false);
  const [matrixGrain, setMatrixGrain] = useState<MatrixGranularity>(() =>
    (sp?.get('grain') ?? '').trim() === 'week' ? 'week' : 'day'
  );
  const pathname = usePathname() ?? '/dashboard';
  const verifyMode = (sp?.get('verify') ?? '').trim() === '1';
  const [verifyPicks, setVerifyPicks] = useState<Record<string, MatrixVerifyPick>>({});

  const [customFrom, setCustomFrom] = useState(() => {
    const to = new Date();
    const from = new Date(to);
    from.setMonth(from.getMonth() - 12);
    return ymd(from);
  });
  const [customTo, setCustomTo] = useState(() => ymd(new Date()));

  useEffect(() => {
    const g = (sp?.get('grain') ?? '').trim() === 'week' ? 'week' : 'day';
    setMatrixGrain(g);
  }, [sp]);

  useEffect(() => {
    if (!resetKey) return;
    // 홈: 질병필터 전체 선택 + 농장 전체는 URL farm 제거로 처리
    const allCodes = DISEASE_FILTER_OPTIONS.map((o) => o.code);
    setDraftSelectedDiseases(new Set(allCodes));
    setAppliedDiseases(new Set(allCodes));
    setPositiveOnly(false);
    setCollapsedGroups(new Set());
    // 기본 화면: 1년 프리셋으로 복귀
    setDateMode('preset');
    setDatePresetIndex(3);
    const to = new Date();
    const from = new Date(to);
    from.setMonth(from.getMonth() - 12);
    setCustomFrom(ymd(from));
    setCustomTo(ymd(to));
  }, [resetKey]);

  const appliedDiseaseKey = useMemo(() => [...appliedDiseases].sort().join(','), [appliedDiseases]);

  const { dateFrom, dateTo, fetchLimit } = useMemo(() => {
    if (dateMode === 'all') {
      return { dateFrom: null as string | null, dateTo: null as string | null, fetchLimit: 8000 };
    }
    if (dateMode === 'custom') {
      let from = customFrom;
      let to = customTo;
      if (from && to && from > to) {
        const t = from;
        from = to;
        to = t;
      }
      return {
        dateFrom: from || null,
        dateTo: to || null,
        fetchLimit: 8000,
      };
    }
    const to = new Date();
    const from = new Date(to);
    const months = DATE_PRESETS[datePresetIndex]?.months ?? 12;
    from.setMonth(from.getMonth() - months);
    return { dateFrom: ymd(from), dateTo: ymd(to), fetchLimit: undefined as number | undefined };
  }, [dateMode, datePresetIndex, customFrom, customTo]);

  const toggleGroupCollapse = (group: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  const toggleDraftDisease = (code: string) => {
    setDraftSelectedDiseases((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const farmParam = Array.isArray(farm) ? farm.join(',') : farm;

  const matrixViewerKey = useMemo(() => {
    if (!matrixViewer) return '';
    return [
      matrixViewer.matrixScope,
      matrixViewer.publicVetRegion ?? '',
      matrixViewer.localSido ?? '',
      matrixViewer.govCentralView ?? 'aggregate',
      matrixViewer.vetAssignedName ?? '',
      matrixViewer.forceFarmAnonymize ? '1' : '0',
    ].join('|');
  }, [matrixViewer]);

  const periodLabelForColumn = useCallback(
    (col: MatrixColumn) =>
      matrixGrain === 'week' ? formatWeekRangeLabel(col.date) : col.date,
    [matrixGrain]
  );

  const toggleVerifyPick = useCallback((key: string, pick: MatrixVerifyPick | null, checked: boolean) => {
    setVerifyPicks((prev) => {
      const next = { ...prev };
      if (checked && pick) next[key] = pick;
      else delete next[key];
      return next;
    });
  }, []);

  const setVerifyModeUrl = useCallback(
    (on: boolean) => {
      const params = new URLSearchParams(sp?.toString() ?? '');
      if (on) params.set('verify', '1');
      else {
        params.delete('verify');
        setVerifyPicks({});
      }
      router.push(`${pathname}?${params.toString()}`);
    },
    [pathname, router, sp]
  );

  const verifyExportMarkdown = useMemo(() => {
    const rows = Object.values(verifyPicks);
    if (rows.length === 0) return '';
    const sorted = [...rows].sort((a, b) => {
      const pl = a.periodLabel.localeCompare(b.periodLabel);
      if (pl !== 0) return pl;
      const fc = a.farmCode.localeCompare(b.farmCode);
      if (fc !== 0) return fc;
      return `${a.disease}|${a.assayLabel}`.localeCompare(`${b.disease}|${b.assayLabel}`);
    });
    const header = `## 매트릭스 검증 후보 (${sorted.length}건)\n\n파싱·DB 이상 가능 셀로 표시했습니다. Cursor 등에 그대로 붙여넣기 하세요.\n\n`;
    const table =
      '| # | 농장 | 코드 | 기간 | 질병 | 검사 | 결과 | record_id | pdf_file_id |\n|---:|---|---|---|---|---|---:|---|---|\n' +
      sorted
        .map((r, i) => {
          const id = r.recordId != null ? String(r.recordId) : '—';
          const pdf = r.pdfFileId && r.pdfFileId.trim() !== '' ? r.pdfFileId.replace(/\|/g, ' ') : '—';
          return `| ${i + 1} | ${r.farmLabel} | ${r.farmCode} | ${r.periodLabel} | ${r.disease} | ${r.assayLabel} | ${r.result} | ${id} | ${pdf} |`;
        })
        .join('\n');
    return header + table;
  }, [verifyPicks]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setScopeWarning(null);
    const params = new URLSearchParams();
    if (matrixViewer?.matrixScope) {
      params.set('matrixScope', matrixViewer.matrixScope);
      if (matrixViewer.publicVetRegion) params.set('publicVetRegion', matrixViewer.publicVetRegion);
      if (matrixViewer.localSido) params.set('localSido', matrixViewer.localSido);
      if (matrixViewer.matrixScope === 'gov_central') {
        params.set('govView', matrixViewer.govCentralView === 'farms' ? 'farms' : 'aggregate');
      }
      if (matrixViewer.vetAssignedName) params.set('vetAssignedName', matrixViewer.vetAssignedName);
      // 수의/공수의 등 스코프에서도 좌측 농장선택(farm=...)으로 부분 필터 가능
      if (farmParam) params.set('farm', farmParam);
    } else {
      if (farmParam) params.set('farm', farmParam);
      if (customerOnly) params.set('customerOnly', '1');
    }
    if (appliedDiseases.size > 0) params.set('diseases', [...appliedDiseases].join(','));
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    if (fetchLimit != null) params.set('limit', String(fetchLimit));

    fetch(`/api/records?${params}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '조회 실패');
        return data as {
          format?: 'detail' | 'aggregate';
          records?: MatrixRecord[];
          aggregate?: AggregateApiPayload;
          warning?: string;
        };
      })
      .then((data) => {
        if (data.warning) setScopeWarning(data.warning);
        if (data.format === 'aggregate' && data.aggregate) {
          setAggregatePayload(data.aggregate);
          setRecords([]);
        } else {
          setAggregatePayload(null);
          setRecords(data.records ?? []);
        }
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [farmParam, customerOnly, appliedDiseaseKey, dateFrom, dateTo, fetchLimit, matrixViewerKey]);

  const farmFilterForRows = useMemo(() => {
    if (matrixViewer) return null;
    if (!farmParam) return null;
    return farmParam.includes(',') ? farmParam.split(',') : farmParam;
  }, [farmParam, matrixViewer]);

  const farmRowsByGroupRaw = useMemo(
    () => farmRowsByGroup(farmFilterForRows, records, customerOnly),
    [farmFilterForRows, records, customerOnly]
  );

  const farmRowsByGroupData = useMemo(() => {
    if (!positiveOnly) return farmRowsByGroupRaw;
    const positiveFarmCodes = new Set(
      records
        .filter((r) => parseTestResult(r.result).variant === 'positive')
        .map((r) => r.farm_code)
    );
    return farmRowsByGroupRaw
      .map(({ group, codes }) => ({
        group,
        codes: codes.filter((c) => positiveFarmCodes.has(c)),
      }))
      .filter((x) => x.codes.length > 0);
  }, [farmRowsByGroupRaw, records, positiveOnly]);

  const visibleFarmCodes = useMemo(
    () => farmRowsByGroupData.flatMap(({ codes }) => codes),
    [farmRowsByGroupData]
  );

  const columns = useMemo(() => {
    const raw = buildMatrixColumns(records, { granularity: matrixGrain });
    return pruneColumnsWithNoVisibleData(raw, records, visibleFarmCodes, matrixGrain);
  }, [records, visibleFarmCodes, matrixGrain]);

  const dateSpans = useMemo(() => dateHeaderSpans(columns), [columns]);
  const yearSpans = useMemo(() => yearHeaderSpans(dateSpans), [dateSpans]);
  const singleCellMap = useMemo(
    () => buildSingleCellMap(records, columns, matrixGrain),
    [records, columns, matrixGrain]
  );

  function setGrainAndUrl(next: MatrixGranularity) {
    setMatrixGrain(next);
    const params = new URLSearchParams(sp?.toString() ?? '');
    if (next === 'week') params.set('grain', 'week');
    else params.delete('grain');
    router.push(`${pathname}?${params.toString()}`);
  }

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center text-zinc-500">
        로딩 중…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded bg-red-50 p-4 text-sm text-red-700">
        오류: {error}
      </div>
    );
  }

  const hasPositiveRows = farmRowsByGroupData.some((g) => g.codes.length > 0);

  const farmName = (code: string) => farmDisplayLabel(code, effectiveAnonymize);

  function dateInColumnBucket(rDate: string, colDate: string): boolean {
    return matrixGrain === 'week' ? mondayOfWeek(rDate) === colDate : rDate === colDate;
  }

  function mergedHeaderSlots(col: MatrixColumn): { showAg: boolean; showAb: boolean } {
    if (col.kind === 'prrs_merged') {
      let showAg = false;
      let showAb = false;
      for (const r of records) {
        if (!dateInColumnBucket(r.date, col.date)) continue;
        if (r.disease.trim().toUpperCase() !== 'PRRS') continue;
        const slot = prrsAssaySlot(r.test_type);
        if (slot === 'ag') showAg = true;
        if (slot === 'ab') showAb = true;
        if (showAg && showAb) break;
      }
      return { showAg, showAb };
    }
    if (col.kind === 'ab_ag_merged') {
      let showAg = false;
      let showAb = false;
      const disease = col.disease.trim().toUpperCase();
      for (const r of records) {
        if (!dateInColumnBucket(r.date, col.date)) continue;
        if (r.disease.trim().toUpperCase() !== disease) continue;
        const slot = prrsAssaySlot(r.test_type);
        if (slot === 'ag') showAg = true;
        if (slot === 'ab') showAb = true;
        if (showAg && showAb) break;
      }
      return { showAg, showAb };
    }
    return { showAg: true, showAb: true };
  }

  function renderHeader(col: MatrixColumn) {
    if (col.kind === 'prrs_merged') {
      const { showAg, showAb } = mergedHeaderSlots(col);
      return (
        <th
          key={col.key}
          className="min-w-[40px] border border-zinc-200 bg-zinc-50 px-1 py-1 text-center text-[10px] font-normal leading-tight text-zinc-600"
        >
          <div className="font-semibold text-zinc-800">PRRS</div>
          <div className={`mt-0.5 flex justify-center text-[9px] font-medium tracking-tight text-zinc-600 ${showAg && showAb ? 'gap-2.5' : ''}`}>
            {showAg && <span>Ag</span>}
            {showAb && <span>Ab</span>}
          </div>
        </th>
      );
    }
    if (col.kind === 'ab_ag_merged') {
      const { showAg, showAb } = mergedHeaderSlots(col);
      return (
        <th
          key={col.key}
          className="min-w-[40px] border border-zinc-200 bg-zinc-50 px-1 py-1 text-center text-[10px] font-normal leading-tight text-zinc-600"
        >
          <div className="font-semibold text-zinc-800">{col.disease}</div>
          <div className={`mt-0.5 flex justify-center text-[9px] font-medium tracking-tight text-zinc-600 ${showAg && showAb ? 'gap-2.5' : ''}`}>
            {showAg && <span>Ag</span>}
            {showAb && <span>Ab</span>}
          </div>
        </th>
      );
    }
    return (
      <th
        key={col.key}
        className="max-w-[75px] border border-zinc-200 bg-zinc-50 px-1 py-1 text-center text-[10px] font-normal leading-tight text-zinc-600"
      >
        <div className="font-semibold text-zinc-800">{col.disease}</div>
        <div className="mt-0.5 text-[9px] font-medium text-zinc-600">{formatAssayLabel(col.test_type)}</div>
      </th>
    );
  }

  function renderCell(code: string, col: MatrixColumn, rowIndex: number) {
    const pl = periodLabelForColumn(col);
    const fl = farmName(code);

    if (col.kind === 'prrs_merged') {
      const pair = getPrrsPair(records, code, col.date, matrixGrain);
      const hasData = pair.ag || pair.ab;
      if (!hasData) {
        const rowBg = rowIndex % 2 === 0 ? 'bg-white' : 'bg-zinc-50/50';
        return (
          <td key={col.key} className={`border border-zinc-200 px-1 py-1 text-center align-middle ${rowBg}`} />
        );
      }
      const rowBg = rowIndex % 2 === 0 ? 'bg-white' : 'bg-zinc-50/50';
      const showAg = Boolean(pair.ag);
      const showAb = Boolean(pair.ab);
      const keyAg = pair.ag ? `v1|${code}|${col.key}|PRRS|ag|${pair.ag.id}` : '';
      const keyAb = pair.ab ? `v1|${code}|${col.key}|PRRS|ab|${pair.ab.id}` : '';
      const pkAg =
        pair.ag &&
        ({
          farmCode: code,
          farmLabel: fl,
          periodLabel: pl,
          disease: 'PRRS',
          assayLabel: 'Ag (PCR)',
          result: parseTestResult(pair.ag.result).symbol,
          recordId: pair.ag.id,
          pdfFileId: pair.ag.pdf_file_id,
        } satisfies MatrixVerifyPick);
      const pkAb =
        pair.ab &&
        ({
          farmCode: code,
          farmLabel: fl,
          periodLabel: pl,
          disease: 'PRRS',
          assayLabel: 'Ab (ELISA)',
          result: parseTestResult(pair.ab.result).symbol,
          recordId: pair.ab.id,
          pdfFileId: pair.ab.pdf_file_id,
        } satisfies MatrixVerifyPick);
      return (
        <td
          key={col.key}
          className={`border border-zinc-200 px-1 py-1 text-center align-middle ${rowBg}`}
        >
          <div className={`flex items-center justify-center ${showAg && showAb ? 'gap-2.5' : ''}`}>
            {showAg && pair.ag && pkAg && (
              <label
                className={`flex min-w-[22px] flex-col items-center gap-0.5 ${verifyPicks[keyAg] ? 'rounded bg-amber-50/90 ring-1 ring-amber-400/70' : ''}`}
                title="항원 (PCR)"
              >
                {verifyMode && (
                  <input
                    type="checkbox"
                    checked={Boolean(verifyPicks[keyAg])}
                    onChange={(e) => toggleVerifyPick(keyAg, pkAg, e.target.checked)}
                    onClick={(e) => e.stopPropagation()}
                    className="mb-0.5 h-2.5 w-2.5 cursor-pointer accent-amber-600"
                    aria-label="검증 목록에 넣기"
                  />
                )}
                <span className="text-[8px] font-medium text-zinc-400">Ag</span>
                <ResultGlyph record={pair.ag} compact />
              </label>
            )}
            {showAb && pair.ab && pkAb && (
              <label
                className={`flex min-w-[22px] flex-col items-center gap-0.5 ${verifyPicks[keyAb] ? 'rounded bg-amber-50/90 ring-1 ring-amber-400/70' : ''}`}
                title="항체 (ELISA)"
              >
                {verifyMode && (
                  <input
                    type="checkbox"
                    checked={Boolean(verifyPicks[keyAb])}
                    onChange={(e) => toggleVerifyPick(keyAb, pkAb, e.target.checked)}
                    onClick={(e) => e.stopPropagation()}
                    className="mb-0.5 h-2.5 w-2.5 cursor-pointer accent-amber-600"
                    aria-label="검증 목록에 넣기"
                  />
                )}
                <span className="text-[8px] font-medium text-zinc-400">Ab</span>
                <ResultGlyph record={pair.ab} compact />
              </label>
            )}
          </div>
        </td>
      );
    }
    if (col.kind === 'ab_ag_merged') {
      const { ag, ab } = getAbAgPairByDisease(records, code, col.date, col.disease, matrixGrain);
      const hasData = ag || ab;
      const rowBg = rowIndex % 2 === 0 ? 'bg-white' : 'bg-zinc-50/50';
      if (!hasData) {
        return <td key={col.key} className={`border border-zinc-200 px-1 py-1 text-center align-middle ${rowBg}`} />;
      }
      const showAg = Boolean(ag);
      const showAb = Boolean(ab);
      const d = col.disease.trim().toUpperCase();
      const keyAg = ag ? `v1|${code}|${col.key}|${d}|ag|${ag.id}` : '';
      const keyAb = ab ? `v1|${code}|${col.key}|${d}|ab|${ab.id}` : '';
      const pkAg =
        ag &&
        ({
          farmCode: code,
          farmLabel: fl,
          periodLabel: pl,
          disease: col.disease,
          assayLabel: 'Ag (PCR)',
          result: parseTestResult(ag.result).symbol,
          recordId: ag.id,
          pdfFileId: ag.pdf_file_id,
        } satisfies MatrixVerifyPick);
      const pkAb =
        ab &&
        ({
          farmCode: code,
          farmLabel: fl,
          periodLabel: pl,
          disease: col.disease,
          assayLabel: 'Ab (ELISA)',
          result: parseTestResult(ab.result).symbol,
          recordId: ab.id,
          pdfFileId: ab.pdf_file_id,
        } satisfies MatrixVerifyPick);
      return (
        <td key={col.key} className={`border border-zinc-200 px-1 py-1 text-center align-middle ${rowBg}`}>
          <div className={`flex items-center justify-center ${showAg && showAb ? 'gap-2.5' : ''}`}>
            {showAg && ag && pkAg && (
              <label
                className={`flex min-w-[22px] flex-col items-center gap-0.5 ${verifyPicks[keyAg] ? 'rounded bg-amber-50/90 ring-1 ring-amber-400/70' : ''}`}
                title="항원 (PCR)"
              >
                {verifyMode && (
                  <input
                    type="checkbox"
                    checked={Boolean(verifyPicks[keyAg])}
                    onChange={(e) => toggleVerifyPick(keyAg, pkAg, e.target.checked)}
                    onClick={(e) => e.stopPropagation()}
                    className="mb-0.5 h-2.5 w-2.5 cursor-pointer accent-amber-600"
                    aria-label="검증 목록에 넣기"
                  />
                )}
                <span className="text-[8px] font-medium text-zinc-400">Ag</span>
                <ResultGlyph record={ag} compact />
              </label>
            )}
            {showAb && ab && pkAb && (
              <label
                className={`flex min-w-[22px] flex-col items-center gap-0.5 ${verifyPicks[keyAb] ? 'rounded bg-amber-50/90 ring-1 ring-amber-400/70' : ''}`}
                title="항체 (ELISA)"
              >
                {verifyMode && (
                  <input
                    type="checkbox"
                    checked={Boolean(verifyPicks[keyAb])}
                    onChange={(e) => toggleVerifyPick(keyAb, pkAb, e.target.checked)}
                    onClick={(e) => e.stopPropagation()}
                    className="mb-0.5 h-2.5 w-2.5 cursor-pointer accent-amber-600"
                    aria-label="검증 목록에 넣기"
                  />
                )}
                <span className="text-[8px] font-medium text-zinc-400">Ab</span>
                <ResultGlyph record={ab} compact />
              </label>
            )}
          </div>
        </td>
      );
    }

    const cell = singleCellMap.get(code)?.get(col.key);
    if (!cell) {
      const rowBg = rowIndex % 2 === 0 ? 'bg-white' : 'bg-zinc-50/50';
      return (
        <td key={col.key} className={`border border-zinc-200 px-1 py-0.5 text-center text-xs align-middle ${rowBg}`} />
      );
    }
    const url = cell.pdf_file_id ? pdfViewUrl(cell.id, cell.pdf_file_id) : null;
    const { symbol, variant } = parseTestResult(cell.result ?? null);

    const inner = (
      <span
        className={
          variant === 'positive'
            ? 'text-lg font-bold text-red-600'
            : variant === 'negative'
              ? 'text-lg font-bold text-emerald-600'
              : variant === 'equivocal'
                ? 'text-lg font-bold text-amber-600'
                : variant === 'empty'
                  ? 'text-zinc-300'
                  : 'text-sm font-medium text-zinc-700'
        }
      >
        {symbol}
      </span>
    );

    const vKey = `v1|${code}|${col.key}|single|${cell.id}`;
    const pkSingle: MatrixVerifyPick = {
      farmCode: code,
      farmLabel: fl,
      periodLabel: pl,
      disease: col.disease,
      assayLabel: formatAssayLabel(col.test_type),
      result: symbol,
      recordId: cell.id,
      pdfFileId: cell.pdf_file_id,
    };

    const rowBg = rowIndex % 2 === 0 ? 'bg-white' : 'bg-zinc-50/50';
    return (
      <td
        key={col.key}
        className={`border border-zinc-200 px-1 py-0.5 text-center text-xs align-middle ${rowBg} ${verifyPicks[vKey] ? 'ring-2 ring-inset ring-amber-400/60' : ''}`}
      >
        {verifyMode && (
          <div className="mb-0.5 flex justify-center">
            <input
              type="checkbox"
              checked={Boolean(verifyPicks[vKey])}
              onChange={(e) => toggleVerifyPick(vKey, pkSingle, e.target.checked)}
              onClick={(e) => e.stopPropagation()}
              className="h-2.5 w-2.5 cursor-pointer accent-amber-600"
              aria-label="검증 목록에 넣기"
            />
          </div>
        )}
        {url ? (
          <span
            role="link"
            tabIndex={0}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              e.nativeEvent.stopImmediatePropagation();
              openPdfOnce(url);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openPdfOnce(url);
              }
            }}
            className="inline-block cursor-pointer rounded px-1 py-0.5 underline decoration-zinc-400 underline-offset-2 hover:bg-blue-50 hover:decoration-blue-500"
            title="원본 결과지"
          >
            {inner}
          </span>
        ) : (
          inner
        )}
      </td>
    );
  }

  let globalRowIndex = 0;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-zinc-600">질병 필터:</span>
          {DISEASE_FILTER_OPTIONS.map(({ code, label }) => (
            <label key={code} className="flex cursor-pointer items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={draftSelectedDiseases.has(code)}
                onChange={() => toggleDraftDisease(code)}
                className="rounded border-zinc-300"
              />
              <span>{label}</span>
            </label>
          ))}
          <button
            type="button"
            onClick={() => setAppliedDiseases(new Set(draftSelectedDiseases))}
            className="rounded bg-zinc-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-zinc-800"
          >
            적용
          </button>
          <button
            type="button"
            onClick={() => setDraftSelectedDiseases(new Set())}
            className="rounded border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
          >
            모두 해제
          </button>
        </div>
        <div className="h-4 w-px bg-zinc-200" />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-zinc-600">날짜:</span>
          {DATE_PRESETS.map((preset, i) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => {
                setDateMode('preset');
                setDatePresetIndex(i);
              }}
              className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                dateMode === 'preset' && datePresetIndex === i
                  ? 'bg-zinc-700 text-white'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              {preset.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setDateMode('all')}
            className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
              dateMode === 'all'
                ? 'bg-zinc-700 text-white'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            모든 자료
          </button>
          <span className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-600">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => {
                setCustomFrom(e.target.value);
                setDateMode('custom');
              }}
              className="rounded border border-zinc-300 px-1.5 py-0.5 text-xs"
            />
            <span>—</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => {
                setCustomTo(e.target.value);
                setDateMode('custom');
              }}
              className="rounded border border-zinc-300 px-1.5 py-0.5 text-xs"
            />
          </span>
        </div>
        <div className="h-4 w-px bg-zinc-200" />
        <label className="flex cursor-pointer items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={positiveOnly}
            onChange={(e) => setPositiveOnly(e.target.checked)}
            className="rounded border-zinc-300"
          />
          <span className="text-zinc-600">양성만 표기</span>
        </label>
        {!aggregatePayload && (
          <>
            <div className="h-4 w-px bg-zinc-200" />
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-zinc-600">열 구간:</span>
              <div className="flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5">
                <button
                  type="button"
                  onClick={() => setGrainAndUrl('day')}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    matrixGrain === 'day'
                      ? 'bg-white text-zinc-800 shadow-sm'
                      : 'text-zinc-600 hover:text-zinc-800'
                  }`}
                >
                  일별
                </button>
                <button
                  type="button"
                  onClick={() => setGrainAndUrl('week')}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    matrixGrain === 'week'
                      ? 'bg-white text-zinc-800 shadow-sm'
                      : 'text-zinc-600 hover:text-zinc-800'
                  }`}
                >
                  주별
                </button>
              </div>
            </div>
            <div className="h-4 w-px bg-zinc-200" />
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-zinc-600">검증 모드:</span>
              <div className="flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5">
                <button
                  type="button"
                  onClick={() => setVerifyModeUrl(false)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    !verifyMode
                      ? 'bg-white text-zinc-800 shadow-sm'
                      : 'text-zinc-600 hover:text-zinc-800'
                  }`}
                >
                  끔
                </button>
                <button
                  type="button"
                  onClick={() => setVerifyModeUrl(true)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    verifyMode
                      ? 'bg-white text-zinc-800 shadow-sm'
                      : 'text-zinc-600 hover:text-zinc-800'
                  }`}
                >
                  켬
                </button>
              </div>
              {verifyMode && (
                <>
                  <span className="text-[11px] text-zinc-600">{Object.keys(verifyPicks).length}개 선택</span>
                  <button
                    type="button"
                    disabled={Object.keys(verifyPicks).length === 0 || !verifyExportMarkdown}
                    onClick={() => {
                      if (verifyExportMarkdown) void navigator.clipboard.writeText(verifyExportMarkdown);
                    }}
                    className="rounded bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    마크다운 복사
                  </button>
                  <button
                    type="button"
                    disabled={Object.keys(verifyPicks).length === 0}
                    onClick={() => setVerifyPicks({})}
                    className="rounded border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    선택 비우기
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
      {dateMode === 'all' && !aggregatePayload && (
        <p className="text-[11px] text-amber-800">
          모든 자료: 최신순 최대 8000건까지 불러옵니다. 행이 더 많으면 오래된 일부가 잘릴 수 있습니다.
        </p>
      )}
      {matrixViewer?.matrixScope === 'gov_central' && matrixViewer.govCentralView === 'aggregate' && (
        <p className="text-[11px] text-amber-800">
          중앙 집계: 최신순 최대 12000건까지 집계합니다. 기간을 좁히면 누락이 줄어듭니다.
        </p>
      )}
      {scopeWarning && (
        <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
          {scopeWarning}
        </p>
      )}
      {aggregatePayload ? (
        <SidoAggregateMatrix rows={aggregatePayload.rows} columnMeta={aggregatePayload.columnMeta} />
      ) : records.length === 0 ? (
        <div className="rounded border border-dashed border-zinc-300 p-8 text-center text-zinc-500">
          검사 기록이 없습니다.
          <p className="mt-2 text-xs">
            데이터는 (1) 메일→OCR→DB 자동 파이프라인 또는 (2) POST /api/ingest(레거시)로 들어오며,
            수집/반영이 완료되면 여기에 표시됩니다.
          </p>
          <p className="mt-2 text-xs text-zinc-400">
            ingest 시 각 행마다 <code className="rounded bg-zinc-100 px-1">drive_file_id</code>를 넣어야 셀에서 원본이 열립니다.
            PRRS는 같은 날짜에 <code className="rounded bg-zinc-100 px-1">PCR</code>(Ag)·
            <code className="rounded bg-zinc-100 px-1">ELISA</code>(Ab) 두 줄을 넣으면 한 열에 묶입니다.
          </p>
        </div>
      ) : !aggregatePayload && positiveOnly && !hasPositiveRows ? (
        <div className="rounded border border-amber-200 bg-amber-50 p-4 text-center text-sm text-amber-800">
          선택한 기간·질병에 양성 결과가 있는 농장이 없습니다.
        </div>
      ) : (
        <>
          <p className="text-xs text-zinc-500">
            열: {matrixGrain === 'week' ? '주(월~일)' : '날짜'} → <span className="font-medium">Ag</span>(항원·PCR 등) /{' '}
            <span className="font-medium">Ab</span>(항체·ELISA 등) · 질병 / PRRS는 Ag·Ab 한 칸 / 셀:{' '}
            <span className="font-semibold text-red-600">+</span>{' '}
            <span className="font-semibold text-amber-600">?</span>{' '}
            <span className="font-semibold text-emerald-600">-</span> (밑줄=원본 PDF)
            {verifyMode && (
              <span className="ml-2 text-amber-900">
                · 검증 모드: 파싱·DB 이상이 의심되는 칸을 체크한 뒤 「마크다운 복사」로 목록을 Cursor 등에 붙여넣을 수 있습니다.
              </span>
            )}
          </p>
          <div className="h-[calc(100vh-260px)] overflow-auto rounded border border-zinc-200">
            <table className="min-w-max border-collapse text-xs">
              <thead className="sticky top-0 z-20 bg-zinc-50 shadow-sm">
                <tr>
                  <th
                    rowSpan={3}
                    className="sticky left-0 z-30 min-w-[66px] border border-zinc-200 bg-zinc-100 px-1.5 py-1.5 text-left text-[11px] font-semibold text-zinc-800"
                  >
                    <div>농장</div>
                    <div className="mt-1 text-[10px] font-medium text-zinc-600">
                      {yearSpans.map((s) => `${s.year.slice(2)}년`).join('·')}
                    </div>
                  </th>
                  {yearSpans.map((span) => (
                    <th
                      key={span.year}
                      colSpan={span.count}
                      className="sticky left-[66px] z-20 border border-zinc-200 bg-zinc-50 px-1 py-1 text-center text-[9px] font-semibold text-zinc-600 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]"
                    >
                      {span.year.slice(2)}년
                    </th>
                  ))}
                </tr>
                <tr>
                  {dateSpans.map((span) => (
                    <th
                      key={span.date}
                      colSpan={span.count}
                      className="border border-zinc-200 px-1 py-1 text-center text-[9px] font-medium text-zinc-600"
                    >
                      {matrixGrain === 'week' ? formatWeekRangeLabel(span.date) : formatMonthDay(span.date)}
                    </th>
                  ))}
                </tr>
                <tr>{columns.map((c) => renderHeader(c))}</tr>
              </thead>
              <tbody>
                {farmRowsByGroupData.map(({ group, codes }) => {
                  const isCollapsed = collapsedGroups.has(group);
                  return (
                    <React.Fragment key={group}>
                      <tr className="bg-zinc-100">
                        <th
                          colSpan={columns.length + 1}
                          className="sticky left-0 z-10 border border-zinc-200 px-2 py-1 text-left text-xs font-semibold text-zinc-700"
                        >
                          <button
                            type="button"
                            onClick={() => toggleGroupCollapse(group)}
                            className="mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded hover:bg-zinc-200"
                            title={isCollapsed ? '펼치기' : '접기'}
                            aria-label={isCollapsed ? '펼치기' : '접기'}
                          >
                            {isCollapsed ? '+' : '−'}
                          </button>
                          {group}
                        </th>
                      </tr>
                      {!isCollapsed &&
                        codes.map((code) => {
                          const idx = globalRowIndex++;
                          const rowBg = idx % 2 === 0 ? 'bg-white' : 'bg-zinc-50/50';
                          return (
                            <tr key={code} className={`hover:bg-blue-50/30 ${rowBg}`}>
                              <th
                                className={`sticky left-0 z-10 border border-zinc-200 px-1.5 py-1 text-left text-[11px] font-medium text-zinc-800 ${rowBg}`}
                              >
                                {farmName(code)}
                              </th>
                              {columns.map((col) => renderCell(code, col, idx))}
                            </tr>
                          );
                        })}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
