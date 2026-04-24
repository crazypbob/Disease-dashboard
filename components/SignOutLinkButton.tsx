'use client';

import { signOut } from 'next-auth/react';

type Props = {
  children: React.ReactNode;
  className?: string;
  callbackUrl?: string;
};

/**
 * signOut() 기반 — GET /api/auth/signout 링크보다 세션·쿠키 정리에 안정적
 */
export function SignOutLinkButton({ children, className, callbackUrl = '/' }: Props) {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl })}
      className={className}
    >
      {children}
    </button>
  );
}
