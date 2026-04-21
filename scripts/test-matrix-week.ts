/**
 * 매트릭스 주간 묶음 단위 검증 (런너 없음: npx tsx scripts/test-matrix-week.ts)
 */
import assert from 'assert';
import {
  buildMatrixColumns,
  getPrrsPair,
  mondayOfWeek,
  type MatrixRecord,
} from '../lib/matrix';

function ok(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.error(`  ✗ ${name}`, e);
    process.exit(1);
  }
}

ok('금요일 → 해당 주 월요일', () => {
  assert.strictEqual(mondayOfWeek('2026-04-10'), '2026-04-06');
});

ok('일요일 → 해당 주 월요일', () => {
  assert.strictEqual(mondayOfWeek('2026-04-12'), '2026-04-06');
});

ok('같은 주 PRRS Ab 두 건 중 id 큰 쪽', () => {
  const records: MatrixRecord[] = [
    {
      id: 10,
      date: '2026-04-08',
      farm_code: 'DB1001',
      disease: 'PRRS',
      test_type: 'ELISA',
      result: '-',
      pdf_file_id: null,
    },
    {
      id: 20,
      date: '2026-04-10',
      farm_code: 'DB1001',
      disease: 'PRRS',
      test_type: 'ELISA',
      result: '+',
      pdf_file_id: null,
    },
  ];
  const { ab } = getPrrsPair(records, 'DB1001', '2026-04-06', 'week');
  assert(ab && ab.id === 20 && ab.result === '+');
});

ok('같은 날짜 질병 열 순서 (PRRS→PED→SIV→APP→MH→MHR→세균)', () => {
  const records: MatrixRecord[] = [
    { id: 1, date: '2026-04-10', farm_code: 'DB1001', disease: 'APP', test_type: 'ELISA', result: '-', pdf_file_id: null },
    { id: 2, date: '2026-04-10', farm_code: 'DB1001', disease: 'PED', test_type: 'PCR', result: '-', pdf_file_id: null },
    { id: 3, date: '2026-04-10', farm_code: 'DB1001', disease: 'PRRS', test_type: 'PCR', result: '-', pdf_file_id: null },
    { id: 4, date: '2026-04-10', farm_code: 'DB1001', disease: 'SIV', test_type: 'PCR', result: '-', pdf_file_id: null },
    { id: 5, date: '2026-04-10', farm_code: 'DB1001', disease: 'MH', test_type: 'ELISA', result: '-', pdf_file_id: null },
    { id: 6, date: '2026-04-10', farm_code: 'DB1001', disease: 'MHR', test_type: 'PCR', result: '-', pdf_file_id: null },
    { id: 7, date: '2026-04-10', farm_code: 'DB1001', disease: '세균', test_type: 'PCR', result: '-', pdf_file_id: null },
  ];
  const cols = buildMatrixColumns(records);
  const same = cols.filter((c) => c.date === '2026-04-10');
  const labels = same.map((c) =>
    c.kind === 'prrs_merged' ? 'PRRS' : c.kind === 'ab_ag_merged' ? c.disease : c.disease
  );
  assert.deepStrictEqual(labels, ['PRRS', 'PED', 'SIV', 'APP', 'MH', 'MHR', '세균']);
});

console.log('test-matrix-week: all passed');
