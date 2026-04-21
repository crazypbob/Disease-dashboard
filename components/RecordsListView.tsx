'use client';

import { useEffect, useMemo, useState } from 'react';
import { farmDisplayLabel } from '@/lib/farm-display';
import { useFarmAnonymize } from '@/hooks/useFarmAnonymize';
import { formatAssayLabel } from '@/lib/assay';
import { pdfViewUrl } from '@/lib/drive';
import { parseTestResult } from '@/lib/result-display';

type RecordRow = {
  id: number;
  date: string;
  farm_code: string;
  disease: string;
  test_type: string;
  result: string;
  pdf_file_id: string | null;
};

type RecordsListViewProps = {
  farm: string | null;
  customerOnly?: boolean;
};

function toCSV(rows: RecordRow[], farmName: (c: string) => string, baseUrl = '') {
  const headers = ['날짜', '농장', '질병', '검사', '결과', '원본 링크'];
  const lines = rows.map((r) => {
    const rel = pdfViewUrl(r.id, r.pdf_file_id);
    const url = rel
      ? rel.startsWith('http')
        ? rel
        : baseUrl
          ? `${baseUrl.replace(/\/$/, '')}${rel}`
          : rel
      : null;
    const { symbol } = parseTestResult(r.result);
    return [
      r.date,
      farmName(r.farm_code),
      r.disease,
      formatAssayLabel(r.test_type),
      symbol,
      url ?? '(미등록)',
    ].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',');
  });
  const BOM = '\uFEFF';
  return BOM + [headers.map((h) => `"${h}"`).join(','), ...lines].join('\r\n');
}

export function RecordsListView({ farm, customerOnly = false }: RecordsListViewProps) {
  const { anonymized } = useFarmAnonymize();
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (farm) params.set('farm', farm);
    if (customerOnly) params.set('customerOnly', '1');
    const to = new Date();
    const from = new Date(to);
    from.setMonth(from.getMonth() - 12);
    const ymd = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };
    params.set('dateFrom', ymd(from));
    params.set('dateTo', ymd(to));
    params.set('limit', '8000');

    fetch(`/api/records?${params}`)
      .then((res) => {
        if (!res.ok) throw new Error('조회 실패');
        return res.json();
      })
      .then((data) => setRecords(data.records ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [farm, customerOnly]);

  const sorted = useMemo(
    () => [...records].sort((a, b) => b.date.localeCompare(a.date) || a.farm_code.localeCompare(b.farm_code)),
    [records]
  );

  const farmName = (code: string) => farmDisplayLabel(code, anonymized);

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

  if (records.length === 0) {
    return (
      <div className="rounded border border-dashed border-zinc-300 p-8 text-center text-zinc-500">
        검사 기록이 없습니다.
      </div>
    );
  }

  const handleExport = () => {
    const base = typeof window !== 'undefined' ? window.location.origin : '';
    const csv = toCSV(sorted, farmName, base);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `검사결과_파일링크_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const withLink = sorted.filter((r) => r.pdf_file_id).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-500">
          음성/양성 모두 클릭 시 원본 결과지로 이동. 링크 {withLink}/{sorted.length}건 등록됨.
        </p>
        <button
          type="button"
          onClick={handleExport}
          className="rounded bg-zinc-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700"
        >
          CSV 내보내기
        </button>
      </div>
      <div className="max-h-[min(70vh,720px)] overflow-auto rounded border border-zinc-200">
        <table className="min-w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-zinc-50">
            <tr>
              <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">
                날짜
              </th>
              <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">
                농장
              </th>
              <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">
                질병
              </th>
              <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">
                검사
              </th>
              <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">
                결과
              </th>
              <th className="border-b border-zinc-200 px-3 py-2 text-left text-xs font-semibold text-zinc-700">
                원본
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const url = pdfViewUrl(r.id, r.pdf_file_id);
              const { symbol, variant } = parseTestResult(r.result);
              const resultCls =
                variant === 'positive'
                  ? 'font-bold text-red-600'
                  : variant === 'negative'
                    ? 'font-bold text-emerald-600'
                    : variant === 'equivocal'
                      ? 'font-bold text-amber-600'
                      : 'text-zinc-700';

              return (
                <tr key={r.id} className="border-b border-zinc-100 hover:bg-zinc-50/80">
                  <td className="px-3 py-2 text-zinc-600">{r.date}</td>
                  <td className="px-3 py-2">{farmName(r.farm_code)}</td>
                  <td className="px-3 py-2">{r.disease}</td>
                  <td className="px-3 py-2">{formatAssayLabel(r.test_type)}</td>
                  <td className={`px-3 py-2 ${resultCls}`}>{symbol}</td>
                  <td className="px-3 py-2">
                    {url ? (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 underline decoration-blue-400 underline-offset-2 hover:text-blue-700"
                      >
                        열기
                      </a>
                    ) : (
                      <span className="text-zinc-400">미등록</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
