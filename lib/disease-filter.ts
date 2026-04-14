/** 매트릭스 질병 필터(그룹 코드) 옵션 */
export const DISEASE_FILTER_OPTIONS = [
  { code: 'PRRS', label: 'PRRS' },
  { code: 'PED', label: 'PED' },
  { code: 'SIV', label: 'SIV (인플루엔자)' },
  { code: 'PCV2', label: 'PCV2' },
  { code: 'MH', label: 'MH' },
  { code: 'MHR', label: 'MHR' },
  { code: 'APP', label: 'APP' },
  { code: 'OTHER_BACTERIA', label: '기타세균' },
  { code: 'ABX_SUSC', label: '항생제 감수성검사' },
  { code: 'GENOMIC', label: '유전자검사' },
  { code: 'WATER', label: '수질검사' },
  { code: 'OTHER', label: '나머지질병' },
] as const;

export type DiseaseFilterCode = (typeof DISEASE_FILTER_OPTIONS)[number]['code'];

export const DEFAULT_DISEASES: readonly DiseaseFilterCode[] = [
  'PRRS',
  'PED',
  'SIV',
  'PCV2',
  'MH',
  'MHR',
  'APP',
  'OTHER_BACTERIA',
  'ABX_SUSC',
  'GENOMIC',
  'WATER',
  'OTHER',
] as const;
