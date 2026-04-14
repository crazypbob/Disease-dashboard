/**
 * 메일 파이프라인 설정 (GAS codes.gs CONFIG 이식)
 */
export const MAIL_CONFIG = {
  PDF_FOLDER_NAME: '검사결과_PDF',
  NEW_FOLDER_NAME: '신규',
  ROOT_FOLDER_NAME: '질병메일링_대시보드',
  EMAIL_LABEL: '질병메일링_처리완료',
  EMAIL_LABEL_NAVER: '질병진단-네이버',
  EMAIL_SENDERS: [
    'optipharm',
    'optipharm.co.kr',
    '네스트',
    'nest',
    '전북대',
    '다비육종',
    '다비연구소',
    'darby',
    '카카오',
    'kakao',
  ],
  EMAIL_SUBJECT_KEYWORDS: [
    '검사',
    '결과',
    'PCR',
    'ELISA',
    '항원',
    '항체',
    '혈청',
    '염기서열',
    '유전자',
    '의뢰',
    '성진',
    '대덕',
  ],
  GEMINI_MODEL: 'gemini-2.5-flash',
} as const;
