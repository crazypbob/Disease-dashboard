/**
 * Google Drive `질병메일링_대시보드` / `검사결과_PDF` / 월별 폴더 아래 PDF 중,
 * test_records.pdf_file_id 에 (Drive ID·URL 정규화 후) 등장하지 않는 파일 = **고아** 목록.
 *
 * (DB에는 없는데 Drive에만 있는 PDF — 역검증·정리용)
 *
 *   npx tsx scripts/report-drive-pdf-orphans.ts
 *   npx tsx scripts/report-drive-pdf-orphans.ts --csv="x:/질병메일링_대시보드/disease-dashboard/scripts/.drive-orphans.csv"
 *
 * 환경: `.env.local` 의 GMAIL_* OAuth (Drive 읽기 권한)
 * 선택: DRIVE_ROOT_FOLDER_ID, DRIVE_SHARE_FOLDER_ID, DRIVE_USE_SHARED_DRIVES=1
 * (`DRIVE_ROOT_FOLDER_ID` 가 이미 `검사결과_PDF` 폴더를 가리키는 경우도 drive-upload와 동일하게 처리)
 *
 * `drivePdfTotal` 이 0이면: (1) `DRIVE_USE_SHARED_DRIVES=1` 인데 `spaces` 로 인해 이전엔 0이 됐을 수 있음(현재 팀드라이브는 spaces 미사용)
 *     (2) PDF가 `YYYY-MM` 하위가 아니라 `검사결과_PDF` 바로 아래에만 있음(스크립트가 루트 PDF도 수집)
 *     (3) 권한·다른 Google 계정의 Drive
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import { google } from 'googleapis';
import { getGoogleAuth } from '../lib/mail-pipeline/google-auth';
import { extractDriveFileId } from '../lib/drive';

function useSharedDriveEnv(): boolean {
  const v = process.env.DRIVE_USE_SHARED_DRIVES?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/**
 * `parents` 로 자식을 나열할 때, 폴더가 **팀(공유) 드라이브**에 있으면
 * `supportsAllDrives` 없이는 빈 목록이 올 수 있음(로컬 .env에 플래그를 안 켜도 됨).
 * My Drive 전용 폴더는 이 옵션이 있어도 정상 조회됨.
 */
function listOpts() {
  return { supportsAllDrives: true, includeItemsFromAllDrives: true } as const;
}

