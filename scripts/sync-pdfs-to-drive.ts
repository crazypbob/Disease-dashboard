/**
 * NAS 상대경로(`YYYY-MM/파일.pdf`) PDF → Google Drive 업로드 후
 * `test_records.pdf_file_id`를 Drive 파일 ID로 일괄 갱신.
 *
 * 사용법 (이 레포 `.env.local`의 SAVE_PATH = 아래 --base; 자리 표시 `...` 금지):
 *   npx tsx scripts/sync-pdfs-to-drive.ts --base="X:/질병메일링_대시보드/disease-dashboard/ocr-pipeline/input/검사결과_PDF"
 *   npx tsx scripts/sync-pdfs-to-drive.ts --base="X:/질병메일링_대시보드/disease-dashboard/ocr-pipeline/input/검사결과_PDF" --dry-run
 *   npx tsx scripts/sync-pdfs-to-drive.ts --base="X:/질병메일링_대시보드/disease-dashboard/ocr-pipeline/input/검사결과_PDF" --since=2026-04
 *   npx tsx scripts/sync-pdfs-to-drive.ts --base="X:/질병메일링_대시보드/disease-dashboard/ocr-pipeline/input/검사결과_PDF" --rel=2026-03/a.pdf
 *   npx tsx scripts/sync-pdfs-to-drive.ts --base="X:/질병메일링_대시보드/disease-dashboard/ocr-pipeline/input/검사결과_PDF" --rels-file=scripts/.drive_sync_rels.txt
 *   npx tsx scripts/sync-pdfs-to-drive.ts --base="X:/질병메일링_대시보드/disease-dashboard/ocr-pipeline/input/검사결과_PDF" --pending-only
 *     → 디스크 전체를 도는 대신, DB에 아직 NAS 경로만 남은 pdf_file_id 만 처리 (이미 Drive ID로 갱신된 것 제외, 재실행·502 이후에 유리)
 *
 * 환경: `.env.local`에 GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN
 * 선택: DRIVE_ROOT_FOLDER_ID (질병메일링_대시보드에 해당하는 폴더 ID)
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const NAS_REL_RE = /^\d{4}-\d{2}\/.+\.pdf$/i;

function parseArgs() {
  const args = process.argv.slice(2);
  const baseArg = args.find((a) => a.startsWith('--base='));
  const base =
    (baseArg ? baseArg.slice('--base='.length) : '').trim() ||
    process.env.SAVE_PATH?.trim() ||
    process.env.PDF_BASE_PATH?.trim() ||
    '';
  const dryRun = args.includes('--dry-run');
  const sleepMs = parseInt(
    args.find((a) => a.startsWith('--sleep-ms='))?.split('=')[1] ?? '0',
    10
  );
  const since = args.find((a) => a.startsWith('--since='))?.split('=')[1]?.trim() ?? '';
  const rels: string[] = [];
  const relsFileArg = args.find((a) => a.startsWith('--rels-file='));
  const relsFile = relsFileArg ? relsFileArg.slice('--rels-file='.length).trim() : '';
  for (const a of args) {
    if (a.startsWith('--rel=')) rels.push(a.slice('--rel='.length).trim());
  }
  const pendingOnly = args.includes('--pending-only') || args.includes('--only-pending');
  return {
    base,
    dryRun,
    sleepMs: Number.isFinite(sleepMs) && sleepMs > 0 ? sleepMs : 0,
    since,
    rels,
    relsFile,
    pendingOnly,
  };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function monthKeyFromRel(rel: string): string {
  const m = rel.match(/^(\d{4}-\d{2})\//);
  return m ? m[1] : '';
}

function passesSince(rel: string, since: string): boolean {
  if (!since) return true;
  const mk = monthKeyFromRel(rel);
  if (!mk) return false;
  const prefix = since.slice(0, 7);
  return mk >= prefix;
}

function collectRelsFromWalk(base: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(full);
      } else if (ent.name.toLowerCase().endsWith('.pdf')) {
        const rel = path.relative(base, full).replace(/\\/g, '/');
        if (NAS_REL_RE.test(rel)) out.push(rel);
      }
    }
  };
  walk(base);
  return out;
}

async function main() {
  const { base, dryRun, sleepMs, since, rels, relsFile, pendingOnly } = parseArgs();
  if (!base) {
    console.error('SAVE 경로 필요: --base= 또는 환경변수 SAVE_PATH / PDF_BASE_PATH');
    process.exit(1);
  }
  const baseAbs = path.resolve(base);
  if (!fs.existsSync(baseAbs)) {
    console.error(`경로 없음: ${baseAbs}`);
    process.exit(1);
  }

  const { sql } = await import('../lib/db');

  let relList: string[] = [];
  if (pendingOnly && !relsFile && !rels.length) {
    const rows = (await sql`
      SELECT DISTINCT TRIM(pdf_file_id) AS pdf_file_id
      FROM test_records
      WHERE pdf_file_id IS NOT NULL
        AND TRIM(pdf_file_id) ~* '^[0-9]{4}-[0-9]{2}/.+\.pdf$'
    `) as { pdf_file_id: string }[];
    relList = rows.map((r) => String(r.pdf_file_id ?? '').replace(/\\/g, '/').trim());
    console.log(
      `[pending-only] DB에 NAS 경로만 남은 pdf_file_id: ${relList.length}개 (이미 Drive ID로 갱신된 항목은 제외됨)`
    );
  } else if (pendingOnly) {
    console.error('--pending-only 는 --rel= / --rels-file= 없이 단독으로 쓰세요. (또는 플래그를 빼고 기존 모드로 실행)');
    process.exit(1);
  } else if (relsFile) {
    const p = path.resolve(relsFile);
    if (!fs.existsSync(p)) {
      console.error(`rels 파일 없음: ${p}`);
      process.exit(1);
    }
    const text = fs.readFileSync(p, 'utf-8');
    relList = text
      .split(/\r?\n/)
      .map((l) => l.trim().replace(/\\/g, '/'))
      .filter(Boolean);
  } else if (rels.length) {
    relList = rels;
  } else {
    relList = collectRelsFromWalk(baseAbs);
  }

  relList = [...new Set(relList.map((r) => r.replace(/\\/g, '/')))].filter((r) => NAS_REL_RE.test(r));
  relList = relList.filter((r) => passesSince(r, since));
  relList.sort();

  console.log(
    `Drive 동기화 · base=${baseAbs} · 대상 ${relList.length}개${pendingOnly ? ' (--pending-only)' : ''}${dryRun ? ' (--dry-run)' : ''}`
  );

  const { uploadPdfToDrive } = await import('../lib/mail-pipeline/drive-upload');

  let done = 0;
  let skipped = 0;

  for (const rel of relList) {
    const full = path.join(baseAbs, rel);
    if (!fs.existsSync(full)) {
      console.warn(`  파일 없음 스킵: ${rel}`);
      skipped++;
      continue;
    }

    const countRows = (await sql`
      SELECT COUNT(*)::int AS c FROM test_records WHERE pdf_file_id = ${rel}
    `) as { c: number }[];
    const n = countRows[0]?.c ?? 0;
    if (n === 0) {
      console.log(`  DB 연결 없음 스킵: ${rel}`);
      skipped++;
      continue;
    }

    const monthFolder = monthKeyFromRel(rel);
    if (!monthFolder) {
      skipped++;
      continue;
    }

    if (dryRun) {
      console.log(`  [dry-run] ${rel} (${n}행) → 업로드 예정`);
      done++;
      continue;
    }

    const buffer = fs.readFileSync(full);
    const filename = path.basename(rel);
    const driveId = await uploadPdfToDrive(buffer, filename, { monthFolder });
    await sql`UPDATE test_records SET pdf_file_id = ${driveId} WHERE pdf_file_id = ${rel}`;
    done++;
    console.log(`  ✓ ${rel} → Drive ${driveId} (${n}행)`);
    if (sleepMs) await sleep(sleepMs);
  }

  console.log(`완료: 처리 ${done}, 스킵 ${skipped}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
