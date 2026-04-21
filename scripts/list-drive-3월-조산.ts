/**
 * Drive 3월 폴더 내 조산 관련 PDF 목록
 * 실행: npx tsx scripts/list-drive-3월-조산.ts
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  const { google } = await import('googleapis');
  const { getGoogleAuth } = await import('../lib/mail-pipeline/google-auth');
  const { MAIL_CONFIG } = await import('../lib/mail-pipeline/config');

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

  // 3월 폴더
  const marRes = await drive.files.list({
    q: `name='3월' and '${pdfFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
  });
  const marId = marRes.data.files?.[0]?.id;
  if (!marId) {
    console.log('3월 폴더 없음.');
    return;
  }

  const listRes = await drive.files.list({
    q: `'${marId}' in parents and mimeType='application/pdf' and trashed=false`,
    fields: 'files(id,name,createdTime)',
    orderBy: 'name',
  });

  const files = (listRes.data.files ?? []).filter((f) => f.id && f.name);
  const josan = files.filter((f) => f.name!.includes('조산') || f.name!.includes('3001'));
  const mar17 = files.filter((f) => f.name!.includes('03-17') || f.name!.includes('0317') || f.name!.includes('3월17'));

  console.log('=== Drive 3월 폴더 내 조산 관련 PDF ===');
  if (josan.length === 0) {
    console.log('조산(3001) 포함 파일 없음.');
  } else {
    josan.forEach((f) => console.log(`  ${f.id} | ${f.name}`));
  }

  console.log('\n=== 3월 17일 관련 PDF (파일명에 03-17/0317/3월17) ===');
  if (mar17.length === 0) {
    console.log('해당 없음.');
  } else {
    mar17.forEach((f) => console.log(`  ${f.id} | ${f.name}`));
  }

  console.log(`\n3월 폴더 전체 PDF: ${files.length}개`);
  console.log('전체 목록 (앞 30개):');
  files.slice(0, 30).forEach((f) => console.log(`  ${f.name}`));

  // 신규 폴더도 조산 검색
  const newRes = await drive.files.list({
    q: `name='신규' and '${pdfFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
  });
  const newId = newRes.data.files?.[0]?.id;
  if (newId) {
    const newList = await drive.files.list({
      q: `'${newId}' in parents and mimeType='application/pdf' and trashed=false`,
      fields: 'files(id,name)',
    });
    const newPdfs = (newList.data.files ?? []).filter((f) => f.id && f.name);
    const newJosan = newPdfs.filter((f) => f.name!.includes('조산') || f.name!.includes('3001'));
    console.log('\n=== 신규 폴더 내 조산 관련 PDF ===');
    if (newJosan.length > 0) {
      newJosan.forEach((f) => console.log(`  ${f.id} | ${f.name}`));
    } else {
      console.log('  없음.');
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
