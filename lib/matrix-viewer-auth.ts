import type { MatrixScope } from '@/lib/matrix-region-filters';

function parseEmailSet(envVal: string | undefined): Set<string> {
  return new Set(
    (envVal ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

/**
 * 상용: 역할별 이메일 화이트리스트. 해당 변수가 비어 있으면 그 역할은 모든 로그인 사용자에게 허용(데모).
 */
export function canUseMatrixScope(email: string | undefined, scope: MatrixScope): boolean {
  if (!email || scope === 'default') return true;
  const e = email.trim().toLowerCase();
  const map: { key: MatrixScope; env: string | undefined }[] = [
    { key: 'dabi', env: process.env.MATRIX_DABI_EMAILS },
    { key: 'gov_central', env: process.env.MATRIX_GOV_CENTRAL_EMAILS },
    { key: 'gov_local', env: process.env.MATRIX_GOV_LOCAL_EMAILS },
    { key: 'public_vet', env: process.env.MATRIX_PUBLIC_VET_EMAILS },
    { key: 'vet_assigned', env: process.env.MATRIX_VET_ASSIGNED_EMAILS },
    { key: 'vet_union', env: process.env.MATRIX_VET_UNION_EMAILS },
  ];
  const entry = map.find((m) => m.key === scope);
  if (!entry) return true;
  const allowed = parseEmailSet(entry.env);
  if (allowed.size === 0) return true;
  return allowed.has(e);
}
