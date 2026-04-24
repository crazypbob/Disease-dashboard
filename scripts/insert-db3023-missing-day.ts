/**
 * 한빛청주(DB3023) — 특정일에 PRRS·APP·MH(또는 PED) 행이 누락됐을 때, **결과지와 일치**하는 값으로 INSERT.
 * (원문 PDF/매트릭스와 직접 대조한 뒤에만 실행할 것; 임의 숫자 금지)
 *
 *   npx tsx scripts/insert-db3023-missing-day.ts --date=2026-04-21 --pdf-id=Drive파일ID \
 *     --prrs-pcr=- --prrs-elisa=- --app-pcr=- --mh-pcr=-
 *   npx tsx scripts/insert-db3023-missing-day.ts --mhr-pcr=-   # MHR(매트릭스) 열
 *   npx tsx scripts/insert-db3023-missing-day.ts --from-json=scripts/data/db3023-2026-04-21.example.json --dry-run
 *   npx tsx scripts/insert-db3023-missing-day.ts --date=2026-04-21 --pdf-id=xxx --ped-pcr=-  # PED가 필요할 때
 *
 * 기존 (farm_code,date,disease,test_type) 이 있으면 INSERT 하지 않음.
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import { extractDriveFileId } from '../lib/drive';

const FARM = 'DB3023';

function arg(name: string): string {
  const a = process.argv.find((x) => x.startsWith(name + '='));
  return a ? a.slice((name + '=').length).trim() : '';
}

type JsonSeed = {
  date?: string;
  pdfId?: string;
  prrsPcr?: string;
  prrsElisa?: string;
  appPcr?: string;
  mhPcr?: string;
  mhrPcr?: string;
  pedPcr?: string;
};

function loadFromJson(p: string): { date: string; rawPdf: string; fields: JsonSeed } {
  const full = path.resolve(p);
  if (!fs.existsSync(full)) {
    console.error('파일 없음:', full);
    process.exit(1);
  }
  const j = JSON.parse(fs.readFileSync(full, 'utf-8')) as JsonSeed;
  return {
    date: (j.date ?? '2026-04-21').trim(),
    rawPdf: (j.pdfId ?? '').trim(),
    fields: j,
  };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const fromJson = arg('--from-json');

  let date: string;
  let rawPdf: string;
  let prrsPcr: string;
  let prrsElisa: string;
  let appPcr: string;
  let mhPcr: string;
  let mhrPcr: string;
  let pedPcr: string;

  if (fromJson) {
    const L = loadFromJson(fromJson);
    date = L.date;
    rawPdf = L.rawPdf;
    prrsPcr = L.fields.prrsPcr?.trim() ?? '';
    prrsElisa = L.fields.prrsElisa?.trim() ?? '';
    appPcr = L.fields.appPcr?.trim() ?? '';
    mhPcr = L.fields.mhPcr?.trim() ?? '';
    mhrPcr = L.fields.mhrPcr?.trim() ?? '';
    pedPcr = L.fields.pedPcr?.trim() ?? '';
  } else {
    date = arg('--date') || '2026-04-21';
    rawPdf = arg('--pdf-id') || arg('--pdf_id');
    prrsPcr = arg('--prrs-pcr') || '';
    prrsElisa = arg('--prrs-elisa') || '';
    appPcr = arg('--app-pcr') || '';
    mhPcr = arg('--mh-pcr') || '';
    mhrPcr = arg('--mhr-pcr') || '';
    pedPcr = arg('--ped-pcr') || '';
  }

  const driveId = rawPdf ? extractDriveFileId(rawPdf) : null;
  if (!driveId) {
    console.error(
      'Drive 파일 ID(또는 URL)이 필요합니다. --pdf-id= … 또는 --from-json 의 pdfId(예: .example.json을 복사해 채움)'
    );
    process.exit(1);
  }

  type RowDef = { disease: string; test_type: string; result: string };
  const want: RowDef[] = [];
  if (prrsPcr) want.push({ disease: 'PRRS', test_type: 'PCR', result: prrsPcr });
  if (prrsElisa) want.push({ disease: 'PRRS', test_type: 'ELISA', result: prrsElisa });
  if (appPcr) want.push({ disease: 'APP', test_type: 'PCR', result: appPcr });
  if (mhPcr) want.push({ disease: 'MH', test_type: 'PCR', result: mhPcr });
  if (mhrPcr) want.push({ disease: 'MHR', test_type: 'PCR', result: mhrPcr });
  if (pedPcr) want.push({ disease: 'PED', test_type: 'PCR', result: pedPcr });

  if (want.length === 0) {
    console.error('최소 하나의 결과 플래그가 필요: --prrs-pcr, --prrs-elisa, --app-pcr, --mh-pcr, --ped-pcr');
    process.exit(1);
  }

  const { sql } = await import('../lib/db');
  let inserted = 0;
  let skipped = 0;

  for (const w of want) {
    const exists = (await sql`
      SELECT 1 AS ok
      FROM test_records
      WHERE farm_code = ${FARM} AND date = ${date}::date
        AND disease = ${w.disease} AND test_type = ${w.test_type}
      LIMIT 1
    `) as { ok: number }[];
    if (exists.length) {
      console.log(`스킵(이미 있음): ${w.disease} / ${w.test_type}`);
      skipped++;
      continue;
    }
    if (dryRun) {
      console.log(
        `[dry-run] INSERT ${FARM} ${date} ${w.disease} ${w.test_type} ${w.result} pdf=${driveId.slice(0, 16)}…`
      );
      inserted++;
    } else {
      await sql`
        INSERT INTO test_records (date, farm_code, disease, test_type, result, pdf_file_id, method, details)
        VALUES (
          ${date}::date,
          ${FARM},
          ${w.disease},
          ${w.test_type},
          ${w.result},
          ${driveId},
          NULL,
          NULL
        )
      `;
      console.log(`INSERT: ${w.disease} ${w.test_type} → ${w.result}`);
      inserted++;
    }
  }

  console.log(`\n완료: ${dryRun ? '예정' : '삽입'} ${inserted}건, 스킵(기존) ${skipped}건`);

  if (typeof (sql as any).end === 'function') await (sql as any).end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
