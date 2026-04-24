'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AccessRequestRow } from '@/lib/access-request-types';
import {
  listAccessRequestsForAdminAction,
  resolveAccessRequestAdminAction,
  revokeAccessApprovalAdminAction,
} from '@/lib/access-request-actions';

export function AccessRequestsAdminClient() {
  const [scope, setScope] = useState<'pending' | 'all'>('pending');
  const [rows, setRows] = useState<AccessRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [driveShareWarning, setDriveShareWarning] = useState<string | null>(null);
  const [revokeBusy, setRevokeBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const data = await listAccessRequestsForAdminAction(scope);
    if (data.error) {
      setErr(data.error);
      setRows([]);
    } else {
      setRows(data.requests);
    }
    setLoading(false);
  }, [scope]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(id: number, action: 'approve' | 'reject') {
    setActionMsg(null);
    setDriveShareWarning(null);
    const res = await resolveAccessRequestAdminAction({ id, action });
    if (res.error) {
      setErr(res.error);
      return;
    }
    setDriveShareWarning(res.driveShareWarning ?? null);
    setActionMsg(action === 'approve' ? `${res.email} 승인됨` : '거절 처리됨');
    await load();
  }

  async function revokeApproved(id: number, email: string) {
    if (
      !window.confirm(
        `${email} 의 로그인 허용을 취소합니다.\napproved_users 및 요청 상태가 거절로 바뀝니다. 계속할까요?`
      )
    ) {
      return;
    }
    setErr(null);
    setActionMsg(null);
    setDriveShareWarning(null);
    setRevokeBusy(id);
    try {
      const res = await revokeAccessApprovalAdminAction({ requestId: id });
      if (res.error) {
        setErr(res.error);
        return;
      }
      setDriveShareWarning(res.driveShareWarning ?? null);
      setActionMsg(`${res.email ?? email}: 승인 취소됨 (다시 로그인 불가)`);
      await load();
    } finally {
      setRevokeBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setScope('pending')}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            scope === 'pending' ? 'bg-zinc-900 text-white' : 'border border-zinc-300 bg-white text-zinc-700'
          }`}
        >
          대기 중
        </button>
        <button
          type="button"
          onClick={() => setScope('all')}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            scope === 'all' ? 'bg-zinc-900 text-white' : 'border border-zinc-300 bg-white text-zinc-700'
          }`}
        >
          최근 전체
        </button>
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
      {actionMsg && <p className="text-sm text-green-700">{actionMsg}</p>}
      {driveShareWarning && <p className="text-sm text-amber-800">{driveShareWarning}</p>}
      {!loading && rows.length === 0 && <p className="text-sm text-zinc-500">목록이 비어 있습니다.</p>}
      <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-base font-semibold text-zinc-900">
                {r.display_name?.trim()
                  ? `${r.display_name.trim()} · ${r.email}`
                  : `(실명 없음) · ${r.email}`}
              </p>
              {r.note && <p className="mt-1 text-xs text-zinc-500">{r.note}</p>}
              <p className="mt-1 text-xs text-zinc-400">
                {r.status} · {r.created_at}
                {r.resolved_at ? ` → ${r.resolved_at}` : ''}
                {r.resolver_email ? ` (${r.resolver_email})` : ''}
              </p>
            </div>
            {r.status === 'pending' && (
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => void act(r.id, 'approve')}
                  className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800"
                >
                  승인 (다비 전용)
                </button>
                <button
                  type="button"
                  onClick={() => void act(r.id, 'reject')}
                  className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  거절
                </button>
              </div>
            )}
            {r.status === 'approved' && (
              <div className="flex shrink-0">
                <button
                  type="button"
                  disabled={revokeBusy === r.id}
                  onClick={() => void revokeApproved(r.id, r.email)}
                  className="rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-800 hover:bg-red-100 disabled:opacity-50"
                >
                  {revokeBusy === r.id ? '처리 중…' : '승인 취소 (로그인 막기)'}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
