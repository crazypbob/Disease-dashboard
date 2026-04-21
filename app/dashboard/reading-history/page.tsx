import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { ReadingHistoryClient } from '@/components/ReadingHistoryClient';

export default async function ReadingHistoryPage() {
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
      <ReadingHistoryClient />
    </div>
  );
}

