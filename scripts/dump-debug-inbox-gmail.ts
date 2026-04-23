/**
 * Gmail에서 매트릭스 검증 관련 메일을 검색해 하나의 텍스트 파일로 덤프합니다.
 * (Resend가 관리자함으로 넣은 사본, 또는 동일 제목 패턴의 전달 메일 포함)
 *
 *   npx tsx scripts/dump-debug-inbox-gmail.ts
 *   npx tsx scripts/dump-debug-inbox-gmail.ts -- --out=tmp/verify-dump.txt --max=50
 *   npx tsx scripts/dump-debug-inbox-gmail.ts -- --query='subject:"DiseaseDashboard:Verify" newer_than:30d'
 *
 * 환경: `.env.local`에 GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import type { gmail_v1 } from 'googleapis';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

function decodeB64Url(data: string): string {
  const b64 = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(b64, 'base64').toString('utf8');
}

function collectPlainParts(part: gmail_v1.Schema$MessagePart | undefined): string[] {
  if (!part) return [];
  if (part.mimeType === 'text/plain' && part.body?.data) {
    return [decodeB64Url(part.body.data)];
  }
  if (part.parts?.length) {
    return part.parts.flatMap((p) => collectPlainParts(p));
  }
  return [];
}

async function main() {
  const args = process.argv.slice(2);
  const outArg = args.find((a) => a.startsWith('--out='))?.slice('--out='.length).trim();
  const maxParsed = parseInt(args.find((a) => a.startsWith('--max='))?.split('=')[1] ?? '80', 10);
  const max = Number.isFinite(maxParsed) && maxParsed > 0 ? maxParsed : 80;
  const queryArg = args.find((a) => a.startsWith('--query='))?.slice('--query='.length).trim();
  const defaultQuery =
    'newer_than:180d (subject:"DiseaseDashboard:Verify" OR subject:"[디버그]" OR subject:"매트릭스 검증")';
  const query = queryArg || defaultQuery;

  const { google } = await import('googleapis');
  const { getGoogleAuth } = await import('../lib/mail-pipeline/google-auth');

  const auth = getGoogleAuth();
  const gmail = google.gmail({ version: 'v1', auth });

  const listRes = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    maxResults: max,
  });
  const messages = listRes.data.messages ?? [];
  if (messages.length === 0) {
    console.error('검색 결과 없음. --query= 로 범위를 넓히세요.');
    process.exit(2);
  }

  const chunks: string[] = [`# Gmail 검증 메일 덤프\nquery: ${query}\nmessages: ${messages.length}\n\n`];

  for (const m of messages) {
    const id = m.id!;
    const full = await gmail.users.messages.get({
      userId: 'me',
      id,
      format: 'full',
    });
    const headers = full.data.payload?.headers ?? [];
    const subj = headers.find((h) => h.name === 'Subject')?.value ?? '';
    const date = headers.find((h) => h.name === 'Date')?.value ?? '';
    const from = headers.find((h) => h.name === 'From')?.value ?? '';
    const bodies = collectPlainParts(full.data.payload ?? undefined);
    const text = bodies.join('\n\n--- part ---\n\n') || '(본문 없음)';

    chunks.push(
      `\n${'='.repeat(72)}\nGMAIL_MESSAGE_ID: ${id}\nDate: ${date}\nFrom: ${from}\nSubject: ${subj}\n${'='.repeat(
        72
      )}\n\n${text}\n`
    );
  }

  const out = outArg || path.join('scripts', '.debug-verify-gmail-dump.txt');
  const abs = path.isAbsolute(out) ? out : path.join(process.cwd(), out);
  const dir = path.dirname(abs);
  if (dir && dir !== '.') fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(abs, chunks.join(''), 'utf-8');
  console.log(`Wrote ${messages.length} messages → ${abs}`);
  console.log('이 파일을 Cursor 채팅에 첨부하거나 열어 재검증·파서 규칙 작업에 사용하면 됩니다.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
