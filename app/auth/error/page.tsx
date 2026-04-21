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
            <strong className="text-zinc-800">접근이 거부되었습니다.</strong> Google로 로그인한 경우,
            해당 계정 이메일이 서버 환경 변수{' '}
            <code className="rounded bg-zinc-200 px-1">ALLOWED_EMAILS</code>에 포함되어 있는지
            확인하세요. (쉼표로 여러 개 등록)
          </p>
          <p className="text-xs text-zinc-500">
            로컬 개발 전용으로는 홈의 &quot;로컬 개발 로그인&quot; 버튼을 사용할 수 있습니다.
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
