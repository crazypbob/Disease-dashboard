/**
 * 가입 승인(approved_users) 시 `검사결과_PDF` 폴더에 Google 뷰어 권한 부여·회수.
 * `DRIVE_AUTO_SHARE_ON_APPROVE=1` 일 때만 동작.
 */
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/mail-pipeline/google-auth';
import { resolvePdfLibraryFolderIdForSharing } from '@/lib/drive-share-folder';

function driveAutoShareEnabled(): boolean {
  const v = process.env.DRIVE_AUTO_SHARE_ON_APPROVE?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function supportsAllDrivesForPermissions(): boolean {
  const v = process.env.DRIVE_USE_SHARED_DRIVES?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function permOpts(): { supportsAllDrives?: boolean } {
  return supportsAllDrivesForPermissions() ? { supportsAllDrives: true } : {};
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isDuplicatePermissionError(e: unknown): boolean {
  const err = e as { code?: number; message?: string };
  if (err.code === 409) return true;
  const m = String(err.message ?? '');
  return /already exists|duplicate/i.test(m);
}

export type DriveShareResult = { ok: true } | { ok: false; message: string };

/** 승인 직후: 폴더에 reader 권한 (이미 있으면 성공 처리). */
export async function grantReaderOnPdfLibraryFolder(emailRaw: string): Promise<DriveShareResult> {
  if (!driveAutoShareEnabled()) return { ok: true };

  const email = normalizeEmail(emailRaw);
  if (!email) return { ok: false, message: '이메일이 비어 있습니다.' };

  try {
    const auth = getGoogleAuth();
    const drive = google.drive({ version: 'v3', auth });
    const folderId = await resolvePdfLibraryFolderIdForSharing();

    await drive.permissions.create({
      fileId: folderId,
      requestBody: {
        type: 'user',
        role: 'reader',
        emailAddress: email,
      },
      sendNotificationEmail: false,
      ...permOpts(),
    });
    return { ok: true };
  } catch (e) {
    if (isDuplicatePermissionError(e)) return { ok: true };
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[grantReaderOnPdfLibraryFolder]', email, msg);
    return { ok: false, message: msg };
  }
}

/** 승인 취소 시: 해당 이메일의 사용자 권한만 제거 (owner/organizer 제외). */
export async function revokeReaderOnPdfLibraryFolder(emailRaw: string): Promise<DriveShareResult> {
  if (!driveAutoShareEnabled()) return { ok: true };

  const email = normalizeEmail(emailRaw);
  if (!email) return { ok: false, message: '이메일이 비어 있습니다.' };

  try {
    const auth = getGoogleAuth();
    const drive = google.drive({ version: 'v3', auth });
    const folderId = await resolvePdfLibraryFolderIdForSharing();

    let pageToken: string | undefined;
    const targets: string[] = [];

    do {
      const res = await drive.permissions.list({
        fileId: folderId,
        fields: 'nextPageToken, permissions(id,emailAddress,type,role)',
        pageToken,
        pageSize: 100,
        ...permOpts(),
      });
      for (const p of res.data.permissions ?? []) {
        if (!p.id) continue;
        if (p.type === 'user' && normalizeEmail(p.emailAddress ?? '') === email) {
          if (p.role === 'owner' || p.role === 'organizer') continue;
          targets.push(p.id);
        }
      }
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);

    for (const permissionId of targets) {
      await drive.permissions.delete({
        fileId: folderId,
        permissionId,
        ...permOpts(),
      });
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[revokeReaderOnPdfLibraryFolder]', email, msg);
    return { ok: false, message: msg };
  }
}
