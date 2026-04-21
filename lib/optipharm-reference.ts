/**
 * 돼지 전용 — (주)옵티팜 병성진단 수수료 안내(2023) PDF 기준
 * GAS 파싱·ingest 시 disease / test_type 통일용
 *
 * 검사 구분:
 * - ELISA, PCR, VN test: 바이러스성 질병
 * - 세균배양: 세균성만 (APP, 살모넬라 등)
 */

export type DiseaseRef = {
  code: string;
  nameKo: string;
  aliases?: string[];
  typicalTests: string[];
};

/** 돼지 바이러스성 질병 (매트릭스·파싱 참고) */
export const PIG_DISEASES: DiseaseRef[] = [
  { code: 'PRRS', nameKo: '돼지생식기호흡기증후군', aliases: ['PRRSV'], typicalTests: ['ELISA', 'PCR', 'VN test'] },
  { code: 'PED', nameKo: '돼지 유행성 설사병', aliases: ['PEDV'], typicalTests: ['ELISA', 'PCR', 'VN test', 'IgA'] },
  { code: 'PCV2', nameKo: '돼지 써코바이러스 2형', aliases: ['PCV-2'], typicalTests: ['ELISA', 'PCR'] },
  { code: 'CSF', nameKo: '돼지 열병', aliases: ['CSFV'], typicalTests: ['PCR', 'ELISA'] },
  { code: 'PPV', nameKo: '돼지 파보바이러스', typicalTests: ['ELISA', 'PCR'] },
  { code: 'PDCoV', nameKo: '돼지 델타코로나바이러스', typicalTests: ['PCR'] },
  { code: 'ADV', nameKo: '돼지 오제스키병', typicalTests: ['ELISA', 'PCR'] },
  { code: 'IAV', nameKo: '돼지 인플루엔자 바이러스', typicalTests: ['ELISA', 'PCR'] },
];

/** 돼지 세균·미생물 — 세균배양 중심 */
export const PIG_BACTERIAL_DISEASES: DiseaseRef[] = [
  { code: 'APP', nameKo: '흉막 폐렴', typicalTests: ['세균배양', 'PCR', '항원검사'] },
  { code: 'Sal', nameKo: '살모넬라증', typicalTests: ['세균배양', 'ELISA'] },
  { code: 'Law', nameKo: '증식성회장염', typicalTests: ['PCR'] },
  { code: 'MH', nameKo: '마이코플라즈마성 폐렴', typicalTests: ['ELISA', 'PCR'] },
  { code: 'HP', nameKo: '글래서씨병', typicalTests: ['세균배양', 'PCR'] },
];

export const PIG_TEST_TYPES = ['ELISA', 'PCR', 'VN test', '세균배양', '항원검사', 'IgA'] as const;
