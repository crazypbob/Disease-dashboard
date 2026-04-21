/**
 * 검사 구분 표기: ELISA → Ab(항체), PCR → Ag(항원)
 * ingest/GAS는 기존처럼 ELISA·PCR로 넣어도 화면에서 Ab·Ag로 표시
 */

export function prrsAssaySlot(testType: string): 'ag' | 'ab' | null {
  const t = testType.trim().toUpperCase().replace(/\s/g, '');
  if (t === 'PCR' || t === 'AG' || t === 'ANTIGEN') return 'ag';
  if (t === 'ELISA' || t === 'AB' || t === 'ANTIBODY') return 'ab';
  return null;
}

/** 단일 열 헤더용 (PRRS 병합 열 제외) */
export function formatAssayLabel(testType: string): string {
  const slot = prrsAssaySlot(testType);
  if (slot === 'ag') return 'Ag';
  if (slot === 'ab') return 'Ab';
  const u = testType.trim().toUpperCase();
  if (u.includes('유전자') || u.includes('염기서열')) return '유전자';
  if (u.includes('세균') || u.includes('배양')) return '세균';
  if (u.includes('VN')) return 'VN';
  return testType.trim();
}
