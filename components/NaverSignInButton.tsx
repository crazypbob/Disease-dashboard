'use client';

import { signIn } from 'next-auth/react';

export function NaverSignInButton() {
  return (
    <button
      type="button"
      onClick={() => signIn('naver', { callbackUrl: '/dashboard' })}
      className="rounded-md bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700"
    >
      네이버 로그인
    </button>
  );
}

