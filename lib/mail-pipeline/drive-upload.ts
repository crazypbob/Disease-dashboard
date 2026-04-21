/**
 * Drive API — PDF 저장 (검사결과_PDF/{월}/ 폴더, 예: 3월, 4월)
 * 신규 메일 수신 시 해당 월 폴더에 직접 저장
 */
import { Readable } from 'stream';
import { google } from 'googleapis';
import { getGoogleAuth } from './google-auth';
import { MAIL_CONFIG } from './config';

const folderCache = new Map<string, string>();

async function getOrCreateMonthFolderId(
  drive: ReturnType<typeof google.drive>,
  monthFolder: string
): Promise<string> {
  const key = monthFolder;
  if (folderCache.has(key)) return folderCache.get(key)!;

  const rootName = MAIL_CONFIG.ROOT_FOLDER_NAME;
  const pdfName = MAIL_CONFIG.PDF_FOLDER_NAME;

  const listRes = await drive.files.list({
    q: `name='${rootName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
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

  const pdfRes = await drive.files.list({
    q: `name='${pdfName}' and '${rootId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
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
    q: `name='${monthFolder}' and '${pdfId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
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

function getCurrentMonthFolder(): string {
  return `${new Date().getMonth() + 1}월`;
}

export async function uploadPdfToDrive(
  buffer: Buffer,
  filename: string
): Promise<string> {
  const auth = getGoogleAuth();
  const drive = google.drive({ version: 'v3', auth });

  const monthFolder = getCurrentMonthFolder();
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
