/**
 * Drive PDF 파싱 로직 (스크립트·API 공용)
 */
import { google } from 'googleapis';
import { getGoogleAuth } from './mail-pipeline/google-auth';
import { MAIL_CONFIG } from './mail-pipeline/config';
import { parsePdf } from './mail-pipeline/parse-pdf';
import { sql } from './db';

export type ParseDriveResult = {
  total: number;
  skipCount: number;
  toProcess: number;
  processed: number;
  failed: number;
};

export type ParseProgress = {
  index: number;
  total: number;
  name: string;
  success: boolean;
  recordsCount?: number;
  error?: string;
};

export async function runParseDrivePdfs(
  target: string,
  limit: number,
  delaySec = 30,
  onProgress?: (p: ParseProgress) => void
): Promise<ParseDriveResult> {
  const auth = getGoogleAuth();
  const drive = google.drive({ version: 'v3', auth });
  const rootName = MAIL_CONFIG.ROOT_FOLDER_NAME;
  const pdfName = MAIL_CONFIG.PDF_FOLDER_NAME;

  const rootRes = await drive.files.list({
    q: `name='${rootName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
  });
  const rootId = rootRes.data.files?.[0]?.id;
  if (!rootId) throw new Error(`폴더 '${rootName}' 없음`);

  const pdfRes = await drive.files.list({
    q: `name='${pdfName}' and '${rootId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
  });
  const pdfFolderId = pdfRes.data.files?.[0]?.id;
  if (!pdfFolderId) throw new Error(`폴더 '${pdfName}' 없음`);

  let folderIds: string[] = [];
  if (target === 'all') {
    const subRes = await drive.files.list({
      q: `'${pdfFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id)',
    });
    folderIds = (subRes.data.files ?? []).map((f) => f.id!);
  } else {
    const folderRes = await drive.files.list({
      q: `name='${target}' and '${pdfFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id)',
    });
    const fid = folderRes.data.files?.[0]?.id;
    if (!fid) throw new Error(`폴더 '${target}' 없음`);
    folderIds = [fid];
  }

  const allPdfs: { id: string; name: string }[] = [];
  for (const fid of folderIds) {
    const listRes = await drive.files.list({
      q: `'${fid}' in parents and mimeType='application/pdf' and trashed=false`,
      fields: 'files(id,name)',
    });
    for (const f of listRes.data.files ?? []) {
      if (f.id && f.name) allPdfs.push({ id: f.id, name: f.name });
    }
  }

  const parsedIds = (await sql`SELECT id FROM parsed_files WHERE id LIKE 'drive-%'`) as { id: string }[];
  const alreadyDone = new Set(parsedIds.map((r) => r.id));
  const unprocessed = allPdfs.filter((p) => !alreadyDone.has(`drive-${p.id}`));
  const toProcess = limit > 0 ? unprocessed.slice(0, limit) : unprocessed;
  const skipCount = allPdfs.length - unprocessed.length;

  if (toProcess.length === 0) {
    return { total: allPdfs.length, skipCount, toProcess: 0, processed: 0, failed: 0 };
  }

  let processed = 0;
  let failed = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const pdf = toProcess[i];
    if (i > 0 && delaySec > 0) {
      await new Promise((r) => setTimeout(r, delaySec * 1000));
    }
    try {
      const res = await drive.files.get(
        { fileId: pdf.id, alt: 'media' },
        { responseType: 'arraybuffer' }
      );
      const buffer = Buffer.from(res.data as ArrayBuffer);
      const records = await parsePdf(buffer, pdf.name, pdf.id, i);
      if (records.length === 0) {
        await sql`INSERT INTO parsed_files (id) VALUES (${`drive-${pdf.id}`}) ON CONFLICT (id) DO NOTHING`;
        onProgress?.({ index: i + 1, total: toProcess.length, name: pdf.name, success: true, recordsCount: 0 });
        continue;
      }
      for (const r of records) {
        await sql`
          INSERT INTO test_records (date, farm_code, disease, test_type, result, pdf_file_id, method, details)
          VALUES (${r.date}, ${r.farm_code}, ${r.disease}, ${r.test_type}, ${r.result}, ${r.drive_file_id}, ${r.method ?? null}, ${r.details ?? null})
        `;
      }
      await sql`INSERT INTO parsed_files (id) VALUES (${`drive-${pdf.id}`}) ON CONFLICT (id) DO NOTHING`;
      processed++;
      onProgress?.({ index: i + 1, total: toProcess.length, name: pdf.name, success: true, recordsCount: records.length });
    } catch (e) {
      failed++;
      onProgress?.({ index: i + 1, total: toProcess.length, name: pdf.name, success: false, error: (e as Error).message });
    }
  }

  return {
    total: allPdfs.length,
    skipCount,
    toProcess: toProcess.length,
    processed,
    failed,
  };
}
