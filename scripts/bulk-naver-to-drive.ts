/**
 * 질병진단-네이버 Gmail → Drive 일괄 업로드
 * - 누락된 PDF 전부 가져와서 Drive에 저장
 * - 처리 후 질병메일링_처리완료 라벨 부여 (--no-label 이면 생략)
 *
 * 사용법: npx tsx scripts/bulk-naver-to-drive.ts [--all] [--include-processed] [--no-parse] [--no-label]
 *   --all: 관련성 필터 없이 모든 PDF 업로드 (jb5219 등 포함)
 *   --include-processed: 처리완료 라벨 있는 메일도 포함 (누락분 재업로드용)
 *   --no-parse: Drive 업로드만, 파싱·DB 저장 안 함
 *   --no-label: 처리완료 라벨 부여 안 함
 */
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function main() {
  const args = process.argv.slice(2);
  const skipRelevantFilter = args.includes('--all');
  const includeProcessed = args.includes('--include-processed');
  const noParse = args.includes('--no-parse');
  const noLabel = args.includes('--no-label');

  const { fetchNaverLabelAttachments } = await import(
    '../lib/mail-pipeline/gmail-bulk-naver'
  );
  const { uploadPdfToDrive } = await import(
    '../lib/mail-pipeline/drive-upload'
  );
  const { addProcessedLabel } = await import(
    '../lib/mail-pipeline/gmail-fetch'
  );

  console.log('\n=== 질병진단-네이버 Gmail → Drive 일괄 업로드 ===');
  if (skipRelevantFilter) console.log('  [--all] 관련성 필터 없이 모든 PDF 포함');
  if (includeProcessed) console.log('  [--include-processed] 처리완료 메일도 포함');

  const attachments = await fetchNaverLabelAttachments({
    maxMessages: 500,
    skipRelevantFilter,
    includeProcessed,
  });

  if (attachments.length === 0) {
    console.log('처리할 PDF 첨부가 없습니다.');
    return;
  }

  console.log(`\nPDF ${attachments.length}개 발견. Drive 업로드 중...`);

  const uploaded: { messageId: string; filename: string; driveId: string }[] = [];
  const messageIds = new Set<string>();

  for (let i = 0; i < attachments.length; i++) {
    const att = attachments[i];
    try {
      const driveId = await uploadPdfToDrive(att.data, att.filename);
      uploaded.push({ messageId: att.messageId, filename: att.filename, driveId });
      messageIds.add(att.messageId);
      console.log(`  [${i + 1}/${attachments.length}] ✓ ${att.filename} → Drive`);
    } catch (e) {
      console.error(`  [${i + 1}/${attachments.length}] ✗ ${att.filename}:`, (e as Error).message);
    }
  }

  console.log(`\nDrive 업로드: ${uploaded.length}건 완료`);

  if (!noParse && uploaded.length > 0) {
    console.log('\n파싱 및 DB 저장 실행 중... (npm run cron:check-gmail 로직)');
    const { parsePdf } = await import('../lib/mail-pipeline/parse-pdf');
    const { sql } = await import('../lib/db');

    let inserted = 0;
    for (const u of uploaded) {
      const att = attachments.find(
        (a) => a.messageId === u.messageId && a.filename === u.filename
      );
      if (!att) continue;

      try {
        const records = await parsePdf(att.data, att.filename, u.driveId);
        const pdfFileId = `gmail-${u.messageId}-${u.filename}`;
        const existing = await sql`SELECT 1 FROM parsed_files WHERE id = ${pdfFileId} LIMIT 1`;
        if (existing.length > 0) continue;

        for (const r of records) {
          try {
            await sql`
              INSERT INTO test_records (date, farm_code, disease, test_type, result, pdf_file_id, method, details)
              VALUES (${r.date}, ${r.farm_code}, ${r.disease}, ${r.test_type}, ${r.result}, ${r.drive_file_id}, ${r.method ?? null}, ${r.details ?? null})
            `;
            inserted++;
          } catch (_e) {
            /* duplicate 등 무시 */
          }
        }
        if (records.length > 0) {
          await sql`INSERT INTO parsed_files (id) VALUES (${pdfFileId}) ON CONFLICT (id) DO NOTHING`;
        }
      } catch (e) {
        console.warn(`  파싱 실패 ${u.filename}:`, (e as Error).message);
      }
    }
    console.log(`DB 저장: ${inserted}건`);
  }

  if (!noLabel && messageIds.size > 0) {
    console.log('\n처리완료 라벨 부여 중...');
    await addProcessedLabel(Array.from(messageIds));
    console.log(`  ${messageIds.size}개 메일에 질병메일링_처리완료 라벨 추가`);
  }

  console.log('\n완료.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
