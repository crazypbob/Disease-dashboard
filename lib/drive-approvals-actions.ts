'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { canManageAccessRequests } from '@/lib/access-admin';
import { listApprovedUsers, type ApprovedUserRow } from '@/lib/user-access-db';
import { isApprovedSession } from '@/lib/require-approved';
import { grantReaderOnPdfLibraryFolder } from '@/lib/drive-share-approved';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/mail-pipeline/google-auth';
import { resolvePdfLibraryFolderIdForSharing } from '@/lib/drive-share-folder';

export type DriveApprovalRow = ApprovedUserRow & {
  driveHasAccess: boolean | null;
  driveAccessRole: string | null;
};

async function assertDriveAdmin(): Promise<void> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) throw new Error('Unauthorized');
  if (!isApprovedSession(session)) throw new Error('Forbidden');
  if (!canManageAccessRequests(session.user.email)) throw new Error('Forbidden');
}

async function listFolderPermissionEmailMap(folderId: string): Promise<Map<string, string>> {
  const auth = getGoogleAuth();
  const drive = google.drive({ version: 'v3', auth });
  const supportsAllDrives =
    (process.env.DRIVE_USE_SHARED_DRIVES ?? '').trim().toLowerCase() === '1' ||
    (process.env.DRIVE_USE_SHARED_DRIVES ?? '').trim().toLowerCase() === 'true' ||
    (process.env.DRIVE_USE_SHARED_DRIVES ?? '').trim().toLowerCase() === 'yes';
  const permOpts = supportsAllDrives ? { supportsAllDrives: true } : {};

  let pageToken: string | undefined;
  const map = new Map<string, string>();
  do {
    const res = await drive.permissions.list({
      fileId: folderId,
      fields: 'nextPageToken, permissions(emailAddress,type,role)',
      pageToken,
      pageSize: 100,
      ...permOpts,
    });
    for (const p of res.data.permissions ?? []) {
      const email = (p.emailAddress ?? '').trim().toLowerCase();
      if (!email) continue;
      if (p.type !== 'user') continue;
      map.set(email, p.role ?? 'unknown');
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return map;
}

export async function listDriveApprovalsAdminAction(): Promise<{
  ok: true;
  folderId: string | null;
  rows: DriveApprovalRow[];
  warning?: string;
} | { ok: false; error: string }> {
  try {
    await assertDriveAdmin();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const approved = await listApprovedUsers(300);

  let folderId: string | null = null;
  try {
    folderId = await resolvePdfLibraryFolderIdForSharing();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: true,
      folderId: null,
      rows: approved.map((r) => ({ ...r, driveHasAccess: null, driveAccessRole: null })),
      warning: `Drive 폴더 ID를 해석할 수 없습니다: ${msg}`,
    };
  }

  let permMap: Map<string, string> | null = null;
  try {
    permMap = await listFolderPermissionEmailMap(folderId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: true,
      folderId,
      rows: approved.map((r) => ({ ...r, driveHasAccess: null, driveAccessRole: null })),
      warning: `Drive 권한 목록을 불러오지 못했습니다: ${msg}`,
    };
  }

  const rows: DriveApprovalRow[] = approved.map((r) => {
    const targetEmail = (r.drive_email ?? r.email ?? '').trim().toLowerCase();
    const role = targetEmail ? (permMap?.get(targetEmail) ?? null) : null;
    return { ...r, driveHasAccess: role !== null, driveAccessRole: role };
  });

  return { ok: true, folderId, rows };
}

export async function retryDriveShareAdminAction(input: { email: string }): Promise<{
  ok: boolean;
  message?: string;
}> {
  try {
    await assertDriveAdmin();
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
  const email = String(input.email ?? '').trim().toLowerCase();
  if (!email) return { ok: false, message: '이메일이 비어 있습니다.' };

  const res = await grantReaderOnPdfLibraryFolder(email);
  return res.ok ? { ok: true } : { ok: false, message: res.message };
}

