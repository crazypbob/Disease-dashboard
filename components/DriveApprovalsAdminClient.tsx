'use client';

import { useCallback, useEffect, useState } from 'react';
import { listDriveApprovalsAdminAction, retryDriveShareAdminAction, type DriveApprovalRow } from '@/lib/drive-approvals-actions';

export function DriveApprovalsAdminClient() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<DriveApprovalRow[]>([]);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busyEmail, setBusyEmail] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    setWarning(null);
    const res = await listDriveApprovalsAdminAction();
    if (!res.ok) {
      setErr(res.error);
      setRows([]);
      setFolderId(null);
      setLoading(false);
      return;
    }
    setRows(res.rows);
    setFolderId(res.folderId);
    setWarning(res.warning ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function retry(email: string) {
    setBusyEmail(email);
    setErr(null);
    try {
      const res = await retryDriveShareAdminAction({ email });
      if (!res.ok) {
        throw new Error(res.message || 'Drive 공유 실패');
      }
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusyEmail(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-zinc-600">
          공유 대상 폴더: {folderId ? <code className="rounded bg-zinc-100 px-1 text-xs">{folderId}</code> : '(알 수 없음)'}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
        >
          새로고침
        </button>
      </div>
      {loading && <p className="text-sm text-zinc-500">불러오는 중…</p>}
      {warning && <p className="text-sm text-amber-800">{warning}</p>}
      {err && <p className="text-sm text-red-700">{err}</p>}

      {!loading && rows.length === 0 && <p className="text-sm text-zinc-500">승인된 사용자가 없습니다.</p>}

      <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white">
        {rows.map((r) => {
          const email = (r.email ?? '').trim().toLowerCase();
          const driveEmail = (r.drive_email ?? '').trim().toLowerCase() || null;
          const targetEmail = driveEmail ?? email;
          const has = r.driveHasAccess;
          const statusLabel =
            has === null ? '확인불가' : has ? `공유됨(${r.driveAccessRole ?? 'role'})` : '미공유';
          const statusClass =
            has === null ? 'text-zinc-500' : has ? 'text-emerald-700' : 'text-amber-800';

          return (
            <li key={`${email}|${targetEmail}`} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-base font-semibold text-zinc-900">
                  {r.display_name?.trim() ? `${r.display_name.trim()} · ${email}` : email}
                </p>
                {driveEmail && (
                  <p className="mt-1 text-xs text-zinc-600">
                    Drive(Gmail): <span className="font-medium">{driveEmail}</span>
                  </p>
                )}
                <p className={`mt-1 text-xs ${statusClass}`}>{statusLabel}</p>
                <p className="mt-1 text-xs text-zinc-400">
                  role: {r.role} · approved_at: {r.created_at}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => void retry(targetEmail)}
                  disabled={busyEmail === targetEmail}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                  title="Drive 폴더 reader 공유를 재시도합니다"
                >
                  {busyEmail === targetEmail ? '재시도 중…' : 'Drive 공유 재시도'}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

