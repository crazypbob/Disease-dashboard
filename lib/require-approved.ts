import type { Session } from 'next-auth';

export function isApprovedSession(session: Session | null): boolean {
  return session?.user?.approved === true;
}

export function approvedEmailOrNull(session: Session | null): string | null {
  if (!isApprovedSession(session)) return null;
  const email = session?.user?.email?.trim().toLowerCase() ?? '';
  return email ? email : null;
}

