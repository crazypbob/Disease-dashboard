import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { authOptions } from '@/lib/auth';
import { canManageAccessRequests } from '@/lib/access-admin';
import { isInternalDabiOnly } from '@/lib/dashboard-role';
import { isApprovedSession } from '@/lib/require-approved';
import { DriveApprovalsAdminClient } from '@/components/DriveApprovalsAdminClient';

export default async function DriveApprovalsAdminPage() {
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
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-lg font-semibold text-zinc-900">Google Drive 승인(뷰어 공유)</h1>
        <div className="flex gap-3 text-sm">
          <Link href="/dashboard/admin/access" className="text-zinc-600 underline hover:text-zinc-900">
            가입 승인
          </Link>
          <Link href="/dashboard?aud=dabi&view=matrix" className="text-zinc-600 underline hover:text-zinc-900">
            대시보드
          </Link>
        </div>
      </div>
      <p className="mb-4 text-sm text-zinc-600">
        승인된 사용자 이메일이 <code className="rounded bg-zinc-100 px-1 text-xs">검사결과_PDF</code> 폴더를 볼 수 있도록
        Drive 권한(reader)을 부여했는지 확인하고, 실패 시 재시도할 수 있습니다.
      </p>
      <DriveApprovalsAdminClient />
    </div>
  );
}

