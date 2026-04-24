import { sql } from '@/lib/db';
import type { DashboardRole } from '@/lib/dashboard-role';
import type { AccessRequestRow } from '@/lib/access-request-types';

export type { AccessRequestRow } from '@/lib/access-request-types';

export type ApprovedUserRow = {
  email: string;
  role: DashboardRole;
  created_at: string;
  source_request_id: number | null;
  display_name: string | null;
  drive_email: string | null;
  auth_provider: string | null;
};

export async function listApprovedUsers(limit = 200): Promise<ApprovedUserRow[]> {
  const lim = Math.min(Math.max(limit, 1), 1000);
  try {
    return (await sql`
      SELECT
        au.email,
        au.dashboard_role AS role,
        au.created_at::text,
        au.source_request_id,
        ar.display_name,
        au.drive_email,
        au.auth_provider
      FROM approved_users au
      LEFT JOIN access_requests ar ON ar.id = au.source_request_id
      ORDER BY au.created_at DESC
      LIMIT ${lim}
    `) as ApprovedUserRow[];
  } catch (e) {
    const code = (e as { code?: string } | null)?.code;
    // 운영 DB에 2026-04-24_access_drive_email.sql이 아직 적용되지 않은 경우(undef column)
    if (code === '42703') {
      const legacy = (await sql`
        SELECT
          au.email,
          au.dashboard_role AS role,
          au.created_at::text,
          au.source_request_id,
          ar.display_name
        FROM approved_users au
        LEFT JOIN access_requests ar ON ar.id = au.source_request_id
        ORDER BY au.created_at DESC
        LIMIT ${lim}
      `) as Array<{
        email: string;
        role: DashboardRole;
        created_at: string;
        source_request_id: number | null;
        display_name: string | null;
      }>;
      return legacy.map((r) => ({ ...r, drive_email: null, auth_provider: null }));
    }
    throw e;
  }
}

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
  try {
    return (await sql`
      SELECT id, email, display_name, drive_email, auth_provider, note, status, created_at::text, resolved_at::text, resolver_email
      FROM access_requests
      WHERE status = 'pending'
      ORDER BY created_at ASC
    `) as AccessRequestRow[];
  } catch (e) {
    const code = (e as { code?: string } | null)?.code;
    if (code === '42703') {
      return (await sql`
        SELECT id, email, display_name, note, status, created_at::text, resolved_at::text, resolver_email
        FROM access_requests
        WHERE status = 'pending'
        ORDER BY created_at ASC
      `) as AccessRequestRow[];
    }
    throw e;
  }
}

export async function listRecentAccessRequests(limit = 50): Promise<AccessRequestRow[]> {
  try {
    return (await sql`
      SELECT id, email, display_name, drive_email, auth_provider, note, status, created_at::text, resolved_at::text, resolver_email
      FROM access_requests
      ORDER BY created_at DESC
      LIMIT ${limit}
    `) as AccessRequestRow[];
  } catch (e) {
    const code = (e as { code?: string } | null)?.code;
    if (code === '42703') {
      return (await sql`
        SELECT id, email, display_name, note, status, created_at::text, resolved_at::text, resolver_email
        FROM access_requests
        ORDER BY created_at DESC
        LIMIT ${limit}
      `) as AccessRequestRow[];
    }
    throw e;
  }
}

export async function getAccessRequestById(id: number): Promise<AccessRequestRow | null> {
  let rows: AccessRequestRow[];
  try {
    rows = (await sql`
      SELECT id, email, display_name, drive_email, auth_provider, note, status, created_at::text, resolved_at::text, resolver_email
      FROM access_requests
      WHERE id = ${id}
      LIMIT 1
    `) as AccessRequestRow[];
  } catch (e) {
    const code = (e as { code?: string } | null)?.code;
    if (code !== '42703') throw e;
    rows = (await sql`
      SELECT id, email, display_name, note, status, created_at::text, resolved_at::text, resolver_email
      FROM access_requests
      WHERE id = ${id}
      LIMIT 1
    `) as AccessRequestRow[];
  }
  return rows[0] ?? null;
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
  driveEmail?: string | null;
  authProvider?: string | null;
  note: string | null;
}): Promise<void> {
  try {
    await sql`
      INSERT INTO access_requests (email, display_name, drive_email, auth_provider, note)
      VALUES (${input.email}, ${input.displayName}, ${input.driveEmail ?? null}, ${input.authProvider ?? null}, ${input.note})
    `;
  } catch (e) {
    const code = (e as { code?: string } | null)?.code;
    if (code === '42703') {
      await sql`
        INSERT INTO access_requests (email, display_name, note)
        VALUES (${input.email}, ${input.displayName}, ${input.note})
      `;
      return;
    }
    throw e;
  }
}

