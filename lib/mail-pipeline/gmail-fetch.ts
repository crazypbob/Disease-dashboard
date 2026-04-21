/**
 * Gmail API — 검사결과 메일 검색, PDF 첨부 추출
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

function isRelevantEmail(from: string, subject: string, attNames: string[]): boolean {
  const fromLower = from.toLowerCase();
  const subLower = subject.toLowerCase();

  const senderMatch = MAIL_CONFIG.EMAIL_SENDERS.some(
    (s) => fromLower.includes(s.toLowerCase())
  );
  if (senderMatch) return true;

  const subjectMatch = MAIL_CONFIG.EMAIL_SUBJECT_KEYWORDS.some((kw) =>
    subLower.includes(kw.toLowerCase())
  );
  if (subjectMatch) return true;

  if (
    subLower.includes('전달') ||
    subLower.includes('fwd') ||
    subLower.includes('forward')
  ) {
    if (attNames.some((n) => n.toLowerCase().endsWith('.pdf'))) return true;
  }

  const hasRelevantPdf = attNames.some((n) => {
    const nm = n.toLowerCase();
    return (
      nm.endsWith('.pdf') &&
      (nm.includes('결과') ||
        nm.includes('검사') ||
        nm.includes('report') ||
        /d[ab]\d{4}/.test(nm) ||
        nm.includes('의뢰'))
    );
  });
  return hasRelevantPdf;
}

export async function fetchRelevantEmailsWithAttachments(): Promise<
  AttachmentInfo[]
> {
  const auth = getGoogleAuth();
  const gmail = google.gmail({ version: 'v1', auth });

  const baseQuery = `has:attachment filename:pdf -label:"${MAIL_CONFIG.EMAIL_LABEL}"`;
  const queries = [
    `${baseQuery} newer_than:30d`,
    ...(MAIL_CONFIG.EMAIL_LABEL_NAVER
      ? [`label:"${MAIL_CONFIG.EMAIL_LABEL_NAVER}" ${baseQuery} newer_than:90d`]
      : []),
  ];

  const messageIds = new Set<string>();
  for (const query of queries) {
    const res = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 50,
    });
    for (const m of res.data.messages ?? []) {
      if (m.id) messageIds.add(m.id);
    }
  }

  const attachments: AttachmentInfo[] = [];

  for (const msgId of messageIds) {
    const msg = { id: msgId };
    const full = await gmail.users.messages.get({
      userId: 'me',
      id: msg.id!,
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

    if (!isRelevantEmail(from, subject, attNames)) continue;

    for (const part of attParts) {
      if (!part.body?.attachmentId) continue;
      const att = await gmail.users.messages.attachments.get({
        userId: 'me',
        messageId: msg.id!,
        id: part.body.attachmentId,
      });
      const data = Buffer.from(att.data.data!, 'base64');
      attachments.push({
        messageId: msg.id!,
        filename: part.filename!,
        mimeType: part.mimeType || 'application/pdf',
        data,
      });
    }
  }

  return attachments;
}

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

export async function addProcessedLabel(messageIds: string[]): Promise<void> {
  if (messageIds.length === 0) return;

  const auth = getGoogleAuth();
  const gmail = google.gmail({ version: 'v1', auth });

  let labelId: string | undefined;
  const labels = await gmail.users.labels.list({ userId: 'me' });
  const found = labels.data.labels?.find(
    (l) => l.name === MAIL_CONFIG.EMAIL_LABEL
  );
  if (found?.id) {
    labelId = found.id;
  } else {
    const created = await gmail.users.labels.create({
      userId: 'me',
      requestBody: {
        name: MAIL_CONFIG.EMAIL_LABEL,
        labelListVisibility: 'labelHide',
        messageListVisibility: 'show',
      },
    });
    labelId = created.data.id ?? undefined;
  }

  if (!labelId) return;

  for (const id of messageIds) {
    await gmail.users.messages.modify({
      userId: 'me',
      id,
      requestBody: {
        addLabelIds: [labelId],
      },
    });
  }
}
