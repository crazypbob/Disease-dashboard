/**
 * 검사 결과 → 매트릭스 표시 (+ 양성 빨강 / - 음성 초록)
 */
export type ResultVariant = 'positive' | 'negative' | 'equivocal' | 'reported' | 'empty' | 'unknown';

export function parseTestResult(result: string | null | undefined): {
  symbol: string;
  variant: ResultVariant;
} {
  if (result == null || result === '') {
    return { symbol: '—', variant: 'empty' };
  }
  const raw = result.trim();
  const r = raw.toLowerCase();
  const compact = r.replace(/\s/g, '');

  const equivocal =
    r === '?' ||
    compact === '?' ||
    r === '의심' ||
    r.startsWith('의심') ||
    r.includes('equivocal') ||
    r === '±';

  const positive =
    r === '양성' ||
    r === '+' ||
    compact === 'pos' ||
    r === 'positive' ||
    r.startsWith('양성') ||
    r.includes('positive') ||
    r === 'reactive' ||
    r === '반응';

  const negative =
    r === '음성' ||
    r === '-' ||
    compact === 'neg' ||
    r === 'negative' ||
    r.startsWith('음성') ||
    r.includes('negative') ||
    r === 'non-reactive' ||
    r === '무반응';

  // 양성/음성이 아닌 "결과지 존재"형 (항생제 감수성 검사 등)
  const reported =
    r === 'v' ||
    compact === 'v' ||
    r === '있음' ||
    r.includes('결과지') ||
    r.includes('보고서') ||
    r.includes('감수성') ||
    r.includes('내성');

  // ELISA S/P·괄호 음성: "0.03 (-)", "- -0.01", "1.2 ( - )" 등
  const parenNeg = /\(\s*[-−]\s*\)/.test(raw);
  const spDoubleMinus = /^[\s]*[-−]\s*[-−]\s*0\.\d+/i.test(raw.trim());

  if (equivocal) return { symbol: '?', variant: 'equivocal' };
  if (positive) return { symbol: '+', variant: 'positive' };
  if (negative || parenNeg || spDoubleMinus) return { symbol: '-', variant: 'negative' };
  if (reported) return { symbol: 'V', variant: 'reported' };

  return { symbol: raw, variant: 'unknown' };
}
