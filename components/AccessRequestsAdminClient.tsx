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
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<AccessRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [driveShareWarning, setDriveShareWarning] = useState<string | null>(null);
  const [revokeBusy, setRevokeBusy] = useState<number | null>(null);

  const limit = 100;

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const data = await listAccessRequestsForAdminAction(scope, {
      limit,
      offset: page * limit,
      status: statusFilter,
    });
    if (data.error) {
      setErr(data.error);
      setRows([]);
    } else {
      setRows(data.requests);
    }
    setLoading(false);
  }, [page, scope, statusFilter]);

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
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as typeof statusFilter);
            setPage(0);
          }}
          className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-700"
          title="상태 필터"
        >
          <option value="all">상태: 전체</option>
          <option value="pending">상태: pending</option>
          <option value="approved">상태: approved</option>
          <option value="rejected">상태: rejected</option>
        </select>
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

      {scope === 'all' && (
        <div className="flex items-center justify-between gap-2 text-sm text-zinc-600">
          <div>
            페이지: <span className="font-medium">{page + 1}</span> (페이지당 {limit}개)
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              이전
            </button>
            <button
              type="button"
              disabled={rows.length < limit}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              다음
            </button>
          </div>
        </div>
      )}
      <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-base font-semibold text-zinc-900">
                {r.display_name?.trim()
                  ? `${r.display_name.trim()} · ${r.email}`
                  : `(실명 없음) · ${r.email}`}
              </p>
              {r.drive_email && (
                <p className="mt-1 text-xs text-zinc-600">
                  Drive(Gmail): <span className="font-medium">{r.drive_email}</span>
                </p>
              )}
              {r.auth_provider && (
                <p className="mt-1 text-xs text-zinc-500">
                  provider:{' '}
                  <code className="rounded bg-zinc-100 px-1 text-[11px]">{r.auth_provider}</code>
                </p>
              )}
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
