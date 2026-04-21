/**
 * 매트릭스 vs PDF 검증용 HTML 리포트 생성
 * - DB 레코드를 매트릭스와 동일한 형태로 정리
 * - 각 셀에 PDF 링크 포함 → 브라우저에서 열어 실제 결과지와 대조
 *
 * npx tsx scripts/verify-matrix-report.ts [farm_code] [limit]
 * → scripts/verify-matrix.html 생성
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env.local' });

const BASE = process.env.BASE_URL ? String(process.env.BASE_URL).replace(/\/$/, '') : '';

async function main() {
  const farm = process.argv[2] || null;
  const limit = Math.min(parseInt(process.argv[3] || '50', 10), 200);

  const { sql } = await import('../lib/db');
  const { FARMS } = await import('../lib/farms');
  const { buildMatrixColumns, buildSingleCellMap, getPrrsPair, formatMonthDay, farmRowsByGroup } = await import('../lib/matrix');
  const { parseTestResult } = await import('../lib/result-display');
  const records = (await sql`
    SELECT id, date::text, farm_code, disease, test_type, result, pdf_file_id
    FROM test_records
    ${farm ? sql`WHERE farm_code = ${farm}` : sql``}
    ORDER BY date DESC, farm_code, disease
    LIMIT ${limit}
  `) as { id: number; date: string; farm_code: string; disease: string; test_type: string; result: string; pdf_file_id: string | null }[];

  const columns = buildMatrixColumns(records as any);
  const singleCellMap = buildSingleCellMap(records as any, columns);
  const rows = farmRowsByGroup(farm, records as any, false);
  const farms = rows.flatMap((r) => r.codes);

  const farmName = (code: string) => FARMS[code as keyof typeof FARMS]?.name ?? code;

  let html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>매트릭스 검증 - ${farm || '전체'} ${records.length}건</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 16px; background: #f5f5f5; }
    h1 { font-size: 1.25rem; margin-bottom: 8px; }
    p { font-size: 12px; color: #666; margin-bottom: 16px; }
    table { border-collapse: collapse; background: white; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
    th, td { border: 1px solid #e5e5e5; padding: 6px 8px; font-size: 12px; }
    th { background: #fafafa; font-weight: 600; }
    .pos { color: #dc2626; font-weight: bold; }
    .neg { color: #059669; font-weight: bold; }
    a { color: #2563eb; text-decoration: underline; }
    a:hover { color: #1d4ed8; }
    .no-link { color: #999; }
    .check { margin-left: 4px; font-size: 10px; }
  </style>
</head>
<body>
  <h1>매트릭스 검증 체크리스트</h1>
  <p>아래 표는 DB 레코드를 매트릭스와 동일한 형태로 보여줍니다. PDF 링크를 클릭해 실제 결과지와 대조 후 맞으면 ✓ 체크하세요.</p>
  <table>
`;

  // 헤더: 농장 | 날짜1 (PRRS Ag/Ab) | 날짜1 PED | ...
  html += '    <tr><th>농장</th>';
  for (const col of columns) {
    if (col.kind === 'prrs_merged') {
      html += `<th>${formatMonthDay(col.date)}<br><small>PRRS Ag/Ab</small></th>`;
    } else {
      html += `<th>${formatMonthDay(col.date)}<br><small>${col.disease} ${col.test_type}</small></th>`;
    }
  }
  html += '</tr>\n';

  for (const code of farms) {
    html += `    <tr><td><b>${farmName(code)}</b><br><small>${code}</small></td>`;
    for (const col of columns) {
      if (col.kind === 'prrs_merged') {
        const pair = getPrrsPair(records as any, code, col.date);
        const ag = pair.ag;
        const ab = pair.ab;
        const rec = ag || ab;
        const url = rec?.pdf_file_id ? `${BASE}/api/pdf?id=${rec.id}` : null;
        const agSym = ag ? parseTestResult(ag.result).symbol : '—';
        const abSym = ab ? parseTestResult(ab.result).symbol : '—';
        const agClass = ag && parseTestResult(ag.result).variant === 'positive' ? 'pos' : ag ? 'neg' : '';
        const abClass = ab && parseTestResult(ab.result).variant === 'positive' ? 'pos' : ab ? 'neg' : '';
        const link = url ? `<a href="${url}" target="_blank">Ag:${agSym} Ab:${abSym}</a>` : `<span class="no-link">Ag:${agSym} Ab:${abSym}</span>`;
        html += `<td>${link} <span class="check">□</span></td>`;
      } else {
        const cell = singleCellMap.get(code)?.get(col.key);
        if (!cell) {
          html += '<td>—</td>';
        } else {
          const url = cell.pdf_file_id ? `${BASE}/api/pdf?id=${cell.id}` : null;
          const { symbol, variant } = parseTestResult(cell.result);
          const cls = variant === 'positive' ? 'pos' : variant === 'negative' ? 'neg' : '';
          const link = url ? `<a href="${url}" target="_blank" class="${cls}">${symbol}</a>` : `<span class="${cls}">${symbol}</span>`;
          html += `<td>${link} <span class="check">□</span></td>`;
        }
      }
    }
    html += '</tr>\n';
  }

  html += `  </table>
  <p style="margin-top: 16px;">생성: ${new Date().toLocaleString('ko-KR')} | ${records.length}건</p>
</body>
</html>`;

  const outPath = path.join(process.cwd(), 'scripts', 'verify-matrix.html');
  fs.writeFileSync(outPath, html, 'utf-8');

  console.log(`\n검증 리포트 생성: ${outPath}`);
  console.log('브라우저에서 열어 PDF 링크를 클릭한 뒤, 실제 결과지와 매트릭스 표시를 대조하세요.\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
