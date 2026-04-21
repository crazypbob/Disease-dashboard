/**
 * 주소 문자열에서 시·도 단위 라벨 추출 (매트릭스 관할·집계용, 근사치).
 * 행안부 sido와 1:1이 아닐 수 있음.
 */
export function parseSidoLabelFromAddress(address: string): string | null {
  const a = address.trim();
  if (!a) return null;
  const rules: [RegExp, string][] = [
    [/^서울/, '서울특별시'],
    [/^부산/, '부산광역시'],
    [/^대구/, '대구광역시'],
    [/^인천/, '인천광역시'],
    [/^광주/, '광주광역시'],
    [/^대전/, '대전광역시'],
    [/^울산/, '울산광역시'],
    [/^세종/, '세종특별자치시'],
    [/^경기/, '경기도'],
    [/^강원/, '강원특별자치도'],
    [/^충북|^충청북도/, '충청북도'],
    [/^충남|^충청남도/, '충청남도'],
    [/^전북|^전라북도|^전북특별/, '전북특별자치도'],
    [/^전남|^전라남도/, '전라남도'],
    [/^경북|^경상북도/, '경상북도'],
    [/^경남|^경상남도/, '경상남도'],
    [/^제주/, '제주특별자치도'],
  ];
  for (const [re, label] of rules) {
    if (re.test(a)) return label;
  }
  return null;
}

/** 사용자 선택 값(경기도, 경기 등)이 라벨·주소와 맞는지 */
export function sidoMatchesFilter(filter: string, sidoLabel: string | null, address: string): boolean {
  const f = filter.trim();
  if (!f) return true;
  if (sidoLabel && (sidoLabel === f || sidoLabel.includes(f) || f.includes(sidoLabel.replace(/특별시|광역시|특별자치시|특별자치도|도$/g, '')))) {
    return true;
  }
  return address.includes(f);
}
