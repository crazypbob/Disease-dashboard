/**
 * Drive PDF → 파싱 → scripts/results.xlsx 출력
 * - 수동 폴더 이동 없이 Drive에서 직접 읽기
 * - 결과를 scripts/results.xlsx 에 저장 (import-ocr-results 호환 형식)
 *
 * 사용법: npx tsx scripts/drive-parse-to-results.ts [all|신규|3월|4월...] [--delay=N]
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const DISEASE_TO_COL: Record<string, Record<string, string>> = {
  PRRS: { PCR: 'PRRS_결과', ELISA: 'PRRS_항체', 유전자분석: '분석결과' },
  PED: { PCR: 'PED_결과' },
  PEDV: { PCR: 'PEDV_결과' },
  TGE: { PCR: 'TGE_결과' },
  PCV2: { ELISA: 'PCV2_항체' },
  APP: { ELISA: 'APP_항체' },
  세균: { ELISA: 'Myco_항체', PCR: '세균수' },
  '항생제 감수성검사': { '항생제 감수성 검사': '항생제_감수성' },
  MH: { ELISA: 'Myco_항체' },
  MHR: { PCR: 'MHR_결과' },
};

function parseArg(name: string, def: number): number {
  const match = process.argv.find((a) => a.startsWith(`--${name}=`));
  return match ? parseInt(match.split('=')[1], 10) || def : def;
}

function toResult(v: string): string {
  const s = String(v ?? '').trim().toUpperCase();
  if (s === '+' || s === '양성' || s === '검출') return '+';
  if (s === '-' || s === '음성' || s === '불검출') return '-';
  if (s === 'V' || s === '있음' || s.includes('결과지') || s.includes('보고서')) return 'V';
  return s ? s : '-';
}

async function main() {
  const target = process.argv[2] || 'all';
  const delaySec = parseArg('delay', 30);

  const { google } = await import('googleapis');
  const { getGoogleAuth } = await import('../lib/mail-pipeline/google-auth');
  const { MAIL_CONFIG } = await import('../lib/mail-pipeline/config');
  const { parsePdf } = await import('../lib/mail-pipeline/parse-pdf');
  const { FARMS } = await import('../lib/farms');

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

  console.log(`\nDrive PDF ${allPdfs.length}개 파싱 → scripts/results.xlsx`);

  const allRecords: { filename: string; driveId: string; date: string; farm_code: string; disease: string; test_type: string; result: string }[] = [];

  for (let i = 0; i < allPdfs.length; i++) {
    const pdf = allPdfs[i];
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
      for (const r of records) {
        allRecords.push({
          filename: pdf.name,
          driveId: pdf.id,
          date: r.date,
          farm_code: r.farm_code,
          disease: r.disease,
          test_type: r.test_type,
          result: toResult(r.result),
        });
      }
      console.log(`  [${i + 1}/${allPdfs.length}] ✓ ${pdf.name} → ${records.length}건`);
    } catch (e) {
      console.error(`  [${i + 1}/${allPdfs.length}] ✗ ${pdf.name}:`, (e as Error).message);
    }
  }

  const farmName = (code: string) => {
    const f = FARMS[code as keyof typeof FARMS];
    return f?.name ?? code;
  };

  const headers = [
    '파일명',
    '날짜',
    '검사종류',
    '접수번호',
    '농장명',
    'OCR_텍스트_미리보기',
    'PRRS_결과',
    'PED_결과',
    'PEDV_결과',
    'TGE_결과',
    '비고',
    'PRRS_항체',
    'PCV2_항체',
    'APP_항체',
    'Myco_항체',
    '추출결과',
    '분석결과',
  ];

  const keyToRow = new Map<
    string,
    Record<string, string>
  >();

  for (const r of allRecords) {
    const key = `${r.filename}|${r.date}|${r.farm_code}`;
    if (!keyToRow.has(key)) {
      keyToRow.set(key, {
        파일명: r.filename,
        날짜: r.date,
        검사종류: '',
        접수번호: '',
        농장명: farmName(r.farm_code),
        OCR_텍스트_미리보기: '',
        PRRS_결과: '',
        PED_결과: '',
        PEDV_결과: '',
        TGE_결과: '',
        비고: '',
        PRRS_항체: '',
        PCV2_항체: '',
        APP_항체: '',
        Myco_항체: '',
        추출결과: '',
        분석결과: '',
      });
    }
    const row = keyToRow.get(key)!;
    const col = DISEASE_TO_COL[r.disease]?.[r.test_type];
    if (col && col in row) row[col] = r.result;
  }

  const rows = Array.from(keyToRow.values()).map((r) =>
    headers.map((h) => r[h] ?? '')
  );

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

  const outPath = path.join(process.cwd(), 'scripts', 'results.xlsx');
  XLSX.writeFile(wb, outPath);

  console.log(`\n저장: ${outPath}`);
  console.log(`  ${rows.length}행 (${allRecords.length}건 레코드)`);
  console.log('\n다음 명령으로 DB import:');
  console.log(`  npx tsx scripts/import-ocr-results.ts --file=scripts/results.xlsx`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
