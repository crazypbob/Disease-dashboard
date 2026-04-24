import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { canManageAccessRequests } from '@/lib/access-admin';
import { isInternalDabiOnly } from '@/lib/dashboard-role';
import { AccessRequestsAdminClient } from '@/components/AccessRequestsAdminClient';
import Link from 'next/link';
import { isApprovedSession } from '@/lib/require-approved';
import { AdminTabs } from '@/components/AdminTabs';

export default async function AccessRequestsAdminPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    redirect('/');
  }
  if (!isApprovedSession(session)) {
    redirect('/access-request?reason=needs_approval');
  }
  if (isInternalDabiOnly(session)) {
    redirect('/dashboard?aud=dabi&view=matrix');
  }
  if (!canManageAccessRequests(session.user.email)) {
    redirect('/dashboard?aud=dabi&view=matrix');
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-lg font-semibold text-zinc-900">가입 요청 · 승인</h1>
        <AdminTabs />
      </div>
      <AccessRequestsAdminClient />
    </div>
  );
}
