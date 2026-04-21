/**
 * 최근 Gmail 검사결과 메일 + 파이프라인 처리 여부 확인
 * npx tsx scripts/check-recent-email.ts
 *
 * 네이버 수신 → Gmail 전달 → 파이프라인 처리 흐름 점검용
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  const { google } = await import('googleapis');
  const { getGoogleAuth } = await import('../lib/mail-pipeline/google-auth');
  const { MAIL_CONFIG } = await import('../lib/mail-pipeline/config');
  const { sql } = await import('../lib/db');

  const auth = getGoogleAuth();
  const gmail = google.gmail({ version: 'v1', auth });

  // 최근 24시간 메일 (PDF 첨부, 처리완료 라벨 제외)
  const query = `has:attachment filename:pdf newer_than:1d -label:"${MAIL_CONFIG.EMAIL_LABEL}"`;
  const listRes = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    maxResults: 20,
  });

  const messages = listRes.data.messages ?? [];
  console.log('\n=== Gmail 최근 24h PDF 첨부 메일 (미처리) ===');
  if (messages.length === 0) {
    console.log('없음. (이미 처리되었거나, Gmail에 아직 도착 안 함)');
  } else {
    for (const m of messages) {
      const full = await gmail.users.messages.get({
        userId: 'me',
        id: m.id!,
        format: 'metadata',
        metadataHeaders: ['From', 'Subject', 'Date'],
      });
      const headers = full.data.payload?.headers ?? [];
      const from = headers.find((h) => h.name === 'From')?.value ?? '';
      const subject = headers.find((h) => h.name === 'Subject')?.value ?? '';
      const date = headers.find((h) => h.name === 'Date')?.value ?? '';
      console.log(`  [${m.id?.slice(0, 8)}] ${date}`);
      console.log(`    From: ${from}`);
      console.log(`    Subject: ${subject?.slice(0, 60)}`);
    }
  }

  // 처리완료 라벨 있는 최근 메일
  const processedQuery = `has:attachment filename:pdf newer_than:1d label:"${MAIL_CONFIG.EMAIL_LABEL}"`;
  const procRes = await gmail.users.messages.list({
    userId: 'me',
    q: processedQuery,
    maxResults: 10,
  });
  const processed = procRes.data.messages ?? [];
  console.log('\n=== 최근 24h 처리완료 메일 ===');
  if (processed.length === 0) {
    console.log('없음.');
  } else {
    for (const m of processed) {
      const full = await gmail.users.messages.get({
        userId: 'me',
        id: m.id!,
        format: 'metadata',
        metadataHeaders: ['From', 'Subject', 'Date'],
      });
      const headers = full.data.payload?.headers ?? [];
      const from = headers.find((h) => h.name === 'From')?.value ?? '';
      const subject = headers.find((h) => h.name === 'Subject')?.value ?? '';
      const date = headers.find((h) => h.name === 'Date')?.value ?? '';
      console.log(`  [${m.id?.slice(0, 8)}] ${date} | ${from} | ${subject?.slice(0, 40)}`);
    }
  }

  // DB 최근 레코드 (다비연구소 DB9001)
  const recent = (await sql`
    SELECT date::text, farm_code, disease, result, created_at::text
    FROM test_records
    WHERE farm_code = 'DB9001'
    ORDER BY created_at DESC
    LIMIT 5
  `) as { date: string; farm_code: string; disease: string; result: string; created_at: string }[];

  console.log('\n=== DB 최근 다비연구소 레코드 ===');
  if (recent.length === 0) {
    console.log('없음.');
  } else {
    for (const r of recent) {
      console.log(`  ${r.created_at?.slice(0, 19)} | ${r.date} ${r.farm_code} ${r.disease} ${r.result}`);
    }
  }

  console.log('\n※ 네이버 수신 → Gmail 자동 전달 설정이 되어 있어야 파이프라인이 인식합니다.');
  console.log('※ 처리하려면: npm run cron:check-gmail');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
