'use client';

type ColumnMeta = { key: string; month: string; disease: string };

type Row = { sido: string; cells: Record<string, { tests: number; positives: number }> };

type Props = {
  rows: Row[];
  columnMeta: ColumnMeta[];
};

export function SidoAggregateMatrix({ rows, columnMeta }: Props) {
  if (rows.length === 0 || columnMeta.length === 0) {
    return (
      <div className="rounded border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
        집계할 데이터가 없습니다. 기간·질병 필터를 넓혀 보세요.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-zinc-500">
        중앙정부 집계 뷰: 행은 시·도, 열은 월·질병(원본 disease). 셀은 <span className="font-medium">검사건수</span> /{' '}
        <span className="font-semibold text-red-600">양성</span>.
      </p>
      <div className="max-h-[min(70vh,720px)] overflow-auto rounded border border-zinc-200">
        <table className="min-w-max border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-zinc-50">
            <tr>
              <th className="sticky left-0 z-20 border border-zinc-200 bg-zinc-100 px-2 py-2 text-left font-semibold text-zinc-800">
                시·도
              </th>
              {columnMeta.map((c) => (
                <th
                  key={c.key}
                  className="min-w-[72px] border border-zinc-200 px-1 py-1.5 text-center font-medium text-zinc-700"
                  title={c.disease}
                >
                  <div className="text-[10px] text-zinc-500">{c.month}</div>
                  <div className="mt-0.5 max-w-[100px] truncate text-[11px]">{c.disease}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.sido} className={i % 2 === 0 ? 'bg-white' : 'bg-zinc-50/50'}>
                <th className="sticky left-0 z-10 border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-left font-medium text-zinc-800">
                  {r.sido}
                </th>
                {columnMeta.map((c) => {
                  const cell = r.cells[c.key];
                  return (
                    <td key={c.key} className="border border-zinc-200 px-1 py-1 text-center align-middle tabular-nums">
                      {cell ? (
                        <span>
                          {cell.tests}
                          <span className="text-zinc-400"> / </span>
                          <span className="font-semibold text-red-600">{cell.positives}</span>
                        </span>
                      ) : (
                        <span className="text-zinc-300">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