async function listFilesInFolder(
  drive: ReturnType<typeof google.drive>,
  parentId: string,
  mimeFolder: boolean
): Promise<{ id: string; name: string }[]> {
  const mime = mimeFolder ? 'application/vnd.google-apps.folder' : 'application/pdf';
  const q = mimeFolder
    ? `'${parentId}' in parents and mimeType='${mime}' and trashed=false`
    : `'${parentId}' in parents and mimeType='${mime}' and trashed=false`;
  const out: { id: string; name: string }[] = [];
  let pageToken: string | undefined;
  do {
    // parents 로 폴더를 이미 지정하므로 spaces 를 쓰지 않음. spaces:'drive' 는 팀 드라이브·공유받은 ID에서 빈 목록이 됨.
    const res = await drive.files.list({
      ...listOpts(),
      q,
      fields: 'nextPageToken, files(id, name)',
      pageSize: 200,
      pageToken,
    });
    for (const f of res.data.files ?? []) {
      if (f.id && f.name) out.push({ id: f.id, name: f.name });
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return out;
}

type MetaErr = { error: string };
type Diag = {
  resolvedLibrary: { id: string; name?: string; mimeType?: string; driveId?: string };
  sampleFromDb: {
    fileId: string;
    name?: string;
    directParentId?: string;
    directParentName?: string;
    /** 월 폴더(추정)의 부모 = 실제 `검사결과_PDF` 후보 ID */
    libraryIdInferredFromSample?: string | null;
    matchesResolvedLibraryId: boolean;
  } | null;
} | MetaErr;

/** Drive 쪽 목록 0건일 때, DB에 있는 PDF ID로 실제 부모 경로를 찍어 `pdfLibraryFolderId` 가 맞는지 본다. */
async function diagnoseWhenZeroPdfs(
  drive: ReturnType<typeof google.drive>,
  pdfFolderId: string,
  dbFileIds: string[]
): Promise<Diag> {
  try {
    const libMeta = await drive.files.get({
      fileId: pdfFolderId,
      fields: 'id, name, mimeType, driveId',
      ...listOpts(),
    });
    const resolvedLibrary = {
      id: String(libMeta.data.id ?? pdfFolderId),
      name: libMeta.data.name ?? undefined,
      mimeType: libMeta.data.mimeType ?? undefined,
      driveId: (libMeta.data as { driveId?: string }).driveId,
    };
    for (const fileId of dbFileIds.slice(0, 5)) {
      try {
        const f = await drive.files.get({
          fileId: fileId,
          fields: 'id, name, mimeType, parents',
          ...listOpts(),
        });
        const parent0 = f.data.parents?.[0];
        if (!parent0) {
          return {
            resolvedLibrary,
            sampleFromDb: {
              fileId,
              name: f.data.name ?? undefined,
              matchesResolvedLibraryId: false,
            },
          };
        }
        const pMeta = await drive.files.get({
          fileId: parent0,
          fields: 'id, name, mimeType, parents',
          ...listOpts(),
        });
        const libraryIdFromFile = pMeta.data.parents?.[0] ?? null;
        const inRootOfLibrary = parent0 === pdfFolderId;
        const inMonthUnderLibrary = libraryIdFromFile === pdfFolderId;
        return {
          resolvedLibrary,
          sampleFromDb: {
            fileId,
            name: f.data.name ?? undefined,
            directParentId: parent0,
            directParentName: pMeta.data.name ?? undefined,
            libraryIdInferredFromSample: inRootOfLibrary ? parent0 : libraryIdFromFile,
            matchesResolvedLibraryId: inRootOfLibrary || inMonthUnderLibrary,
          },
        };
      } catch {
        continue;
      }
    }
    return {
      resolvedLibrary,
      sampleFromDb: null,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

async function main() {
  const csvArg = process.argv.find((a) => a.startsWith('--csv='));
  const csvPath = csvArg ? path.resolve(csvArg.slice('--csv='.length).trim()) : '';

  const auth = getGoogleAuth();
  const drive = google.drive({ version: 'v3', auth });

  const { resolvePdfLibraryFolderIdForSharing } = await import('../lib/drive-share-folder');
  const pdfFolderId = await resolvePdfLibraryFolderIdForSharing();

  const monthFolders = await listFilesInFolder(drive, pdfFolderId, true);
  const allPdfs: { id: string; name: string; monthFolder: string }[] = [];

  const rootPdfs = await listFilesInFolder(drive, pdfFolderId, false);
  for (const p of rootPdfs) {
    allPdfs.push({ ...p, monthFolder: '(검사결과_PDF_바로아래)' });
  }

  for (const mf of monthFolders) {
    const pdfs = await listFilesInFolder(drive, mf.id, false);
    for (const p of pdfs) {
      allPdfs.push({ ...p, monthFolder: mf.name });
    }
  }

  const { sql } = await import('../lib/db');
  const refs = (await sql`
    SELECT DISTINCT trim(pdf_file_id) AS pdf_file_id
    FROM test_records
    WHERE pdf_file_id IS NOT NULL AND trim(pdf_file_id) <> ''
  `) as { pdf_file_id: string }[];

  const dbDriveIds = new Set<string>();
  for (const r of refs) {
    const id = extractDriveFileId(r.pdf_file_id);
    if (id) dbDriveIds.add(id);
  }

  const orphans = allPdfs.filter((p) => !dbDriveIds.has(p.id));

  const firstDbFileIds: string[] = [];
  for (const r of refs) {
    const id = extractDriveFileId(r.pdf_file_id);
    if (id) firstDbFileIds.push(id);
  }

  const summary: Record<string, unknown> = {
    pdfLibraryFolderId: pdfFolderId,
    monthSubfolderCount: monthFolders.length,
    pdfInRootOfLibrary: rootPdfs.length,
    drivePdfTotal: allPdfs.length,
    distinctDbDriveRefs: dbDriveIds.size,
    orphanCount: orphans.length,
    sharedDrivesModeEnv: useSharedDriveEnv(),
    listUsesSupportsAllDrives: true,
  };
  if (allPdfs.length === 0 && firstDbFileIds.length > 0) {
    const diag = await diagnoseWhenZeroPdfs(drive, pdfFolderId, firstDbFileIds);
    summary.zeroPdfDiagnostic = diag;
    if (!('error' in diag) && diag.sampleFromDb && !diag.sampleFromDb.matchesResolvedLibraryId) {
      console.error(
        '\n[힌트] resolve된 폴더 ID와, DB에 있는 PDF 샘플이 속한 `검사결과_PDF` 후보 ID가 다를 수 있습니다. .env에 `DRIVE_SHARE_FOLDER_ID` 를 실제 월 폴더의 부모(검사결과_PDF) ID로 맞춰 보세요.\n' +
          JSON.stringify(diag.sampleFromDb, null, 2)
      );
    }
  }

  console.log(JSON.stringify(summary, null, 2));

  const maxShow = 100;
  console.log(`\n고아 PDF 샘플 (최대 ${maxShow}건):`);
  for (const o of orphans.slice(0, maxShow)) {
    console.log(`${o.id}\t${o.monthFolder}\t${o.name}`);
  }
  if (orphans.length > maxShow) console.log(`... 외 ${orphans.length - maxShow}건`);

  if (csvPath) {
    const lines = ['drive_file_id,month_folder,file_name', ...orphans.map((o) => `${o.id},${csvEscape(o.monthFolder)},${csvEscape(o.name)}`)];
    fs.writeFileSync(csvPath, lines.join('\n'), 'utf-8');
    console.log(`\nCSV: ${csvPath}`);
  }

  if (typeof (sql as any).end === 'function') await (sql as any).end();
}

function csvEscape(s: string): string {
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
