import { sql } from '@/lib/db';
import type { DebugReportListItem, DebugReportRow } from '@/lib/debug-report-types';

export async function insertDebugReport(input: {
  submitterEmail: string;
  submitterName: string | null;
  title: string | null;
  bodyMarkdown: string;
  contextJson: string | null;
}): Promise<{ id: number }> {
  const rows = (await sql`
    INSERT INTO debug_reports (submitter_email, submitter_name, title, body_markdown, context_json, status)
    VALUES (
      ${input.submitterEmail},
      ${input.submitterName},
      ${input.title},
      ${input.bodyMarkdown},
      ${input.contextJson},
      'new'
    )
    RETURNING id
  `) as { id: number }[];
  return { id: rows[0].id };
}

export async function markDebugReportMailSent(id: number): Promise<void> {
  await sql`
    UPDATE debug_reports SET mail_sent_at = NOW() WHERE id = ${id}
  `;
}

export async function listDebugReportsForAdmin(limit = 100): Promise<DebugReportListItem[]> {
  const rows = (await sql`
    SELECT
      id,
      created_at::text AS created_at,
      submitter_email,
      submitter_name,
      title,
      LEFT(body_markdown, 500) AS preview,
      status,
      mail_sent_at::text AS mail_sent_at
    FROM debug_reports
    ORDER BY created_at DESC
    LIMIT ${limit}
  `) as DebugReportListItem[];
  return rows;
}

export async function getDebugReportByIdForAdmin(id: number): Promise<DebugReportRow | null> {
  const rows = (await sql`
    SELECT
      id,
      created_at::text AS created_at,
      submitter_email,
      submitter_name,
      title,
      body_markdown,
      context_json,
      status,
      mail_sent_at::text AS mail_sent_at
    FROM debug_reports
    WHERE id = ${id}
    LIMIT 1
  `) as DebugReportRow[];
  return rows[0] ?? null;
}
