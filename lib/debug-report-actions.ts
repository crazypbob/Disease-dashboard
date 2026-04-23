'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { canManageAccessRequests } from '@/lib/access-admin';
import {
  getDebugReportByIdForAdmin,
  insertDebugReport,
  listDebugReportsForAdmin,
  markDebugReportMailSent,
} from '@/lib/debug-report-db';
import type { DebugReportListItem, DebugReportRow } from '@/lib/debug-report-types';
import { sendDebugInboxEmail } from '@/lib/send-debug-inbox-email';
import {
  buildDebugVerifyMachineFooter,
  buildDebugVerifySubject,
} from '@/lib/debug-report-email-format';

export async function submitDebugReportAction(input: {
  bodyMarkdown: string;
  title?: string | null;
  context?: Record<string, unknown> | null;
}): Promise<{
  ok?: boolean;
  id?: number;
  error?: string;
  mailSent?: boolean;
  mailNote?: string;
}> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return { error: '로그인이 필요합니다.' };
  }
  const body = String(input.bodyMarkdown ?? '').trim();
  if (!body) {
    return { error: '전송할 마크다운이 없습니다.' };
  }

  const title = input.title?.trim()?.slice(0, 500) || null;
  const ctxStr =
    input.context != null
      ? JSON.stringify(input.context, null, 0).slice(0, 12000)
      : null;

  try {
    const { id } = await insertDebugReport({
      submitterEmail: session.user.email.toLowerCase(),
      submitterName: session.user.name?.trim() || null,
      title,
      bodyMarkdown: body,
      contextJson: ctxStr,
    });

    const inbox = process.env.ADMIN_DEBUG_EMAIL?.trim();
    let mailSent = false;
    let mailNote: string | undefined;

    if (!inbox) {
      mailNote = '메일 미설정(ADMIN_DEBUG_EMAIL). DB에만 저장됨.';
    } else {
      const subject = buildDebugVerifySubject(id, title);
      const head = `제출자: ${session.user.email} (${session.user.name ?? '이름없음'})\n리포트 ID: ${id}\n\n`;
      const footer = buildDebugVerifyMachineFooter({
        reportId: id,
        submitterEmail: session.user.email.toLowerCase(),
        submitterName: session.user.name?.trim() || null,
      });
      const sent = await sendDebugInboxEmail({
        to: inbox,
        subject,
        textBody:
          head +
          body +
          (ctxStr ? `\n\n--- context ---\n${ctxStr}` : '') +
          footer,
      });
      if (sent.ok) {
        await markDebugReportMailSent(id);
        mailSent = true;
      } else {
        mailNote = `메일 발송 실패: ${sent.error}`;
      }
    }

    return { ok: true, id, mailSent, mailNote };
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === '42P01') {
      return { error: 'debug_reports 테이블이 없습니다. npm run db:init 또는 마이그레이션을 실행하세요.' };
    }
    console.error('[submitDebugReportAction]', e);
    return { error: '저장에 실패했습니다.' };
  }
}

export async function listDebugReportsForAdminAction(): Promise<{
  rows: DebugReportListItem[];
  error?: string;
}> {
  const session = await getServerSession(authOptions);
  if (!canManageAccessRequests(session?.user?.email)) {
    return { rows: [], error: 'Forbidden' };
  }
  try {
    const rows = await listDebugReportsForAdmin(150);
    return { rows };
  } catch (e) {
    console.error('[listDebugReportsForAdminAction]', e);
    return { rows: [], error: '조회 실패' };
  }
}

export async function getDebugReportDetailAdminAction(
  id: number
): Promise<{ row: DebugReportRow | null; error?: string }> {
  const session = await getServerSession(authOptions);
  if (!canManageAccessRequests(session?.user?.email)) {
    return { row: null, error: 'Forbidden' };
  }
  try {
    const row = await getDebugReportByIdForAdmin(id);
    return { row };
  } catch (e) {
    console.error('[getDebugReportDetailAdminAction]', e);
    return { row: null, error: '조회 실패' };
  }
}