export async function resolveAccessRequest(input: {
  id: number;
  status: 'approved' | 'rejected';
  resolverEmail: string;
  dashboardRole: DashboardRole;
}): Promise<{ email: string; driveEmail: string | null } | null> {
  let rows: Array<{ email: string; drive_email: string | null; auth_provider: string | null }>;
  try {
    rows = (await sql`
      UPDATE access_requests
      SET status = ${input.status},
          resolved_at = NOW(),
          resolver_email = ${input.resolverEmail}
      WHERE id = ${input.id} AND status = 'pending'
      RETURNING email, drive_email, auth_provider
    `) as { email: string; drive_email: string | null; auth_provider: string | null }[];
  } catch (e) {
    const code = (e as { code?: string } | null)?.code;
    if (code !== '42703') throw e;
    rows = (await sql`
      UPDATE access_requests
      SET status = ${input.status},
          resolved_at = NOW(),
          resolver_email = ${input.resolverEmail}
      WHERE id = ${input.id} AND status = 'pending'
      RETURNING email
    `) as unknown as Array<{ email: string; drive_email: string | null; auth_provider: string | null }>;
    // legacy schema: drive_email/auth_provider 없음
    rows = rows.map((r) => ({ ...r, drive_email: null, auth_provider: null }));
  }
  if (!rows.length) return null;
  const email = rows[0].email.trim().toLowerCase();
  const driveEmail = (rows[0].drive_email ?? '').trim().toLowerCase() || null;
  const provider = (rows[0].auth_provider ?? '').trim().toLowerCase() || null;
  if (input.status === 'approved') {
    try {
      await sql`
        INSERT INTO approved_users (email, dashboard_role, source_request_id, drive_email, auth_provider)
        VALUES (${email}, ${input.dashboardRole}, ${input.id}, ${driveEmail}, ${provider})
        ON CONFLICT (email) DO UPDATE SET
          dashboard_role = EXCLUDED.dashboard_role,
          source_request_id = EXCLUDED.source_request_id,
          drive_email = EXCLUDED.drive_email,
          auth_provider = EXCLUDED.auth_provider
      `;
    } catch (e) {
      const code = (e as { code?: string } | null)?.code;
      if (code === '42703') {
        await sql`
          INSERT INTO approved_users (email, dashboard_role, source_request_id)
          VALUES (${email}, ${input.dashboardRole}, ${input.id})
          ON CONFLICT (email) DO UPDATE SET
            dashboard_role = EXCLUDED.dashboard_role,
            source_request_id = EXCLUDED.source_request_id
        `;
      } else {
        throw e;
      }
    }
  }
  return { email, driveEmail };
}

/** 승인 취소: approved_users에서 제거 + access_requests 를 rejected 로 (로그인 불가) */
export async function revokeAccessApprovalByRequestId(input: {
  requestId: number;
  resolverEmail: string;
}): Promise<{ email: string; driveEmail: string | null } | null> {
  const rows = (await sql`
    SELECT id, email, status
    FROM access_requests
    WHERE id = ${input.requestId}
    LIMIT 1
  `) as { id: number; email: string; status: string }[];
  if (!rows.length) return null;
  const row = rows[0];
  if (row.status !== 'approved') return null;
  const email = row.email.trim().toLowerCase();

  let driveEmail: string | null = null;
  try {
    const driveRows = (await sql`
      SELECT drive_email
      FROM approved_users
      WHERE lower(email) = ${email}
      LIMIT 1
    `) as { drive_email: string | null }[];
    driveEmail = (driveRows[0]?.drive_email ?? '').trim().toLowerCase() || null;
  } catch (e) {
    const code = (e as { code?: string } | null)?.code;
    if (code !== '42703') throw e;
    driveEmail = null;
  }

  await sql`DELETE FROM approved_users WHERE lower(email) = ${email}`;
  await sql`
    UPDATE access_requests
    SET status = 'rejected',
        resolved_at = NOW(),
        resolver_email = ${input.resolverEmail}
    WHERE id = ${input.requestId}
  `;
  return { email, driveEmail };
}
