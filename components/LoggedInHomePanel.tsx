'use client';

import Link from 'next/link';
import { SignOutLinkButton } from '@/components/SignOutLinkButton';

/**
 * 루트(/) — 로그인된 사용자: 이메일 표시 + 대시보드 + 안전한 로그아웃(세션 쿠키 정리)
 */
export function LoggedInHomePanel({ email, approved }: { email: string; approved: boolean }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-5 px-4">
      <p className="text-center text-sm text-zinc-600">
        로그인됨:{' '}
        <span className="font-medium break-all text-zinc-900" title={email}>
          {email}
        </span>
      </p>
      {approved ? (
        <Link
          href="/dashboard"
          className="rounded-md bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
        >
          대시보드
        </Link>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <p className="text-center text-sm text-amber-800">
            아직 승인되지 않았습니다. 가입 신청을 제출해 주세요.
          </p>
          <Link
            href="/access-request?reason=needs_approval"
            className="rounded-md bg-amber-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-amber-700"
          >
            회원가입 신청으로
          </Link>
        </div>
      )}
      <SignOutLinkButton className="text-sm text-blue-600 underline-offset-2 hover:underline">
        로그아웃
      </SignOutLinkButton>
    </div>
  );
}
