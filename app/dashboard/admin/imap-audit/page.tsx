import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { AdminTabs } from '@/components/AdminTabs';
import { ImapDailyStatsAdminClient } from '@/components/ImapDailyStatsAdminClient';

export default async function ImapAuditAdminPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect('/');

  const adminEmails = (process.env.ADMIN_EMAILS ?? process.env.ALLOWED_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const isAdmin = adminEmails.length === 0 || adminEmails.includes(session.user.email.toLowerCase());
  if (!isAdmin) redirect('/dashboard');

  return (
    <div className="min-h-screen bg-zinc-50 p-4">
      <div className="mx-auto max-w-6xl space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold text-zinc-900">관리자</div>
          <AdminTabs />
        </div>
        <ImapDailyStatsAdminClient />
      </div>
    </div>
  );
}

