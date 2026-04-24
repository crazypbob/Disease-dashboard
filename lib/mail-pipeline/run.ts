/**
 * 메일 파이프라인 실행 (Gmail → Drive → Gemini → DB)
 */
import { sql } from '@/lib/db';
import { parseTestResult } from '@/lib/result-display';
import {
  fetchRelevantEmailsWithAttachments,
  addProcessedLabel,
  type AttachmentInfo,
} from './gmail-fetch';
import { uploadPdfToDrive } from './drive-upload';
import { parsePdf, type IngestRecord } from './parse-pdf';

export type PipelineResult = {
  emailsProcessed: number;
  filesUploaded: number;
  recordsInserted: number;
  messageIds: string[];
  errors: string[];
};

export async function runMailPipeline(): Promise<PipelineResult> {
  const result: PipelineResult = {
    emailsProcessed: 0,
    filesUploaded: 0,
    recordsInserted: 0,
    messageIds: [] as string[],
    errors: [],
  };

  try {
    const attachments = await fetchRelevantEmailsWithAttachments();
    if (attachments.length === 0) {
      return result;
    }

    const processedMessageIds = new Set<string>();

    for (const att of attachments) {
      try {
        const driveFileId = await uploadPdfToDrive(att.data, att.filename);
        result.filesUploaded++;

        const records = await parsePdf(
          att.data,
          att.filename,
          driveFileId
        );

        if (records.length === 0) {
          result.errors.push(`파싱 결과 없음: ${att.filename}`);
          processedMessageIds.add(att.messageId);
          continue;
        }

        const pdfFileId = `gmail-${att.messageId}-${att.filename}`;
        const existing = await sql`
          SELECT 1 FROM parsed_files WHERE id = ${pdfFileId} LIMIT 1
        `;
        if (existing.length > 0) {
          processedMessageIds.add(att.messageId);
          continue;
        }

        let inserted = 0;
        for (const r of records) {
          try {
            await sql`
              INSERT INTO test_records (date, farm_code, disease, test_type, result, pdf_file_id, method, details)
              VALUES (${r.date}, ${r.farm_code}, ${r.disease}, ${r.test_type}, ${r.result}, ${r.drive_file_id}, ${r.method ?? null}, ${r.details ?? null})
            `;
            inserted++;
          } catch (e) {
            result.errors.push(`DB insert: ${(e as Error).message}`);
          }
        }

        if (inserted > 0) {
          await sql`INSERT INTO parsed_files (id) VALUES (${pdfFileId}) ON CONFLICT (id) DO NOTHING`;
          result.recordsInserted += inserted;
          processedMessageIds.add(att.messageId);

          await sendDiscordNotify(records);
        }
      } catch (e) {
        result.errors.push(`${att.filename}: ${(e as Error).message}`);
      }
    }

    result.messageIds = Array.from(processedMessageIds);
    result.emailsProcessed = result.messageIds.length;

    if (result.messageIds.length > 0) {
      await addProcessedLabel(result.messageIds);
    }
  } catch (e) {
    result.errors.push(`파이프라인: ${(e as Error).message}`);
  }

  return result;
}

async function sendDiscordNotify(records: IngestRecord[]): Promise<void> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    const farms = [...new Set(records.map((r) => r.farm_code))].join(', ');
    const positives = records.filter(
      (r) =>
        parseTestResult(r.result, { disease: r.disease, testType: r.test_type }).variant === 'positive'
    ).length;
    const summary = positives > 0 ? `양성 ${positives}건 포함` : '모두 음성';

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: null,
        embeds: [
          {
            title: '🔬 검사결과 등록',
            description: `농장: ${farms}\n등록: ${records.length}건 ${summary}`,
            color: positives > 0 ? 0xe74c3c : 0x27ae60,
            timestamp: new Date().toISOString(),
            footer: { text: '질병메일링 대시보드' },
          },
        ],
      }),
    });
  } catch {
    // ignore
  }
}
