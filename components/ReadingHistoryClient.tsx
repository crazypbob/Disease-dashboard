'use client';

import { useEffect, useMemo, useState } from 'react';

type Item = {
  date: string | null;
  filename: string | null;
  fileId: string | null;
  farm4?: string | null;
  hasPdf: boolean;
  inOcrResults: boolean;
  dbImportedCount: number;
  dbExactPdfMatchCount?: number;
  dbPdfLinkedCount?: number;
  dbKeyMatchCount?: number;
  dbFallbackCount: number;
  hint?: string | null;
};

type ApiResponse = {
  ok: boolean;
  items: Item[];
  meta?: {
    dateLabel?: string;
    dateMeaning?: string;
    source?: string;
    generatedAt?: string;
    note?: string;
  };
};

export function ReadingHistoryClient() {
  const [items, setItems] = useState<Item[]>([]);
  const [onlyDbMissing, setOnlyDbMissing] = useState(false);
  const [limit, setLimit] = useState(500);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>('');
  const [meta, setMeta] = useState<ApiResponse['meta'] | null>(null);

  async function load() {
    setLoading(true);
    setErr('');
    try {
      const sp = new URLSearchParams();
      sp.set('limit', String(limit));
      if (onlyDbMissing) sp.set('onlyDbMissing', '1');
      const res = await fetch(`/api/admin/reading-history?${sp.toString()}`);
      const text = await res.text();
      const data = JSON.parse(text) as ApiResponse;
      if (!res.ok) throw new Error((data as any).error ?? `HTTP ${res.status}`);
      setItems(data.items ?? []);
      setMeta(data.meta ?? null);
    } catch (e) {
      setItems([]);
      setMeta(null);
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlyDbMissing, limit]);

  const dbMissingItems = useMemo(() => items.filter((x) => (x.dbImportedCount ?? 0) === 0), [items]);

  async function copyDbMissingJson() {
    const payload = {
      generatedAt: new Date().toISOString(),
      context: meta ?? {},
      description:
        'reading-history: results.xlsx 기준으로 OCR/PDF/DB 반영 여부 요약. dbImportedCount=0 인 항목이 DB X 후보.',
      dbMissing: dbMissingItems,
    };
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
  }

  return (
    <div className="mx-auto max-w-6xl space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-zinc-900">리딩 내역</div>
          <div className="text-xs text-zinc-500">
            {meta?.dateLabel ? (
              <>
                <span className="font-medium">{meta.dateLabel}</span>
                {meta.dateMeaning ? <span> — {meta.dateMeaning}</span> : null}
              </>
            ) : (
              <>왼쪽 날짜는 `results.xlsx`의 날짜 컬럼(접수일자 계열)입니다.</>
            )}
          </div>
          {meta?.note ? <div className="mt-1 text-[11px] text-zinc-400">{meta.note}</div> : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => load()}
            disabled={loading}
            className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            새로고침
          </button>
          <label className="flex items-center gap-1.5 text-xs text-zinc-700">
            <input
              type="checkbox"
              checked={onlyDbMissing}
              onChange={(e) => setOnlyDbMissing(e.target.checked)}
            />
            DB X만 보기
          </label>
          <select
            className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700"
            value={limit}
            onChange={(e) => setLimit(parseInt(e.target.value, 10))}
          >
            <option value={200}>최근 200</option>
            <option value={500}>최근 500</option>
            <option value={1000}>최근 1000</option>
          </select>
          <button
            type="button"
            onClick={copyDbMissingJson}
            className="rounded-md bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-zinc-800"
            title="DB X 후보를 JSON으로 복사 (Cursor/AI에 바로 붙여넣기용)"
          >
            DB X JSON 복사
          </button>
        </div>
      </div>

      {err && <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</div>}

      <div className="overflow-auto rounded-lg border border-zinc-200 bg-white">
        <table className="min-w-full text-xs">
          <thead className="sticky top-0 bg-zinc-50 text-zinc-600">
            <tr className="border-b border-zinc-200">
              <th className="px-3 py-2 text-left">날짜</th>
              <th className="px-3 py-2 text-left">파일</th>
              <th className="px-3 py-2 text-left">상태</th>
              <th className="px-3 py-2 text-right">DB</th>
              <th className="px-3 py-2 text-right">폴백(?)</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td className="px-3 py-3 text-zinc-400" colSpan={5}>
                  불러오는 중…
                </td>
              </tr>
            )}
            {!loading && items.length === 0 && (
              <tr>
                <td className="px-3 py-3 text-zinc-400" colSpan={5}>
                  표시할 항목이 없습니다.
                </td>
              </tr>
            )}
            {items.map((it, idx) => {
              const dbOk = (it.dbImportedCount ?? 0) > 0;
              const pdfLinked = (it.dbPdfLinkedCount ?? 0) > 0;
              const keyLinked = (it.dbKeyMatchCount ?? 0) > 0;
              const file = it.fileId ?? it.filename ?? '';
              return (
                <tr key={`${file}-${idx}`} className="border-b border-zinc-100 last:border-0">
                  <td className="whitespace-nowrap px-3 py-2 text-zinc-700">{(it.date ?? '').slice(0, 10)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-zinc-700">{file}</span>
                      {it.hasPdf && it.fileId && (
                        <a
                          className="text-[11px] font-medium text-blue-700 hover:underline"
                          href={`/api/pdf-ref?ref=${encodeURIComponent(it.fileId)}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          PDF
                        </a>
                      )}
                    </div>
                    {it.hint && <div className="mt-0.5 text-[11px] text-zinc-400">{it.hint}</div>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-zinc-600">
                    {it.hasPdf ? 'PDF✅' : 'PDF❌'} · {it.inOcrResults ? 'OCR✅' : 'OCR❌'} ·{' '}
                    {dbOk ? (
                      <>
                        DB✅
                        {!pdfLinked && keyLinked && <span className="ml-1 text-amber-700">(링크불일치)</span>}
                      </>
                    ) : (
                      'DB❌'
                    )}
                  </td>
                  <td className={`px-3 py-2 text-right font-medium ${dbOk ? 'text-green-700' : 'text-red-600'}`}>
                    {dbOk ? it.dbImportedCount : 'X'}
                  </td>
                  <td className="px-3 py-2 text-right text-zinc-600">{it.dbFallbackCount ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

