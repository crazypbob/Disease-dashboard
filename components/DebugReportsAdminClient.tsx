'use client';

import { useCallback, useEffect, useState } from 'react';
import type { DebugReportListItem } from '@/lib/debug-report-types';
import {
  getDebugReportDetailAdminAction,
  listDebugReportsForAdminAction,
} from '@/lib/debug-report-actions';

export function DebugReportsAdminClient() {
  const [rows, setRows] = useState<DebugReportListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [copyMsg, setCopyMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const data = await listDebugReportsForAdminAction();
    if (data.error) {
      setErr(data.error);
      setRows([]);
    } else {
      setRows(data.rows);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function copyFullMarkdown(id: number) {
    setCopyMsg(null);
    const { row, error } = await getDebugReportDetailAdminAction(id);
    if (error || !row) {
      setErr(error || '불러오기 실패');
      return;
    }
    try {
      await navigator.clipboard.writeText(row.body_markdown);
      setCopyMsg(`#${id} 전체 마크다운을 클립보드에 복사했습니다.`);
    } catch {
      setErr('클립보드 복사에 실패했습니다.');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
        >
          새로고침
        </button>
      </div>
      {loading && <p className="text-sm text-zinc-500">불러오는 중…</p>}
      {err && <p className="text-sm text-red-700">{err}</p>}
      {copyMsg && <p className="text-sm text-emerald-800">{copyMsg}</p>}
      {!loading && rows.length === 0 && <p className="text-sm text-zinc-500">접수된 리포트가 없습니다.</p>}
      <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white">
        {rows.map((r) => (
          <li key={r.id} className="space-y-2 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-zinc-900">
                  #{r.id} · {r.created_at}
                </p>
                <p className="text-sm text-zinc-700">
                  {(r.submitter_name?.trim() || '(이름 없음)') + ` · ${r.submitter_email}`}
                </p>
                {r.title && <p className="text-sm font-medium text-zinc-800">{r.title}</p>}
                <p className="mt-1 text-xs text-zinc-500">
                  {r.status}
                  {r.mail_sent_at ? ` · 메일 발송: ${r.mail_sent_at}` : ' · 메일 미발송 또는 미설정'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void copyFullMarkdown(r.id)}
                className="shrink-0 rounded-md border border-zinc-400 bg-white px-2.5 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
              >
                전체 마크다운 복사
              </button>
            </div>
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded border border-zinc-100 bg-zinc-50 p-2 text-[11px] text-zinc-700">
              {r.preview}
              {(r.preview?.length ?? 0) >= 500 ? '…' : ''}
            </pre>
          </li>
        ))}
      </ul>
    </div>
  );
}
