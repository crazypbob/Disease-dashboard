/**
 * 가입 승인 시 Drive 공유에 쓰는 `검사결과_PDF` 폴더 ID.
 * - `DRIVE_SHARE_FOLDER_ID`: 직접 지정 시 조회 생략
 * - 그 외: Gmail OAuth와 동일 계정으로 `drive-upload`와 같은 트리 해석
 */
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/mail-pipeline/google-auth';
import { getOrCreatePdfLibraryFolderId } from '@/lib/mail-pipeline/drive-upload';

export async function resolvePdfLibraryFolderIdForSharing(): Promise<string> {
  const explicit = process.env.DRIVE_SHARE_FOLDER_ID?.trim();
  if (explicit) return explicit;
  const auth = getGoogleAuth();
  const drive = google.drive({ version: 'v3', auth });
  return getOrCreatePdfLibraryFolderId(drive);
}
