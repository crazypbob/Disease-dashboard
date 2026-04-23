import type { JWT } from 'next-auth/jwt';
import type { Session } from 'next-auth';

export type DashboardRole = 'owner' | 'internal_dabi';

export type SignInPolicy = 'open' | 'db_allowlist';

export function getSignInPolicy(): SignInPolicy {
  return process.env.SIGN_IN_POLICY === 'db_allowlist' ? 'db_allowlist' : 'open';
}

export function parseOwnerEmailSet(): Set<string> {
  return new Set(
    (process.env.OWNER_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isOwnerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return parseOwnerEmailSet().has(email.trim().toLowerCase());
}

export function sessionDashboardRole(session: Session | null): DashboardRole {
  const r = session?.user?.role;
  if (r === 'internal_dabi') return 'internal_dabi';
  return 'owner';
}

export function tokenDashboardRole(token: JWT): DashboardRole {
  const r = token.role;
  if (r === 'internal_dabi') return 'internal_dabi';
  return 'owner';
}

export function isInternalDabiOnly(session: Session | null): boolean {
  return sessionDashboardRole(session) === 'internal_dabi';
}
