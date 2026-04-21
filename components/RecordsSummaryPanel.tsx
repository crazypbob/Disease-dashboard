'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { DISEASE_FILTER_OPTIONS, type DiseaseFilterCode, DEFAULT_DISEASES } from '@/lib/disease-filter';
import type { MatrixScope } from '@/lib/matrix-region-filters';

type ApiRow = { disease: string; tests: number; positives: number };
type ApiPayload = {
  months: 1 | 3 | 6 | 12;
  dateFrom: string;
  dateTo: string;
  matrixScope: MatrixScope;
  rows: ApiRow[];
};

const PERIODS: Array<{ key: 1 | 3 | 6 | 12; label: string }> = [
  { key: 1, label: '1개월' },
  { key: 3, label: '3개월' },
  { key: 6, label: '6개월' },
  { key: 12, label: '1년' },
];

function pct(n: number, d: number): string {
  if (d <= 0) return '-';
  return `${Math.round((n / d) * 100)}%`;
}

export function RecordsSummaryPanel() {
  const sp = useSearchParams();
  const [months, setMonths] = useState<1 | 3 | 6 | 12>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<ApiPayload | null>(null);
  const [selectedDiseases, setSelectedDiseases] = useState<Set<DiseaseFilterCode>>(new Set(DEFAULT_DISEASES));

  const matrixScope = (sp?.get('aud') ?? 'default').trim() as MatrixScope;
  const farm = (sp?.get('farm') ?? '').trim();
  const pv = (sp?.get('pv') ?? '').trim();
  const localSido = (sp?.get('localSido') ?? '').trim();
  const vet = (sp?.get('vet') ?? '').trim();

  useEffect(() => {
    const controller = new AbortController();
    const q = new URLSearchParams();
    q.set('months', String(months));
    q.set('matrixScope', matrixScope);
    if (farm) q.set('farm', farm);
    if (pv) q.set('publicVetRegion', pv);
    if (localSido) q.set('localSido', localSido);
    if (vet) q.set('vetAssignedName', vet);

    setLoading(true);
    setError('');
    fetch(`/api/summary?${q.toString()}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((j) => {
        if (j?.error) throw new Error(String(j.error));
        setData(j as ApiPayload);
      })
      .catch((e: any) => {
        if (e?.name === 'AbortError') return;
        setError(e?.message ?? String(e));
        setData(null);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [months, matrixScope, farm, pv, localSido, vet]);

  const rowsByDisease = useMemo(() => {
    const map = new Map<string, ApiRow>();
    for (const r of data?.rows ?? []) map.set(r.disease, r);
    return map;
  }, [data]);

  const visible = useMemo(() => {
    const ordered = DISEASE_FILTER_OPTIONS.filter((o) => selectedDiseases.has(o.code));
    return ordered.map((o) => {
      const r = rowsByDisease.get(o.code) ?? { disease: o.code, tests: 0, positives: 0 };
      return { code: o.code, label: o.label, ...r };
    });
  }, [rowsByDisease, selectedDiseases]);

  const totals = useMemo(() => {
    let tests = 0;
    let positives = 0;
    for (const r of visible) {
      tests += r.tests;
      positives += r.positives;
    }
    return { tests, positives };
  }, [visible]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-zinc-800">요약</span>
          {data && (
            <span className="text-xs text-zinc-500">
              {data.dateFrom} ~ {data.dateTo}
            </span>
          )}
        </div>
        <div className="flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setMonths(p.key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                months === p.key ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-600 hover:text-zinc-800'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-medium text-zinc-600">질병 선택</div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedDiseases(new Set(DEFAULT_DISEASES))}
              className="rounded border border-zinc-300 bg-white px-2 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50"
            >
              전체
            </button>
            <button
              type="button"
              onClick={() => setSelectedDiseases(new Set())}
              className="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-medium text-rose-800 hover:bg-rose-100"
            >
              모두 해제
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {DISEASE_FILTER_OPTIONS.map((o) => {
            const on = selectedDiseases.has(o.code);
            return (
              <button
                key={o.code}
                type="button"
                onClick={() => {
                  setSelectedDiseases((prev) => {
                    const next = new Set(prev);
                    if (next.has(o.code)) next.delete(o.code);
                    else next.add(o.code);
                    return next;
                  });
                }}
                className={`rounded px-2 py-1 text-xs font-medium ${
                  on ? 'bg-emerald-700 text-white' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                }`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="rounded border border-zinc-200 bg-white p-4 text-sm text-zinc-600">집계 중…</div>
      ) : error ? (
        <div className="rounded bg-red-50 p-4 text-sm text-red-700">오류: {error}</div>
      ) : (
        <div className="rounded-lg border border-zinc-200 bg-white">
          <div className="border-b border-zinc-200 px-4 py-3 text-sm text-zinc-700">
            합계: <span className="font-semibold text-zinc-900">{totals.positives}</span> 양성 /{' '}
            <span className="font-semibold text-zinc-900">{totals.tests}</span> 검사 (
            <span className="font-semibold text-zinc-900">{pct(totals.positives, totals.tests)}</span>)
          </div>
          <div className="overflow-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead className="bg-zinc-50">
                <tr>
                  <th className="border-b border-zinc-200 px-4 py-2 text-left text-xs font-semibold text-zinc-700">
                    질병
                  </th>
                  <th className="border-b border-zinc-200 px-4 py-2 text-right text-xs font-semibold text-zinc-700">
                    양성
                  </th>
                  <th className="border-b border-zinc-200 px-4 py-2 text-right text-xs font-semibold text-zinc-700">
                    검사
                  </th>
                  <th className="border-b border-zinc-200 px-4 py-2 text-right text-xs font-semibold text-zinc-700">
                    양성률
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.code} className="hover:bg-zinc-50">
                    <td className="border-b border-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900">
                      {r.label}
                    </td>
                    <td className="border-b border-zinc-100 px-4 py-2 text-right font-semibold text-rose-700">
                      {r.positives}
                    </td>
                    <td className="border-b border-zinc-100 px-4 py-2 text-right text-zinc-700">{r.tests}</td>
                    <td className="border-b border-zinc-100 px-4 py-2 text-right text-zinc-700">
                      {pct(r.positives, r.tests)}
                    </td>
                  </tr>
                ))}
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-sm text-zinc-500">
                      선택된 질병이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

