/** 주소 문자열로 공수의 데모용 권역 분류 */
export type PublicVetRegion = 'gyeonggi' | 'chungcheong';

export function addressMatchesGyeonggi(address: string): boolean {
  return /^경기/.test(address.trim());
}

export function addressMatchesChungcheong(address: string): boolean {
  const a = address.trim();
  return /^(충북|충남|충청|대전|세종)/.test(a) || /^충청북도|^충청남도|^대전광역시|^세종특별자치시/.test(a);
}

/** 행안부 national 레이어 `sido` 필드 기준 (공수의 탭) */
export function nationalSidoMatchesGyeonggi(sido: string | undefined): boolean {
  if (!sido) return false;
  return sido === '경기도' || sido.startsWith('경기');
}

export function nationalSidoMatchesChungcheong(sido: string | undefined): boolean {
  if (!sido) return false;
  return (
    sido.includes('충청') ||
    sido.includes('충북') ||
    sido.includes('충남') ||
    sido === '대전광역시' ||
    sido.includes('세종')
  );
}
