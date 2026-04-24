/**
 * OCR/엑셀 행 텍스트에 클로스트리디움 계열이 있는지 판별.
 * - 전북대 등에서 「추출결과/분석결과」열이 PRRS 유전자로 매핑되지만,
 *   실제 본문은 Clostridium novyi / difficile / perfringens 인 오분류를 막기 위함.
 * - 돼지 검사에서 자주 쓰는 표기: novyi(noyvi 오타), difficile, perfringens 타입 A/C 등.
 */
export function rowTextSuggestsClostridium(text: string): boolean {
  const u = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!u) return false;
  if (/Clostridium/i.test(u)) return true;
  if (/클로스트리디움|클로스트리듐/i.test(u)) return true;
  if (/\bC\.\s*(?:diff|novyi|noyvi|perf)/i.test(u)) return true;
  if (/difficile|디프리실|디피실/i.test(u)) return true;
  if (/perfringens|퍼프링겐스/i.test(u)) return true;
  if (/\bnovyi\b|\bnoyvi\b/i.test(u)) return true;
  return false;
}
