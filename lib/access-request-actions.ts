'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { canManageAccessRequests } from '@/lib/access-admin';
import type { AccessRequestRow } from '@/lib/access-request-types';
import {
  hasPendingRequestForEmail,
  insertAccessRequest,
  listPendingAccessRequests,
  listRecentAccessRequests,
  resolveAccessRequest,
  revokeAccessApprovalByRequestId,
  getAccessRequestById,
} from '@/lib/user-access-db';
import { isOwnerEmail } from '@/lib/dashboard-role';
import {
  grantReaderOnPdfLibraryFolder,
  revokeReaderOnPdfLibraryFolder,
} from '@/lib/drive-share-approved';

export type SubmitAccessRequestState = { ok?: boolean; error?: string };

export async function submitAccessRequestAction(
  _prev: SubmitAccessRequestState,
  formData: FormData
): Promise<SubmitAccessRequestState> {
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  const legalName =
    String(formData.get('legalName') ?? formData.get('displayName') ?? '')
      .trim()
      .slice(0, 200) || '';
  const note = String(formData.get('note') ?? '').trim().slice(0, 2000) || null;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(email)) {
    return { error: '유효한 이메일을 입력하세요.' };
  }
  if (legalName.length < 2) {
    return { error: '실명을 2자 이상 입력해 주세요.' };
  }

  try {
    if (await hasPendingRequestForEmail(email)) {
      return { error: '이미 대기 중인 요청이 있습니다. 관리자 승인을 기다려 주세요.' };
    }
    await insertAccessRequest({ email, displayName: legalName, note });
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === '42P01') {
      return {
        error:
          '접수 시스템을 준비 중입니다. 잠시 후 다시 시도해 주시거나, 문제가 계속되면 관리자에게 문의해 주세요.',
      };
    }
    console.error('[submitAccessRequestAction]', e);
    return { error: '저장에 실패했습니다.' };
  }

  return { ok: true };
}

export async function listAccessRequestsForAdminAction(
  scope: 'pending' | 'all'
): Promise<{ requests: AccessRequestRow[]; error?: string }> {
  const session = await getServerSession(authOptions);
  if (!canManageAccessRequests(session?.user?.email)) {
    return { requests: [], error: 'Forbidden' };
  }
  try {
    const requests =
      scope === 'all' ? await listRecentAccessRequests(80) : await listPendingAccessRequests();
    return { requests };
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === '42P01') {
      return { requests: [], error: '테이블 없음 — init-db 또는 migrations 실행 필요' };
    }
    console.error('[listAccessRequestsForAdminAction]', e);
    return { requests: [], error: '조회 실패' };
  }
}

export async function resolveAccessRequestAdminAction(input: {
  id: number;
  action: 'approve' | 'reject';
}): Promise<{ ok?: boolean; email?: string; error?: string; driveShareWarning?: string }> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !canManageAccessRequests(session.user.email)) {
    return { error: 'Forbidden' };
  }
  const resolver = session.user.email;
  try {
    const result = await resolveAccessRequest({
      id: input.id,
      status: input.action === 'approve' ? 'approved' : 'rejected',
      resolverEmail: resolver,
      dashboardRole: 'internal_dabi',
    });
    if (!result) {
      return { error: '대기 요청을 찾을 수 없습니다.' };
    }
    if (input.action === 'approve') {
      const share = await grantReaderOnPdfLibraryFolder(result.email);
      if (!share.ok) {
        return {
          ok: true,
          email: result.email,
          driveShareWarning: `로그인 승인은 완료되었으나 Drive 뷰어 공유에 실패했습니다: ${share.message}`,
        };
      }
    }
    return { ok: true, email: result.email };
  } catch (e) {
    console.error('[resolveAccessRequestAdminAction]', e);
    return { error: '처리 실패' };
  }
}

export async function revokeAccessApprovalAdminAction(input: {
  requestId: number;
}): Promise<{ ok?: boolean; email?: string; error?: string; driveShareWarning?: string }> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !canManageAccessRequests(session.user.email)) {
    return { error: 'Forbidden' };
  }
  const resolver = session.user.email;
  const row = await getAccessRequestById(input.requestId);
  if (!row || row.status !== 'approved') {
    return { error: '승인된 요청만 취소할 수 있습니다.' };
  }
  if (isOwnerEmail(row.email)) {
    return { error: '소유자(OWNER_EMAILS) 이메일은 승인 취소할 수 없습니다.' };
  }
  try {
    const result = await revokeAccessApprovalByRequestId({
      requestId: input.requestId,
      resolverEmail: resolver,
    });
    if (!result) {
      return { error: '요청을 찾을 수 없거나 이미 취소되었습니다.' };
    }
    const share = await revokeReaderOnPdfLibraryFolder(result.email);
    if (!share.ok) {
      return {
        ok: true,
        email: result.email,
        driveShareWarning: `로그인 승인은 취소되었으나 Drive 공유 회수에 실패했습니다: ${share.message}`,
      };
    }
    return { ok: true, email: result.email };
  } catch (e) {
    console.error('[revokeAccessApprovalAdminAction]', e);
    return { error: '승인 취소에 실패했습니다.' };
  }
}
