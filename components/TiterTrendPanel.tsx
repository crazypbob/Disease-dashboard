'use client';

import { useEffect, useState } from 'react';
import type { MatrixScope } from '@/lib/matrix-region-filters';
import type { TiterRecord } from '@/app/api/titers/route';

const DISEASES = ['PRRS', 'MH', 'APP', 'Lawsonia', 'FMD', 'SIV'] as const;
type Disease = (typeof DISEASES)[number];

const DATE_PRESETS = [
  { label: '3개월', months: 3 },
  { label: '6개월', months: 6 },
  { label: '1년', months: 12 },
  { label: '전체', months: 0 },
] as const;

type Props = {
  farmCode: string | null;
  matrixAudience: MatrixScope;
};

function isoDateMinus(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

/** 일령 → 표시 구간 (10일 단위) */
function ageBucket(ageDays: number | null): string {
  if (ageDays == null) return '?일령';
  const bucket = Math.floor(ageDays / 10) * 10;
  return `${bucket}일`;
}

/** 레코드를 (일령구간 → 검사일 → 동물목록) 으로 그룹화 */
function groupRecords(records: TiterRecord[]) {
  const buckets: Record<string, Record<string, number[]>> = {};
  for (const r of records) {
    const bucket = ageBucket(r.age_days);
    const date = r.test_date.slice(0, 10);
    if (!buckets[bucket]) buckets[bucket] = {};
    if (!buckets[bucket][date]) buckets[bucket][date] = [];
    if (r.sp_value != null) buckets[bucket][date].push(r.sp_value);
  }
  return buckets;
}

function avg(vals: number[]): number {
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function classifyByDisease(d: Disease, val: number): 'positive' | 'suspect' | 'negative' {
  // PRRS/MH: 0.4+ 양성, 0.3~0.4 의양성, 0.3 미만 음성 (0.25 기준 삭제)
  if (d === 'PRRS' || d === 'MH') {
    if (val >= 0.4) return 'positive';
    if (val >= 0.3) return 'suspect';
    return 'negative';
  }
  // APP: 50+, 40~50?
  if (d === 'APP') {
    if (val >= 50) return 'positive';
    if (val >= 40) return 'suspect';
    return 'negative';
  }
  // SIV: <=0.6 positive, >0.6 negative (no suspect)
  if (d === 'SIV') {
    if (val <= 0.6) return 'positive';
    return 'negative';
  }
  // Lawsonia/FMD: 임계값 확정 전이므로 색상은 중립으로 둔다.
  return 'negative';
}

function cellClass(d: Disease, mean: number): string {
  const cls = classifyByDisease(d, mean);
  if (cls === 'positive') return 'bg-red-100 text-red-800 font-semibold';
  if (cls === 'suspect') return 'bg-amber-50 text-amber-700';
  return 'bg-zinc-50 text-zinc-500';
}

export function TiterTrendPanel({ farmCode, matrixAudience }: Props) {
  const [selectedDisease, setSelectedDisease] = useState<Disease>('PRRS');
  const [datePreset, setDatePreset] = useState<number>(6);
  const [records, setRecords] = useState<TiterRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isVet = matrixAudience === 'vet_assigned';
  const needsFarmSelection = !farmCode && !isVet;

  useEffect(() => {
    if (needsFarmSelection) {
      setRecords([]);
      return;
    }

    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (farmCode) params.set('farm_code', farmCode);
    params.set('disease', selectedDisease);
    if (datePreset > 0) params.set('from', isoDateMinus(datePreset));
    params.set('matrixScope', matrixAudience);

    fetch(`/api/titers?${params}`)
      .then(r => r.json())
      .then(data => setRecords(data.records ?? []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [farmCode, selectedDisease, datePreset, isVet, matrixAudience, needsFarmSelection]);

  const grouped = groupRecords(records);
  const bucketKeys = Object.keys(grouped).sort((a, b) => parseInt(a) - parseInt(b));
  // 검사일 정렬 (전체 레코드에서 유니크)
  const allDates = [...new Set(records.map(r => r.test_date.slice(0, 10)))].sort();

  return (
    <div className="space-y-3">
      {/* 필터 바 */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-200 bg-white p-3">
        {/* 질병 선택 */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-zinc-500">질병</span>
          <div className="flex rounded-md border border-zinc-200 bg-zinc-50 p-0.5">
            {DISEASES.map(d => (
              <button
                key={d}
                type="button"
                onClick={() => setSelectedDisease(d)}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  selectedDisease === d
                    ? 'bg-white text-zinc-800 shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-700'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        {/* 날짜 범위 */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-zinc-500">기간</span>
          <div className="flex rounded-md border border-zinc-200 bg-zinc-50 p-0.5">
            {DATE_PRESETS.map(p => (
              <button
                key={p.label}
                type="button"
                onClick={() => setDatePreset(p.months)}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  datePreset === p.months
                    ? 'bg-white text-zinc-800 shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {loading && <span className="text-xs text-zinc-400">불러오는 중…</span>}
        {error && <span className="text-xs text-red-500">{error}</span>}
      </div>

      {/* 데이터 없음 안내 */}
      {!loading && !error && records.length === 0 && (
        <div className="flex min-h-48 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 text-zinc-400">
          <svg className="h-8 w-8 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M3 3v18h18M7 16l4-4 4 4 4-8" />
          </svg>
          {needsFarmSelection ? (
            <>
              <p className="text-sm">왼쪽에서 농장을 선택해주세요.</p>
              <p className="text-xs">선택한 농장의 항체가 추세를 표시합니다.</p>
            </>
          ) : (
            <>
              <p className="text-sm">아직 항체가 데이터가 없습니다.</p>
              <p className="text-xs">PDF 파싱 후 DB에 등록되면 여기에 표시됩니다.</p>
            </>
          )}
        </div>
      )}

      {/* 그리드: 일령구간(행) × 검사일(열) */}
      {!loading && records.length > 0 && (
        <div className="overflow-auto rounded-lg border border-zinc-200 bg-white">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50">
                <th className="sticky left-0 z-10 bg-zinc-50 px-3 py-2 text-left font-medium text-zinc-600">
                  일령 구간
                </th>
                {allDates.map(d => (
                  <th key={d} className="px-3 py-2 text-center font-medium text-zinc-600 whitespace-nowrap">
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bucketKeys.map(bucket => (
                <tr key={bucket} className="border-b border-zinc-100 last:border-0">
                  <td className="sticky left-0 z-10 bg-white px-3 py-2 font-medium text-zinc-700 whitespace-nowrap">
                    {bucket}
                  </td>
                  {allDates.map(date => {
                    const vals = grouped[bucket]?.[date];
                    if (!vals || vals.length === 0) {
                      return <td key={date} className="px-3 py-2 text-center text-zinc-300">—</td>;
                    }
                    const mean = avg(vals);
                    return (
                      <td key={date} className={`px-3 py-2 text-center rounded ${cellClass(selectedDisease, mean)}`}>
                        <span title={`n=${vals.length}, 값: ${vals.join(', ')}`}>
                          {mean.toFixed(2)}
                          {vals.length > 1 && (
                            <span className="ml-0.5 text-[10px] opacity-60">(n={vals.length})</span>
                          )}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          {/* 범례 */}
          <div className="flex flex-wrap gap-3 border-t border-zinc-100 px-3 py-2 text-[11px] text-zinc-500">
            <span>셀 = S/P 평균값 (n &gt; 1이면 두수 표시)</span>
            {(selectedDisease === 'PRRS' || selectedDisease === 'MH') && (
              <>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-3 w-3 rounded bg-red-100" /> S/P ≥ 0.40 양성
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-3 w-3 rounded bg-amber-50 border border-amber-200" /> 0.30–0.40 의양성
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-3 w-3 rounded bg-zinc-50 border border-zinc-200" /> &lt; 0.30 음성
                </span>
              </>
            )}
            {selectedDisease === 'APP' && (
              <>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-3 w-3 rounded bg-red-100" /> ≥ 50 양성
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-3 w-3 rounded bg-amber-50 border border-amber-200" /> 40–50 의양성
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-3 w-3 rounded bg-zinc-50 border border-zinc-200" /> &lt; 40 음성
                </span>
              </>
            )}
            {selectedDisease === 'SIV' && (
              <>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-3 w-3 rounded bg-red-100" /> ≤ 0.60 양성
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-3 w-3 rounded bg-zinc-50 border border-zinc-200" /> &gt; 0.60 음성
                </span>
              </>
            )}
            {(selectedDisease === 'Lawsonia' || selectedDisease === 'FMD') && (
              <span className="text-zinc-400">임계값 미확정(색상은 참고용)</span>
            )}
          </div>
        </div>
      )}

      {/* 일령 미입력 경고 */}
      {!loading && records.some(r => r.needs_review) && (
        <p className="text-xs text-amber-600">
          ⚠ 일령이 입력되지 않은 검사 결과가 있습니다. 관리자 패널에서 일령을 입력해주세요.
        </p>
      )}
    </div>
  );
}
