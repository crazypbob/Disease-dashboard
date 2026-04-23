import Link from 'next/link';
import { headers } from 'next/headers';
import { getServerSession } from 'next-auth';
import { authOptions, isLocalHostHeader } from '@/lib/auth';
import { GoogleSignInButton } from '@/components/GoogleSignInButton';
import { LocalDevSignInButton } from '@/components/LocalDevSignInButton';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; error_description?: string }>;
}) {
  const session = await getServerSession(authOptions);
  const headerList = await headers();
  const showLocalDev =
    process.env.NODE_ENV === 'development' && isLocalHostHeader(headerList.get('host') ?? undefined);
  const params = await searchParams;
  const { error, error_description } = params;

  // OAuth 오류 시 상세 파라미터 로그 (원인 파악용)
  if (error && process.env.NODE_ENV === 'development') {
    console.log('[OAuth error params]', Object.fromEntries(Object.entries(params)));
  }

  if (session?.user) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-4">
        <p className="text-zinc-600">로그인됨: {session.user.email}</p>
        <Link
          href="/dashboard"
          className="rounded-md bg-black px-4 py-2 text-white hover:bg-zinc-800"
        >
          대시보드
        </Link>
        <Link
          href="/api/auth/signout"
          className="text-sm text-zinc-500 hover:underline"
        >
          로그아웃
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-4">
      <h1 className="text-xl font-semibold">질병메일링 대시보드</h1>
      {error && (
        <div className="rounded bg-red-50 px-4 py-3 text-sm text-red-700">
          <p className="font-medium">로그인 실패: {error}</p>
          {error_description && (
            <p className="mt-2 text-xs text-red-600 break-all">
              Google 상세: {decodeURIComponent(error_description.replace(/\+/g, ' '))}
            </p>
          )}
          <p className="mt-2 text-zinc-600">
            리디렉션 URI가 Google Console에 <code className="rounded bg-red-100 px-1">http://localhost:3005/api/auth/callback/google</code> 로 등록되어 있는지 확인하세요.
          </p>
        </div>
      )}
      <div className="flex w-full max-w-sm flex-col items-stretch gap-4">
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
          <p className="mb-3 text-center text-sm text-zinc-600">
            처음이신가요? Google 계정으로 신청 후, 관리자 승인이 나면 같은 계정으로 로그인합니다.
          </p>
          <Link
            href="/access-request"
            className="block w-full rounded-md border border-zinc-800 bg-white py-2.5 text-center text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50"
          >
            회원가입 (Google 계정 · 승인 후 이용)
          </Link>
        </div>
        <div className="relative text-center text-xs text-zinc-500">
          <span className="bg-white px-2">또는</span>
          <div className="absolute left-0 right-0 top-1/2 -z-10 h-px bg-zinc-200" aria-hidden />
        </div>
        <p className="text-center text-xs font-medium text-zinc-600">이미 승인된 계정</p>
        <GoogleSignInButton />
        {showLocalDev && (
          <>
            <p className="max-w-sm text-center text-xs text-zinc-500">
              Google 콘솔·리디렉션 URI 없이 로컬에서만 테스트할 때 사용합니다. 프로덕션에는 포함되지
              않습니다.
            </p>
            <LocalDevSignInButton />
          </>
        )}
      </div>
    </div>
  );
}

