import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? process.env.ALLOWED_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  if (ADMIN_EMAILS.length === 0) return true;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { runMailPipeline } = await import('@/lib/mail-pipeline/run');
    const result = await runMailPipeline();
    return NextResponse.json(result);
  } catch (e) {
    console.error('[admin cron-gmail]', e);
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
