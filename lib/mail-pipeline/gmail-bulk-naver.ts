/**
 * 질병진단-네이버 라벨 메일 전체 → PDF 첨부 일괄 추출 (페이지네이션)
 * 기존 fetchRelevantEmailsWithAttachments는 maxResults 50 제한
 */
import { gmail_v1, google } from 'googleapis';
import { getGoogleAuth } from './google-auth';
import { MAIL_CONFIG } from './config';

export type AttachmentInfo = {
  messageId: string;
  filename: string;
  mimeType: string;
  data: Buffer;
};

function collectParts(
  payload: gmail_v1.Schema$MessagePart | undefined,
  acc: gmail_v1.Schema$MessagePart[] = []
): gmail_v1.Schema$MessagePart[] {
  if (!payload) return acc;
  if (payload.filename && payload.body?.attachmentId) {
    acc.push(payload);
  }
  for (const p of payload.parts ?? []) {
    collectParts(p, acc);
  }
  return acc;
}

/** 질병진단-네이버 라벨 메일에서 PDF 첨부 전부 가져오기 (페이지네이션) */
export async function fetchNaverLabelAttachments(options?: {
  maxMessages?: number;
  skipRelevantFilter?: boolean;
  /** true면 처리완료 라벨 있는 메일도 포함 (누락분 재업로드용) */
  includeProcessed?: boolean;
}): Promise<AttachmentInfo[]> {
  const { maxMessages = 500, skipRelevantFilter = false, includeProcessed = false } = options ?? {};
  if (!MAIL_CONFIG.EMAIL_LABEL_NAVER) {
    throw new Error('EMAIL_LABEL_NAVER 미설정');
  }

  const auth = getGoogleAuth();
  const gmail = google.gmail({ version: 'v1', auth });

  const excludeLabel = includeProcessed ? '' : ` -label:"${MAIL_CONFIG.EMAIL_LABEL}"`;
  const query = `label:"${MAIL_CONFIG.EMAIL_LABEL_NAVER}" has:attachment filename:pdf${excludeLabel}`;
  const messageIds: string[] = [];
  let pageToken: string | null = null;

  while (true) {
    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 100,
      pageToken: pageToken ?? undefined,
    });
    const res: gmail_v1.Schema$ListMessagesResponse = listRes.data;
    for (const m of res.messages ?? []) {
      if (m.id) messageIds.push(m.id);
      if (messageIds.length >= maxMessages) break;
    }
    pageToken = res.nextPageToken ?? null;
    if (!pageToken || messageIds.length >= maxMessages) break;
  }

  const attachments: AttachmentInfo[] = [];

  for (const msgId of messageIds) {
    const full = await gmail.users.messages.get({
      userId: 'me',
      id: msgId,
      format: 'full',
    });

    const headers = full.data.payload?.headers ?? [];
    const from = headers.find((h) => h.name === 'From')?.value ?? '';
    const subject = headers.find((h) => h.name === 'Subject')?.value ?? '';

    const parts = collectParts(full.data.payload);
    const attParts = parts.filter(
      (p) => p.filename && p.filename.toLowerCase().endsWith('.pdf')
    );
    const attNames = attParts.map((p) => p.filename!);

    if (!skipRelevantFilter) {
      const fromLower = from.toLowerCase();
      const subLower = subject.toLowerCase();
      const senderMatch = MAIL_CONFIG.EMAIL_SENDERS.some((s) =>
        fromLower.includes(s.toLowerCase())
      );
      const subjectMatch = MAIL_CONFIG.EMAIL_SUBJECT_KEYWORDS.some((kw) =>
        subLower.includes(kw.toLowerCase())
      );
      const subjectFarmCode = /d[ab]\d{4}/i.test(subject);
      const hasRelevantPdf = attNames.some((n) => {
        const nm = n.toLowerCase();
        return (
          nm.endsWith('.pdf') &&
          (nm.includes('결과') ||
            nm.includes('검사') ||
            nm.includes('report') ||
            /d[ab]\d{4}/i.test(nm) ||
            nm.includes('의뢰'))
        );
      });
      if (!senderMatch && !subjectMatch && !subjectFarmCode && !hasRelevantPdf) continue;
    }

    for (const part of attParts) {
      if (!part.body?.attachmentId) continue;
      const att = await gmail.users.messages.attachments.get({
        userId: 'me',
        messageId: msgId,
        id: part.body.attachmentId,
      });
      const data = Buffer.from(att.data.data!, 'base64');
      attachments.push({
        messageId: msgId,
        filename: part.filename!,
        mimeType: part.mimeType || 'application/pdf',
        data,
      });
    }
  }

  return attachments;
}
