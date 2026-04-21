'use client';

import { signIn } from 'next-auth/react';

/**
 * NextAuth v4 + pages.signIn 커스텀 시 GET /api/auth/signin/google 링크는
 * error 쿼리에 프로바이더 id(google)가 잘못 붙어 OAuth 없이 홈으로 돌아옵니다.
 * 반드시 signIn()으로 시작해야 합니다.
 */
export function GoogleSignInButton() {
  return (
    <button
      type="button"
      onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
      className="rounded-md bg-black px-4 py-2 text-white hover:bg-zinc-800"
    >
      Google 로그인
    </button>
  );
}
