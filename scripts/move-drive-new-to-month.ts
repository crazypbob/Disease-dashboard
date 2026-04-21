/**
 * Drive: 검사결과_PDF/신규/ → 검사결과_PDF/{월}/ 이동
 *
 * - 파일 이동 시 Drive 파일 ID는 변하지 않음 → DB pdf_file_id 매핑 유지 (재매핑 불필요)
 * - 실행: npx tsx scripts/move-drive-new-to-month.ts [3월|4월|...]
 * - 인자 없으면 현재 월 (예: 3월)
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  const targetMonth = process.argv[2] || getCurrentMonthFolder();
  const { google } = await import('googleapis');
  const { getGoogleAuth } = await import('../lib/mail-pipeline/google-auth');
  const { MAIL_CONFIG } = await import('../lib/mail-pipeline/config');

  const auth = getGoogleAuth();
  const drive = google.drive({ version: 'v3', auth });

  const rootName = MAIL_CONFIG.ROOT_FOLDER_NAME;
  const pdfName = MAIL_CONFIG.PDF_FOLDER_NAME;
  const newName = MAIL_CONFIG.NEW_FOLDER_NAME;

  // 루트
  const rootRes = await drive.files.list({
    q: `name='${rootName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id,name)',
  });
  const rootId = rootRes.data.files?.[0]?.id;
  if (!rootId) {
    console.error(`폴더 '${rootName}' 없음`);
    process.exit(1);
  }

  // 검사결과_PDF
  const pdfRes = await drive.files.list({
    q: `name='${pdfName}' and '${rootId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
  });
  const pdfId = pdfRes.data.files?.[0]?.id;
  if (!pdfId) {
    console.error(`폴더 '${pdfName}' 없음`);
    process.exit(1);
  }

  // 신규
  const newRes = await drive.files.list({
    q: `name='${newName}' and '${pdfId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
  });
  const newFolderId = newRes.data.files?.[0]?.id;
  if (!newFolderId) {
    console.error(`폴더 '${newName}' 없음`);
    process.exit(1);
  }

  // 대상 월 폴더 (있으면 사용, 없으면 생성)
  let targetRes = await drive.files.list({
    q: `name='${targetMonth}' and '${pdfId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
  });
  let targetId = targetRes.data.files?.[0]?.id;
  if (!targetId) {
    const created = await drive.files.create({
      requestBody: {
        name: targetMonth,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [pdfId],
      },
      fields: 'id',
    });
    targetId = created.data.id!;
    console.log(`폴더 '${targetMonth}' 생성`);
  }

  const filesRes = await drive.files.list({
    q: `'${newFolderId}' in parents and mimeType='application/pdf' and trashed=false`,
    fields: 'files(id,name)',
  });
  const files = filesRes.data.files ?? [];

  if (files.length === 0) {
    console.log(`신규 폴더에 PDF 없음.`);
    return;
  }

  console.log(`신규 → ${targetMonth} 이동: ${files.length}개`);
  for (const f of files) {
    await drive.files.update({
      fileId: f.id!,
      addParents: targetId!,
      removeParents: newFolderId,
    });
    console.log(`  ${f.name}`);
  }
  console.log('완료. (Drive 파일 ID 불변 → DB 매핑 그대로 유지)');
}

function getCurrentMonthFolder(): string {
  const n = new Date().getMonth() + 1;
  return `${n}월`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
