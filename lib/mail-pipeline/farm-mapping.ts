/**
 * 농장명/코드 매핑 (GAS getFarmCode 이식)
 */
import { FARMS, type FarmCode } from '@/lib/farms';

const CODE_ALIASES: Record<string, FarmCode> = {
  'DB1003-1': 'DB1003',
  'DB3005-1': 'DB3005',
  'DB3015-1': 'DB3015',
  'DB3021-1': 'DB3021',
  'DB0323': 'DB3023',
  'DB2005-2': 'DB2005',
  DA3023: 'DB3023',
  // 과거 오타/케이스 혼재: db2023 → 실제는 한빛청주(DB3023)
  db2023: 'DB3023',
  DB2023: 'DB3023',
  DA2005: 'DB2005',
  DA2006: 'DB2006',
  DA2007: 'DB2007',
  DA2008: 'DB2008',
  DA2009: 'DB2009',
  DA2010: 'DB2010',
  DA2011: 'DB2011',
  '3023': 'DB3023',
  /** 축약코드: (qPCR) 25-xxx DA20, (염기서열) 25-xxx DA2 — 출처 검증 필요. 잘못되었으면 수정 */
  DA20: 'DB2006', // 대월(2006) 추정
  DA2: 'DB2007',  // 삼성(2007) 추정
  // 전북대(jb5219) 파일명 4자리 숫자 코드: parser.py가 "2006대월" 형태로 추출하므로
  // NAME_ALIASES substring 검색으로 대부분 처리됨. 숫자만 남는 엣지케이스 대비.
  '1001': 'DB1001', '1002': 'DB1002', '1003': 'DB1003',
  '2005': 'DB2005', '2006': 'DB2006', '2007': 'DB2007',
  '2008': 'DB2008', '2009': 'DB2009', '2010': 'DB2010',
  '2011': 'DB2011', '2012': 'DB2012', '2013': 'DB2013',
  '2014': 'DB2014', '2015': 'DB2015',
  '3001': 'DB3001', '3002': 'DB3002', '3005': 'DB3005',
  '3007': 'DB3007', '3014': 'DB3014', '3015': 'DB3015',
  '3016': 'DB3016', '3017': 'DB3017', '3019': 'DB3019',
  '3020': 'DB3020', '3021': 'DB3021', '3022': 'DB3022',
  '3024': 'DB3024', '3025': 'DB3025',
  '4014': 'DB4014',
  '4006': 'DB4006',
  '5001': 'DB5001', '5002': 'DB5002', '5003': 'DB5003',
  '6001': 'DB6001',
};

