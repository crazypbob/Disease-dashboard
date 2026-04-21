/**
 * 질병 필터 그룹 규칙 검증 (서버 없이 DB 직접 조회)
 *
 * 실행:
 *   npx tsx scripts/verify-disease-filtering.ts
 *
 * 출력:
 *   필터 코드별 매칭 건수 + 샘플(일부)
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { recordMatchesDiseaseFilter } from '@/lib/disease-filtering';
import { DISEASE_FILTER_OPTIONS, type DiseaseFilterCode } from '@/lib/disease-filter';

type Row = { id: number; date: string; farm_code: string; disease: string; test_type: string; result: string };

async function main() {
  const hasDb = Boolean(process.env.DATABASE_URL);
  let rows: Row[] = [];
  if (hasDb) {
    const { sql } = await import('@/lib/db');
    rows = (await sql`
      SELECT id, date::text, farm_code, disease, test_type, result
      FROM test_records
      ORDER BY date DESC
      LIMIT 2000
    `) as Row[];
  } else {
    // DB 연결이 없는 환경에서도 그룹 규칙 자체는 검증 가능하도록 최소 샘플로 테스트한다.
    rows = [
      { id: 1, date: '2026-03-20', farm_code: 'DB3001', disease: 'PRRS', test_type: 'ELISA', result: '+' },
      { id: 2, date: '2026-03-20', farm_code: 'DB3001', disease: 'PED', test_type: 'PCR', result: '-' },
      { id: 3, date: '2026-03-20', farm_code: 'DB3001', disease: 'IAV', test_type: 'PCR', result: '+' },
      { id: 4, date: '2026-03-20', farm_code: 'DB3001', disease: 'PCV-2', test_type: 'ELISA', result: '-' },
      { id: 5, date: '2026-03-20', farm_code: 'DB3001', disease: 'MH', test_type: 'PCR', result: '+' },
      { id: 6, date: '2026-03-20', farm_code: 'DB3001', disease: 'APP', test_type: 'PCR', result: '+' },
      { id: 7, date: '2026-03-20', farm_code: 'DB3001', disease: '세균', test_type: '세균배양', result: '+' },
      { id: 8, date: '2026-03-20', farm_code: 'DB3001', disease: 'Sal', test_type: 'PCR', result: '+' },
      { id: 9, date: '2026-03-20', farm_code: 'DB3001', disease: 'PRRS', test_type: '유전자분석', result: '+' },
      { id: 10, date: '2026-03-20', farm_code: 'DB3001', disease: '수질', test_type: '수질검사', result: '+' },
      { id: 11, date: '2026-03-20', farm_code: 'DB3001', disease: 'CSF', test_type: 'PCR', result: '+' },
      { id: 12, date: '2026-03-20', farm_code: 'DB3001', disease: 'FMD', test_type: 'ELISA', result: '+' },
    ];
  }

  console.log(`rows=${rows.length} (db=${hasDb ? 'on' : 'off'})`);

  const codes = DISEASE_FILTER_OPTIONS.map((x) => x.code) as DiseaseFilterCode[];
  for (const code of codes) {
    const selected = new Set<DiseaseFilterCode>([code]);
    const matched = rows.filter((r) => recordMatchesDiseaseFilter(r as any, selected));
    const sample = matched.slice(0, 5).map((r) => `${r.date} ${r.farm_code} ${r.disease} ${r.test_type} ${r.result}`);
    console.log(`- ${code}: ${matched.length}${sample.length ? ` | sample: ${sample.join(' / ')}` : ''}`);
  }

  // sanity: OTHER should not include known hits when they have a dedicated group
  const otherSelected = new Set<DiseaseFilterCode>(['OTHER']);
  const other = rows.filter((r) => recordMatchesDiseaseFilter(r as any, otherSelected));
  const hasKnown = other.some((r) =>
    ['PRRS', 'PED', 'SIV', 'IAV', 'PCV2', 'PCV-2', 'MH', 'APP', '세균'].includes(r.disease) ||
    String(r.test_type ?? '').includes('유전자') ||
    String(r.test_type ?? '').includes('염기서열') ||
    String(r.test_type ?? '').includes('수질') ||
    r.disease === '수질'
  );
  console.log(`OTHER_contains_known=${hasKnown ? 'YES(verify rules)' : 'no'}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

