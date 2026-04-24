'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type Props = {
  isAdmin: boolean;
  /** OWNER_EMAILS 또는 ADMIN_EMAILS — 가입 승인 화면 링크 */
  showAccessAdmin?: boolean;
};

export function AdminHeaderActions({ isAdmin, showAccessAdmin }: Props) {
  const [status, setStatus] = useState<{ loading?: string; ok?: string; err?: string }>({});

  useEffect(() => {
    if (!status.loading && !status.ok && !status.err) return;
    const t = setTimeout(() => setStatus({}), 5000);
    return () => clearTimeout(t);
  }, [status]);

  async function runImportOcr() {
    setStatus({ loading: 'OCR 결과 DB 반영 중...' });
    try {
      const res = await fetch('/api/admin/import-ocr?replace=1', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '실패');
      setStatus({
        ok: data.message ?? `DB 반영 완료: ${data.inserted ?? 0}건 삽입, ${data.updated ?? 0}건 업데이트`,
      });
      window.dispatchEvent(new CustomEvent('admin:importOcrDone'));
    } catch (e) {
      setStatus({ err: (e as Error).message });
    }
  }

  async function loadParseIssues() {
    setStatus({ loading: '판정 미해독(폴백) 목록 불러오는 중...' });
    try {
      const res = await fetch('/api/admin/parse-issues?limit=200');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '실패');
      const list = (data.issues ?? []) as Array<{
        date: string;
        farm_code: string;
        disease: string;
        test_type: string;
        result: string;
        pdf_file_id?: string | null;
      }>;
      const lines = list.map(
        (r) =>
          `${r.date} | ${r.farm_code} | ${r.disease} | ${r.test_type} | ${r.result} | ${r.pdf_file_id ?? ''}`
      );
      window.dispatchEvent(
        new CustomEvent('admin:parseIssuesLoaded', { detail: { issuesText: lines.join('\n'), count: list.length } })
      );
      setStatus({ ok: `폴백 케이스 ${list.length}건` });
    } catch (e) {
      setStatus({ err: (e as Error).message });
    }
  }

  async function loadReadingHistory() {
    // 새창(팝업)으로 전체 리딩내역 페이지를 연다.
    window.open('/dashboard/reading-history', 'readingHistory', 'width=1200,height=800');
  }

  if (!isAdmin && !showAccessAdmin) return null;

  return (
    <div className="flex flex-wrap items-center justify-end gap-2 text-sm">
      {showAccessAdmin && (
        <>
          <Link
            href="/dashboard/admin/access"
            className="rounded-md border border-zinc-400 bg-white px-2.5 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
          >
            가입 승인
          </Link>
          <Link
            href="/dashboard/admin/drive-approvals"
            className="rounded-md border border-zinc-400 bg-white px-2.5 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
          >
            Drive 승인
          </Link>
          <Link
            href="/dashboard/admin/debug-reports"
            className="rounded-md border border-zinc-400 bg-white px-2.5 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
          >
            디버그 리포트
          </Link>
        </>
      )}
      {!isAdmin ? null : (
        <>
      <span className="hidden text-xs font-medium text-amber-800 md:inline">관리자</span>
      <button
        type="button"
        onClick={runImportOcr}
        disabled={!!status.loading}
        className="rounded-md bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
        title="OCR results.xlsx를 DB에 반영합니다 (--replace: 동일 PDF·검사 행 업데이트)"
      >
        DB 새로고침
      </button>
      <button
        type="button"
        onClick={loadParseIssues}
        disabled={!!status.loading}
        title="ELISA 판정열 미해독으로 S/P 폴백한 케이스"
        className="rounded-md border border-amber-600 bg-white px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50"
      >
        폴백 목록
      </button>
      <button
        type="button"
        onClick={loadReadingHistory}
        disabled={!!status.loading}
        title="OCR 결과 파일 기준으로 PDF/OCR/DB 반영 여부를 요약합니다"
        className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
      >
        리딩내역
      </button>
      {status.loading && <span className="text-xs text-amber-700">{status.loading}</span>}
      {status.ok && <span className="text-xs text-green-700">{status.ok}</span>}
      {status.err && <span className="text-xs text-red-700">{status.err}</span>}
        </>
      )}
    </div>
  );
}