const NAME_ALIASES: Record<string, FarmCode> = {
  성진: 'DB1001',
  대덕: 'DB1002',
  디앤디: 'DB1003',
  도화: 'DB2005',
  대월: 'DB2006',
  삼성: 'DB2007',
  여울목: 'DB2008',
  해림: 'DB2009',
  문강: 'DB2010',
  서후: 'DB2011',
  원산: 'DB2012',
  고흥: 'DB2013',
  진천: 'DB2014',
  다원: 'DB2015',
  버들: 'DB4014',
  조산: 'DB3001',
  삼경: 'DB3002',
  관인: 'DB3005',
  효돈: 'DB3007',
  운도: 'DB3014',
  성일: 'DB3015',
  남도: 'DB3016',
  성산: 'DB3017',
  에이스팜: 'DB3019',
  지혜: 'DB3020',
  화진: 'DB3021',
  한빛피플: 'DB3022',
  한빛청주: 'DB3023',
  동산: 'DB3024',
  인솔: 'DB3025',
  중원: 'DB5001',
  조치원: 'DB5002',
  양산: 'DB5003',
  북부유전: 'DB6001',
  자영: 'DB4001',
  구산: 'DB4002',
  유기: 'DB4003',
  포월: 'DB4009',
  능국: 'DB4011',
  성진종돈: 'DB1001',
  대덕종돈: 'DB1002',
  디앤디2농장: 'DB1003',
  디앤디2: 'DB1003',
  대월이유자돈: 'DB2006',
  대월청안: 'DB2006',
  문강거세돈: 'DB2010',
  문강종돈: 'DB2010',
  '2010문강': 'DB2010',
  서충교: 'DB2010',
  여울목거세돈: 'DB2008',
  여울목종돈: 'DB2008',
  성진거세돈: 'DB1001',
  삼성거세돈: 'DB2007',
  상수농장: 'DB3005',
  '상수2농장': 'DB3005',
  상수: 'DB3005',
  해금농장: 'DB3015',
  해금: 'DB3015',
  화진육성사: 'DB3021',
  한빛연천: 'DB3022',
  한빛피플연천: 'DB3022',
  한빛: 'DB3023',
  '3023청주한빛': 'DB3023',
  '청주한빛': 'DB3023',
  동물진료법인네스트: 'DB3023',
  네스트: 'DB3023',
  원산종돈: 'DB2012',
  성일종돈: 'DB3015',
  다비연구소: 'DB9001',
  다비연구: 'DB9001',
  '염기서열분석 26-01243': 'DB9001',
  '다비유종 비교(26-01243)': 'DB9002',
  '다비유종 비교': 'DB9002',
  다비유종비교: 'DB9002',
  '4006거목': 'DB4006',
  '4006 거목': 'DB4006',
  발라드동물병원: 'DB9003',
  발라드: 'DB9003',
  종돈수송차량: 'DB9004',
  양승혁농장: 'DB1001',
  양승혁: 'DB1001',
  놀뫼: 'DB3023',
  '2001 서후': 'DB2011',
  '2011 서후': 'DB2011',
  '2011서후': 'DB2011',
  '2006 대월': 'DB2006',
  '2006대월': 'DB2006',
};

export function getFarmCode(nameOrCode: string | null | undefined): FarmCode | string {
  if (!nameOrCode) return '';
  const input = nameOrCode.trim();
  if (!input) return '';

  if (input in FARMS) return input as FarmCode;
  if (input in CODE_ALIASES) return CODE_ALIASES[input];
  if (input in NAME_ALIASES) return NAME_ALIASES[input];

  /** DA20, DA2 등 축약 코드 (CODE_ALIASES에 있으면 사용) */
  for (const alias of ['DA2007', 'DA2006', 'DA20', 'DA2']) {
    if (input.includes(alias) && alias in CODE_ALIASES) return CODE_ALIASES[alias];
  }

  /** (세균) 25-04547 DB3025 형태: 접수번호 뒤 농장코드가 정확 → DB/DA 코드를 최우선 추출 */
  const allCodes = input.match(/D[A-Z]\d{4}/gi);
  if (allCodes?.length) {
    for (const m of allCodes) {
      const code = ('DB' + m.slice(2)) as FarmCode;
      if (code in FARMS) return code;
      if (code in CODE_ALIASES) return CODE_ALIASES[code];
    }
  }

  const codeMatch = input.match(/D[A-Z](\d{4})/i);
  if (codeMatch) {
    const code = ('DB' + codeMatch[1]) as FarmCode;
    if (code in FARMS) return code;
    if (code in CODE_ALIASES) return CODE_ALIASES[code];
  }

  const subCodeMatch = input.match(/D[A-Z](\d{4})-\d+/i);
  if (subCodeMatch) {
    const subBase = ('DB' + subCodeMatch[1]) as FarmCode;
    const subFull = subBase + subCodeMatch[0].slice(subCodeMatch[0].indexOf('-'));
    if (subFull in CODE_ALIASES) return CODE_ALIASES[subFull];
    if (subBase in FARMS) return subBase;
  }

  const sortedNames = Object.keys(NAME_ALIASES).sort((a, b) => b.length - a.length);
  for (const name of sortedNames) {
    if (input.includes(name)) return NAME_ALIASES[name];
  }

  for (const [code, info] of Object.entries(FARMS)) {
    if (info.name && input.includes(info.name)) return code;
  }

  return input;
}
