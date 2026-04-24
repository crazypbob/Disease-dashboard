import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { DashboardPageClient } from '@/components/DashboardPageClient';
import { AdminHeaderActions } from '@/components/AdminHeaderActions';
import { LoginAudienceSelector } from '@/components/LoginAudienceSelector';
import Link from 'next/link';
import { DashboardHomeLink } from '@/components/DashboardHomeLink';
import { redirect } from 'next/navigation';
import { sessionDashboardRole } from '@/lib/dashboard-role';
import { canManageAccessRequests } from '@/lib/access-admin';
import { isApprovedSession } from '@/lib/require-approved';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ farm?: string; aud?: string; view?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (session?.user && !isApprovedSession(session)) {
    redirect('/access-request?reason=needs_approval');
  }
  const params = await searchParams;
  if (!params.aud && !params.view) {
    redirect('/dashboard?aud=dabi&view=matrix');
  }

  const role = sessionDashboardRole(session);
  const aud = (params.aud ?? '').trim();
  if (role === 'internal_dabi' && aud && aud !== 'dabi') {
    const view =
      params.view === 'map' || params.view === 'titer' || params.view === 'summary' || params.view === 'matrix'
        ? params.view
        : 'matrix';
    redirect(`/dashboard?aud=dabi&view=${view}`);
  }

  const farm = params.farm?.trim() || null;

  const adminEmails = (process.env.ADMIN_EMAILS ?? process.env.ALLOWED_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const isAdmin =
    session?.user?.email &&
    (adminEmails.length === 0 || adminEmails.includes(session.user.email.toLowerCase()));

  const showAccessAdmin = canManageAccessRequests(session?.user?.email);
  const restrictAudienceSwitcher = role === 'internal_dabi';

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-14 items-center justify-between border-b border-zinc-200 px-4">
        <div className="flex items-center gap-3">
          <DashboardHomeLink className="text-lg font-semibold hover:underline" />
          {!restrictAudienceSwitcher && <LoginAudienceSelector />}
          <AdminHeaderActions isAdmin={!!isAdmin} showAccessAdmin={showAccessAdmin} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-zinc-500">{session?.user?.email}</span>
          <Link
            href="/api/auth/signout"
            className="text-sm text-red-600 hover:underline"
          >
            로그아웃
          </Link>
        </div>
      </header>

      <DashboardPageClient farm={farm} isAdmin={!!isAdmin} restrictAudienceSwitcher={restrictAudienceSwitcher} />
    </div>
  );
}
