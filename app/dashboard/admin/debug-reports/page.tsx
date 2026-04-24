import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { canManageAccessRequests } from '@/lib/access-admin';
import { isInternalDabiOnly } from '@/lib/dashboard-role';
import { DebugReportsAdminClient } from '@/components/DebugReportsAdminClient';
import { isApprovedSession } from '@/lib/require-approved';
import { AdminTabs } from '@/components/AdminTabs';

export default async function DebugReportsAdminPage() {
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
        <h1 className="text-lg font-semibold text-zinc-900">디버그 리포트 (매트릭스 검증 전송)</h1>
        <AdminTabs />
      </div>
      <p className="mb-4 text-sm text-zinc-600">
        매트릭스 검증 모드에서 「관리자에게 전송」으로 DB에 접수된 내역입니다. 메일 사본은 제목{' '}
        <code className="rounded bg-zinc-100 px-1 text-xs">[DiseaseDashboard:Verify]</code> 패턴으로 옵니다. Gmail에서
        한꺼번에 모으려면 로컬에서{' '}
        <code className="rounded bg-zinc-100 px-1 text-xs">npm run dump:debug-gmail</code> → 생성된 텍스트를 Cursor에
        넘기면 됩니다. 항목별 「전체 마크다운 복사」는 고급 용도입니다.
      </p>
      <DebugReportsAdminClient />
    </div>
  );
}
