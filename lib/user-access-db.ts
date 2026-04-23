import { sql } from '@/lib/db';
import type { DashboardRole } from '@/lib/dashboard-role';
import type { AccessRequestRow } from '@/lib/access-request-types';

export type { AccessRequestRow } from '@/lib/access-request-types';

export async function selectApprovedDashboardRole(
  emailLower: string
): Promise<DashboardRole | null> {
  const rows = (await sql`
    SELECT dashboard_role AS role
    FROM approved_users
    WHERE lower(email) = ${emailLower}
    LIMIT 1
  `) as { role: string }[];
  const r = rows[0]?.role;
  if (r === 'owner' || r === 'internal_dabi') return r;
  return null;
}

export async function listPendingAccessRequests(): Promise<AccessRequestRow[]> {
  return (await sql`
    SELECT id, email, display_name, note, status, created_at::text, resolved_at::text, resolver_email
    FROM access_requests
    WHERE status = 'pending'
    ORDER BY created_at ASC
  `) as AccessRequestRow[];
}

export async function listRecentAccessRequests(limit = 50): Promise<AccessRequestRow[]> {
  return (await sql`
    SELECT id, email, display_name, note, status, created_at::text, resolved_at::text, resolver_email
    FROM access_requests
    ORDER BY created_at DESC
    LIMIT ${limit}
  `) as AccessRequestRow[];
}

export async function hasPendingRequestForEmail(emailLower: string): Promise<boolean> {
  const rows = (await sql`
    SELECT 1 AS ok
    FROM access_requests
    WHERE lower(email) = ${emailLower} AND status = 'pending'
    LIMIT 1
  `) as { ok: number }[];
  return rows.length > 0;
}

export async function insertAccessRequest(input: {
  email: string;
  displayName: string | null;
  note: string | null;
}): Promise<void> {
  await sql`
    INSERT INTO access_requests (email, display_name, note)
    VALUES (${input.email}, ${input.displayName}, ${input.note})
  `;
}

export async function resolveAccessRequest(input: {
  id: number;
  status: 'approved' | 'rejected';
  resolverEmail: string;
  dashboardRole: DashboardRole;
}): Promise<{ email: string } | null> {
  const rows = (await sql`
    UPDATE access_requests
    SET status = ${input.status},
        resolved_at = NOW(),
        resolver_email = ${input.resolverEmail}
    WHERE id = ${input.id} AND status = 'pending'
    RETURNING email
  `) as { email: string }[];
  if (!rows.length) return null;
  const email = rows[0].email.trim().toLowerCase();
  if (input.status === 'approved') {
    await sql`
      INSERT INTO approved_users (email, dashboard_role, source_request_id)
      VALUES (${email}, ${input.dashboardRole}, ${input.id})
      ON CONFLICT (email) DO UPDATE SET
        dashboard_role = EXCLUDED.dashboard_role,
        source_request_id = EXCLUDED.source_request_id
    `;
  }
  return { email };
}
