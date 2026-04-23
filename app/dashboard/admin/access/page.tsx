import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { canManageAccessRequests } from '@/lib/access-admin';
import { isInternalDabiOnly } from '@/lib/dashboard-role';
import { AccessRequestsAdminClient } from '@/components/AccessRequestsAdminClient';
import Link from 'next/link';

export default async function AccessRequestsAdminPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    redirect('/');
  }
  if (isInternalDabiOnly(session)) {
    redirect('/dashboard?aud=dabi&view=matrix');
  }
  if (!canManageAccessRequests(session.user.email)) {
    redirect('/dashboard?aud=dabi&view=matrix');
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold text-zinc-900">가입 요청 · 승인</h1>
        <div className="flex gap-3 text-sm">
          <Link
            href="/dashboard/admin/debug-reports"
            className="text-zinc-600 underline hover:text-zinc-900"
          >
            디버그 리포트
          </Link>
          <Link href="/dashboard?aud=dabi&view=matrix" className="text-zinc-600 underline hover:text-zinc-900">
            대시보드로
          </Link>
        </div>
      </div>
      <AccessRequestsAdminClient />
    </div>
  );
}
