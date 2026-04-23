import type { Session } from 'next-auth';
import { isInternalDabiOnly } from '@/lib/dashboard-role';
import type { MatrixScope } from '@/lib/matrix-region-filters';

/** 내부(dabi 전용) 계정은 항상 다비 스코프로만 집계·조회한다. */
export function effectiveMatrixScopeForRestrictedUser(
  session: Session | null,
  parsed: MatrixScope | null
): MatrixScope | null {
  if (!isInternalDabiOnly(session)) return parsed;
  return 'dabi';
}
