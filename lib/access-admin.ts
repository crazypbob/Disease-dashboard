import { isOwnerEmail } from '@/lib/dashboard-role';

/** 가입 요청 승인 UI/API — OWNER_EMAILS 또는 ADMIN_EMAILS만 (ALLOWED 전체는 제외) */
export function canManageAccessRequests(email: string | null | undefined): boolean {
  if (!email) return false;
  if (isOwnerEmail(email)) return true;
  const admins = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(email.trim().toLowerCase());
}
