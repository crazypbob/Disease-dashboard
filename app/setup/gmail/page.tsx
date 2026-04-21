'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';

function SetupContent() {
  const searchParams = useSearchParams();
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const success = searchParams.get('success');
  const refreshToken = searchParams.get('refresh_token');
  const errParam = searchParams.get('error');

  useEffect(() => {
    if (errParam) {
      const messages: Record<string, string> = {
        no_code: '인증 코드가 없습니다.',
        no_refresh_token: 'refresh_token을 받지 못했습니다. consent 화면에서 허용했는지 확인하세요.',
        access_denied: '접근이 거부되었습니다.',
      };
      setError(messages[errParam] ?? errParam);
    }
  }, [errParam]);

  useEffect(() => {
    fetch('/api/setup/gmail/auth-url')
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) {
          setError(data.error ?? 'URL 생성 실패');
          return;
        }
        setAuthUrl(data.url ?? null);
      })
      .catch(() => setError('연결에 실패했습니다.'));
  }, []);

  if (success === '1' && refreshToken) {
    return (
      <div className="mx-auto max-w-xl space-y-4 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-bold text-zinc-800">Gmail 연결 완료</h1>
        <p className="text-sm text-zinc-600">
          아래 값을 <code className="rounded bg-zinc-100 px-1">.env.local</code>에 추가하세요.
        </p>
        <pre className="overflow-x-auto rounded bg-zinc-100 p-4 text-xs">
          {`GMAIL_REFRESH_TOKEN=${refreshToken}`}
        </pre>
        <p className="text-xs text-amber-600">
          이 토큰은 한 번만 표시됩니다. 안전하게 보관하세요.
        </p>
        <Link
          href="/dashboard"
          className="inline-block text-sm text-blue-600 hover:underline"
        >
          ← 대시보드로
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-4 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
      <h1 className="text-lg font-bold text-zinc-800">Gmail 연결 설정</h1>
      <p className="text-sm text-zinc-600">
        메일 파이프라인(검사결과 PDF 자동 수집)을 위해 Gmail 접근 권한이 필요합니다.
      </p>
      {error && (
        <div className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}
      <p className="text-xs text-zinc-500">
        사전 요구: .env.local에 GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET 설정. (Google Cloud
        Console에서 Gmail·Drive API 활성화 후 OAuth 클라이언트 생성)
      </p>
      {authUrl ? (
        <a
          href={authUrl}
          className="inline-block rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Gmail 연결하기
        </a>
      ) : (
        <p className="text-sm text-zinc-500">연결 URL을 불러오는 중...</p>
      )}
      <Link
        href="/dashboard"
        className="ml-4 inline-block text-sm text-zinc-500 hover:underline"
      >
        대시보드로
      </Link>
    </div>
  );
}

export default function SetupGmailPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
      <Suspense fallback={<div className="text-zinc-500">로딩 중...</div>}>
        <SetupContent />
      </Suspense>
    </div>
  );
}
