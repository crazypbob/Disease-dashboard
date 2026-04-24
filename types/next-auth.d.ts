import type { DefaultSession } from 'next-auth';
import type { DashboardRole } from '@/lib/dashboard-role';

declare module 'next-auth' {
  interface Session {
    user: DefaultSession['user'] & {
      role?: DashboardRole;
      /** db_allowlist 정책에서 approved_users(또는 owner/allowed)로 승인되었는지 */
      approved?: boolean;
      /** OAuth provider id (google/naver/...) */
      provider?: string;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role?: DashboardRole;
    approved?: boolean;
    provider?: string;
  }
}
