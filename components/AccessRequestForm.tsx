'use client';

import { useActionState } from 'react';
import { submitAccessRequestAction, type SubmitAccessRequestState } from '@/lib/access-request-actions';

const initial: SubmitAccessRequestState = {};

export function AccessRequestForm({
  initialEmail,
  initialLegalName,
  authProvider,
}: {
  initialEmail?: string;
  initialLegalName?: string;
  authProvider?: string | null;
}) {
  const [state, formAction, pending] = useActionState(submitAccessRequestAction, initial);
  const provider = (authProvider ?? '').trim().toLowerCase();
  const needsDriveGmail = provider === 'naver';

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <input type="hidden" name="authProvider" value={provider} />
      <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
        승인 후 로그인할 <strong>같은 계정 이메일</strong>과 아래 이메일이 <strong>동일</strong>해야 합니다.
      </p>
      <label className="block text-sm">
        <span className="font-medium text-zinc-700">이메일 (로그인에 쓸 주소)</span>
        <input
          type="email"
          name="email"
          required
          className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
          autoComplete="email"
          defaultValue={initialEmail ?? ''}
        />
      </label>
      <label className="block text-sm">
        <span className="font-medium text-zinc-700">실명</span>
        <input
          type="text"
          name="legalName"
          required
          minLength={2}
          maxLength={200}
          placeholder="관리자 승인 시 본인 확인용"
          className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
          autoComplete="name"
          defaultValue={initialLegalName ?? ''}
        />
      </label>
      {needsDriveGmail && (
        <label className="block text-sm">
          <span className="font-medium text-zinc-700">Google Drive용 Gmail (필수)</span>
          <input
            type="email"
            name="driveEmail"
            required
            className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
            autoComplete="email"
            placeholder="예: someone@gmail.com"
          />
          <p className="mt-1 text-xs text-zinc-500">
            네이버 로그인 계정과 별개로, PDF 뷰어(Drive) 권한 부여에 사용할 Gmail 주소입니다.
          </p>
        </label>
      )}
      <label className="block text-sm">
        <span className="font-medium text-zinc-700">메모 (선택)</span>
        <textarea name="note" rows={3} className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm" />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
      >
        신청 보내기
      </button>
      {state.ok && (
        <p className="text-sm text-green-700">접수되었습니다. 관리자 승인 후 같은 계정으로 로그인해 주세요.</p>
      )}
      {state.error && <p className="text-sm text-red-700">{state.error}</p>}
    </form>
  );
}
