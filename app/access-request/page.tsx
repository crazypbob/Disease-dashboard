import Link from 'next/link';
import { AccessRequestForm } from '@/components/AccessRequestForm';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export default async function AccessRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const session = await getServerSession(authOptions);
  const params = await searchParams;
  const reason = (params.reason ?? '').trim();

  const email = session?.user?.email ?? '';
  const name = session?.user?.name ?? '';
  const provider = session?.user?.provider ?? null;
  const approved = session?.user?.approved ?? false;

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4 py-12">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">회원가입 (사내 접근 신청)</h1>
        <p className="mt-2 text-sm text-zinc-600">
          <strong>실명</strong>과 로그인에 쓸 <strong>이메일</strong>을 적어 주세요. 관리자가 승인하면 해당
          계정으로 대시보드를 사용할 수 있습니다.
        </p>
      </div>
      {reason === 'needs_approval' && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          로그인은 되었지만 아직 승인이 필요합니다. 아래 신청을 제출해 주세요.
        </p>
      )}
      {approved && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          이미 승인된 계정입니다. <Link className="underline" href="/dashboard">대시보드로 이동</Link>할 수 있습니다.
        </p>
      )}
      <AccessRequestForm initialEmail={email} initialLegalName={name} authProvider={provider} />
      <p className="text-center text-sm">
        <Link href="/" className="text-zinc-600 underline hover:text-zinc-900">
          로그인 화면으로
        </Link>
      </p>
    </div>
  );
}
