/**
 * Drive API — PDF 저장 (검사결과_PDF/{YYYY-MM}/, NAS·DB import와 동일)
 */
import { Readable } from 'stream';
import { google } from 'googleapis';
import { getGoogleAuth } from './google-auth';
import { MAIL_CONFIG } from './config';

const folderCache = new Map<string, string>();

function escDriveQueryName(s: string): string {
  return s.replace(/'/g, "''");
}

/** 파일명 선두 YYYYMMDD… → `YYYY-MM` (NAS 월 폴더와 동일) */
export function inferMonthFolderYyyyMmFromFilename(filename: string): string | null {
  const m = String(filename).match(/^(\d{4})(\d{2})\d{2}/);
  if (!m) return null;
  return `${m[1]}-${m[2]}`;
}

export function monthFolderYyyyMmNow(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export type UploadPdfToDriveOptions = {
  /** 예: `2026-04`. 없으면 파일명 날짜 또는 당월 */
  monthFolder?: string | null;
};

async function getRootFolderId(
  drive: ReturnType<typeof google.drive>
): Promise<string> {
  const envId = process.env.DRIVE_ROOT_FOLDER_ID?.trim();
  if (envId) return envId;

  const rootName = MAIL_CONFIG.ROOT_FOLDER_NAME;
  const listRes = await drive.files.list({
    q: `name='${escDriveQueryName(rootName)}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
    spaces: 'drive',
  });

  let rootId = listRes.data.files?.[0]?.id;
  if (!rootId) {
    const createRoot = await drive.files.create({
      requestBody: {
        name: rootName,
        mimeType: 'application/vnd.google-apps.folder',
      },
      fields: 'id',
    });
    rootId = createRoot.data.id!;
  }
  return rootId;
}

async function getOrCreateMonthFolderId(
  drive: ReturnType<typeof google.drive>,
  monthFolder: string
): Promise<string> {
  const key = monthFolder;
  if (folderCache.has(key)) return folderCache.get(key)!;

  const pdfName = MAIL_CONFIG.PDF_FOLDER_NAME;
  const rootId = await getRootFolderId(drive);

  const pdfRes = await drive.files.list({
    q: `name='${escDriveQueryName(pdfName)}' and '${rootId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
    spaces: 'drive',
  });

  let pdfId = pdfRes.data.files?.[0]?.id;
  if (!pdfId) {
    const createPdf = await drive.files.create({
      requestBody: {
        name: pdfName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [rootId],
      },
      fields: 'id',
    });
    pdfId = createPdf.data.id!;
  }

  const monthRes = await drive.files.list({
    q: `name='${escDriveQueryName(monthFolder)}' and '${pdfId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
    spaces: 'drive',
  });

  let monthId = monthRes.data.files?.[0]?.id;
  if (!monthId) {
    const createMonth = await drive.files.create({
      requestBody: {
        name: monthFolder,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [pdfId],
      },
      fields: 'id',
    });
    monthId = createMonth.data.id!;
  }

  folderCache.set(key, monthId);
  return monthId;
}

function resolveMonthFolder(filename: string, options?: UploadPdfToDriveOptions): string {
  if (options?.monthFolder?.trim()) return options.monthFolder.trim();
  return inferMonthFolderYyyyMmFromFilename(filename) ?? monthFolderYyyyMmNow();
}

export async function uploadPdfToDrive(
  buffer: Buffer,
  filename: string,
  options?: UploadPdfToDriveOptions
): Promise<string> {
  const auth = getGoogleAuth();
  const drive = google.drive({ version: 'v3', auth });

  const monthFolder = resolveMonthFolder(filename, options);
  const folderId = await getOrCreateMonthFolderId(drive, monthFolder);

  const file = await drive.files.create({
    requestBody: {
      name: filename,
      parents: [folderId],
    },
    media: {
      mimeType: 'application/pdf',
      body: Readable.from(buffer),
    },
    fields: 'id',
  });

  return file.data.id!;
}
