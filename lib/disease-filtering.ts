import type { TestRecord } from '@/app/api/records/route';
import { PIG_BACTERIAL_DISEASES } from '@/lib/optipharm-reference';
import type { DiseaseFilterCode } from '@/lib/disease-filter';

function norm(s: string | null | undefined) {
  return String(s ?? '').trim();
}

function isGenomicTestType(testType: string) {
  const t = norm(testType);
  return t.includes('유전자') || t.includes('염기서열');
}

function isAntibioticSusceptibilityRecord(r: Pick<TestRecord, 'disease' | 'test_type'>) {
  const d = norm(r.disease);
  const t = norm(r.test_type);
  if (d === '항생제 감수성검사') return true;
  // 기존 세균 카테고리 안에서, 양/음성 대신 "결과지 존재"형 검사
  return (d === '세균' || OTHER_BACTERIA_CODES.has(d)) && (t.includes('감수성') || t.includes('내성'));
}

function isWaterRecord(r: Pick<TestRecord, 'disease' | 'test_type'>) {
  const d = norm(r.disease);
  const t = norm(r.test_type);
  return d === '수질' || t.includes('수질');
}

function bacterialCodesExcludingMhApp(): Set<string> {
  const s = new Set<string>();
  for (const d of PIG_BACTERIAL_DISEASES) {
    if (d.code === 'MH' || d.code === 'APP') continue;
    s.add(d.code);
  }
  return s;
}

const OTHER_BACTERIA_CODES = bacterialCodesExcludingMhApp();

export function recordMatchesDiseaseFilter(
  r: Pick<TestRecord, 'disease' | 'test_type'>,
  selected: Set<DiseaseFilterCode>
): boolean {
  if (selected.size === 0) return true;

  const disease = norm(r.disease);
  const testType = norm(r.test_type);

  const matched: DiseaseFilterCode[] = [];

  // direct singles
  if (disease === 'PRRS') matched.push('PRRS');
  if (disease === 'PED') matched.push('PED');
  if (disease === 'PCV2' || disease === 'PCV-2') matched.push('PCV2');
  if (disease === 'MH') matched.push('MH');
  if (disease === 'MHR') matched.push('MHR');
  if (disease === 'APP') matched.push('APP');
  if (disease === 'SIV' || disease === 'IAV') matched.push('SIV');

  // grouped
  if (isAntibioticSusceptibilityRecord(r)) matched.push('ABX_SUSC');
  if (isGenomicTestType(testType)) matched.push('GENOMIC');
  if (isWaterRecord(r)) matched.push('WATER');
  if (disease === '세균' || OTHER_BACTERIA_CODES.has(disease)) matched.push('OTHER_BACTERIA');

  // OTHER: anything not covered above
  if (matched.length === 0) matched.push('OTHER');

  return matched.some((m) => selected.has(m));
}

