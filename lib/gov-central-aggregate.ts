import type { TestRecord } from '@/app/api/records/route';
import { parseTestResult } from '@/lib/result-display';

export type AggregateCell = {
  tests: number;
  positives: number;
};

export type SidoMonthDiseaseRow = {
  sido: string;
  cells: Map<string, AggregateCell>;
};

/** key: YYYY-MM \t disease */
export function monthDiseaseKey(date: string, disease: string): string {
  const month = date.length >= 7 ? date.slice(0, 7) : date;
  return `${month}\t${disease.trim() || '—'}`;
}

export function buildSidoMonthDiseaseAggregates(
  records: TestRecord[],
  farmCodeToSido: Map<string, string>
): { rows: SidoMonthDiseaseRow[]; columnKeys: string[] } {
  const bySido = new Map<string, Map<string, AggregateCell>>();
  const colSet = new Set<string>();

  for (const r of records) {
    const sido = farmCodeToSido.get(r.farm_code) ?? '미분류';
    const ck = monthDiseaseKey(r.date, r.disease);
    colSet.add(ck);
    if (!bySido.has(sido)) bySido.set(sido, new Map());
    const row = bySido.get(sido)!;
    if (!row.has(ck)) row.set(ck, { tests: 0, positives: 0 });
    const cell = row.get(ck)!;
    cell.tests += 1;
    if (
      parseTestResult(r.result, { disease: r.disease, testType: r.test_type }).variant === 'positive'
    )
      cell.positives += 1;
  }

  const columnKeys = [...colSet].sort((a, b) => {
    const [ma, da] = a.split('\t');
    const [mb, db] = b.split('\t');
    if (ma !== mb) return mb.localeCompare(ma);
    return da.localeCompare(db, 'ko');
  });

  const sidos = [...bySido.keys()].sort((a, b) => a.localeCompare(b, 'ko'));
  const rows: SidoMonthDiseaseRow[] = sidos.map((sido) => ({
    sido,
    cells: bySido.get(sido)!,
  }));

  return { rows, columnKeys };
}
