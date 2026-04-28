'use client';

import { useEffect, useState } from 'react';

type Item = {
  day: string;
  savePathFiles: number;
  auditOk: number;
  auditErr: number;
  imapOnCount: number | null;
  generatedAt: string;
  mismatch: boolean;
  notes?: string | null;
  hint?: string | null;
};

type ApiResponse = {
  ok: boolean;
  items: Item[];
  meta?: { days: number; generatedAt: string; note?: string };
};

export function ImapDailyStatsAdminClient() {
  const [items, setItems] = useState<Item[]>([]);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [meta, setMeta] = useState<ApiResponse['meta'] | null>(null);

  async function load() {
    setLoading(true);
    setErr('');
    try {
      const sp = new URLSearchParams();
      sp.set('days', String(days));
      const res = await fetch(`/api/admin/imap-daily-stats?${sp.toString()}`);
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
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  return (
    <div className="mx-auto max-w-5xl space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-zinc-900">IMAP 점검 (일별)</div>
          <div className="text-xs text-zinc-500">
            디스크(SAVE_PATH) 파일 수와 IMAP_AUDIT_LOG 기록 수를 비교합니다. mismatch가 있으면 누락/설정 문제 후보입니다.
          </div>
          {meta?.note ? <div className="mt-1 text-[11px] text-zinc-400">{meta.note}</div> : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            새로고침
          </button>
          <select
            className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700"
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value, 10))}
          >
            <option value={14}>최근 14일</option>
            <option value={30}>최근 30일</option>
            <option value={90}>최근 90일</option>
            <option value={180}>최근 180일</option>
          </select>
        </div>
      </div>

      {err && <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</div>}

      <div className="overflow-auto rounded-lg border border-zinc-200 bg-white">
        <table className="min-w-full text-xs">
          <thead className="sticky top-0 bg-zinc-50 text-zinc-600">
            <tr className="border-b border-zinc-200">
              <th className="px-3 py-2 text-left">날짜</th>
              <th className="px-3 py-2 text-right">디스크</th>
              <th className="px-3 py-2 text-right">감사 OK</th>
              <th className="px-3 py-2 text-right">감사 ERR</th>
              <th className="px-3 py-2 text-left">상태</th>
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
                  표시할 항목이 없습니다. (NAS에서 push-imap-daily-stats 실행 후 확인)
                </td>
              </tr>
            )}
            {items.map((it) => {
              const badge = it.mismatch ? 'mismatch' : 'ok';
              return (
                <tr key={it.day} className={`border-b border-zinc-100 last:border-0 ${it.mismatch ? 'bg-amber-50/40' : ''}`}>
                  <td className="whitespace-nowrap px-3 py-2 font-medium text-zinc-800">{it.day}</td>
                  <td className="px-3 py-2 text-right font-mono text-zinc-700">{it.savePathFiles}</td>
                  <td className="px-3 py-2 text-right font-mono text-zinc-700">{it.auditOk}</td>
                  <td className="px-3 py-2 text-right font-mono text-zinc-700">{it.auditErr}</td>
                  <td className="px-3 py-2 text-zinc-700">
                    <span
                      className={
                        badge === 'ok'
                          ? 'rounded bg-green-100 px-1.5 py-0.5 text-[11px] font-medium text-green-800'
                          : 'rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-900'
                      }
                    >
                      {badge === 'ok' ? 'OK' : 'MISMATCH'}
                    </span>
                    {it.hint ? <div className="mt-1 text-[11px] text-zinc-500">{it.hint}</div> : null}
                    {it.notes ? <div className="mt-0.5 text-[11px] text-zinc-400">{it.notes}</div> : null}
                    {it.mismatch ? (
                      <div className="mt-1 text-[11px] text-zinc-500">
                        복구 예: <span className="font-mono">python3 scripts/naver-imap-to-nas.py --all --since={it.day} --before=</span>
                        <span className="font-mono">
                          {(() => {
                            const d = new Date(it.day + 'T00:00:00');
                            d.setDate(d.getDate() + 1);
                            return d.toISOString().slice(0, 10);
                          })()}
                        </span>
                      </div>
                    ) : null}
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

