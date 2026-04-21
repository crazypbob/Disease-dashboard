'use client';

import { signIn } from 'next-auth/react';

/**
 * `next dev` + localhost에서만 표시. Google OAuth 없이 Credentials 세션 발급.
 * 프로덕션 빌드에는 프로바이더 자체가 없음.
 */
export function LocalDevSignInButton() {
  return (
    <button
      type="button"
      onClick={() => signIn('dev-local', { callbackUrl: '/dashboard' })}
      className="rounded-md border border-amber-600 bg-amber-50 px-4 py-2 text-sm text-amber-900 hover:bg-amber-100"
    >
      로컬 개발 로그인 (Google 없이)
    </button>
  );
}
