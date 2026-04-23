'use client';

import Link from 'next/link';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function AuthErrorContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error') ?? 'unknown';

  const isAccessDenied = error === 'AccessDenied';

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-4 p-4">
      <h1 className="text-xl font-semibold text-red-600">로그인 오류</h1>
      <p className="rounded bg-red-50 p-4 text-sm text-red-800">
        <strong>오류 코드:</strong> {error}
      </p>
      {isAccessDenied ? (
        <div className="max-w-md space-y-3 text-center text-sm text-zinc-600">
          <p>
            <strong className="text-zinc-800">접근이 거부되었습니다.</strong> Google 계정으로 로그인한
            이메일이 서버에서 허용되지 않았습니다.
          </p>
          <p className="text-left text-xs leading-relaxed text-zinc-500">
            · <code className="rounded bg-zinc-200 px-1">SIGN_IN_POLICY=db_allowlist</code>인 경우:{' '}
            <code className="rounded bg-zinc-200 px-1">OWNER_EMAILS</code> /{' '}
            <code className="rounded bg-zinc-200 px-1">ALLOWED_EMAILS</code>에 있거나, DB{' '}
            <code className="rounded bg-zinc-200 px-1">approved_users</code>에 승인된 이메일이어야
            합니다. 가입 승인만 하고 Vercel에 <code className="rounded bg-zinc-200 px-1">db_allowlist</code>를
            안 넣으면 DB 승인이 반영되지 않습니다.
            <br />
            · <code className="rounded bg-zinc-200 px-1">db_allowlist</code>가 아닌(기본 open)이면서
            <code className="rounded bg-zinc-200 px-1">ALLOWED_EMAILS</code>에 사람을 넣어 둔 경우,
            **그 목록**에 있어야 합니다(여기엔 DB 승인이 자동으로 안 붙음).
            <br />· Google 로그인에 쓰는 주소는 가입 신청·승인 시 **같은 이메일**이어야 합니다.
          </p>
        </div>
      ) : (
        <p className="max-w-md text-center text-sm text-zinc-600">
          Google OAuth 설정을 확인하세요. redirect_uri가 Google Console에{' '}
          <code className="rounded bg-zinc-200 px-1">
            http://localhost:3005/api/auth/callback/google
          </code>{' '}
          로 정확히 등록되어 있는지 확인하세요. (포트가 다르면 그에 맞게 등록)
        </p>
      )}
      <Link
        href="/"
        className="rounded-md bg-black px-4 py-2 text-white hover:bg-zinc-800"
      >
        로그인 페이지로
      </Link>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-full flex-col items-center justify-center p-4 text-zinc-500">
          로딩 중…
        </div>
      }
    >
      <AuthErrorContent />
    </Suspense>
  );
}
