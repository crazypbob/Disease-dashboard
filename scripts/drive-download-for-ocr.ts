/**
 * Drive PDF → 다운로드 (Gemini 사용 안 함, NAS OCR용)
 * - Drive에서 PDF만 받아서 OCR input 폴더에 저장
 * - 파싱은 NAS ocr-pipeline에서 수행
 *
 * 사용법: npx tsx scripts/drive-download-for-ocr.ts [all|신규|3월|4월...] [--out=경로]
 *   --out=경로: 저장 폴더 (기본: OCR_INPUT_PATH env 또는 scripts/ocr-input)
 *
 * 예: OCR_INPUT_PATH=X:/ocr-pipeline/input npx tsx scripts/drive-download-for-ocr.ts all
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function main() {
  const target = process.argv[2] || 'all';
  const outArg = process.argv.find((a) => a.startsWith('--out='));
  const outDir =
    outArg?.replace('--out=', '').trim() ||
    process.env.OCR_INPUT_PATH ||
    path.join(process.cwd(), 'scripts', 'ocr-input');

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

  if (allPdfs.length === 0) {
    console.log('Drive에 PDF가 없습니다.');
    return;
  }

  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  console.log(`\nDrive PDF ${allPdfs.length}개 → ${outDir} (Gemini 없음, NAS OCR용)`);

  const seen = new Set<string>();
  let saved = 0;
  for (let i = 0; i < allPdfs.length; i++) {
    const pdf = allPdfs[i];
    let base = path.basename(pdf.name, '.pdf');
    if (seen.has(base)) {
      base = `${base}_${i}`;
    }
    seen.add(base);
    const safeName = base.endsWith('.pdf') ? base : `${base}.pdf`;
    const outPath = path.join(outDir, safeName);

    try {
      const res = await drive.files.get(
        { fileId: pdf.id, alt: 'media' },
        { responseType: 'arraybuffer' }
      );
      fs.writeFileSync(outPath, Buffer.from(res.data as ArrayBuffer));
      saved++;
      if ((i + 1) % 50 === 0 || i === allPdfs.length - 1) {
        console.log(`  [${i + 1}/${allPdfs.length}] ${saved}개 저장됨`);
      }
    } catch (e) {
      console.error(`  ✗ ${pdf.name}:`, (e as Error).message);
    }
  }

  console.log(`\n완료: ${saved}개 PDF → ${outDir}`);
  console.log('\n다음 단계 (NAS OCR):');
  console.log('  1. 위 폴더를 NAS ocr-pipeline/input/ 에 복사 (또는 OCR_INPUT_PATH로 해당 경로 지정)');
  console.log('  2. NAS에서: docker compose run --rm ocr-pipeline');
  console.log('  3. output/results.xlsx → import:');
  console.log('     npx tsx scripts/import-ocr-results.ts --file=X:/ocr-pipeline/output/results.xlsx');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
