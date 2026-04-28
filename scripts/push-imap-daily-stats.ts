/**
 * NAS 운영용: IMAP_AUDIT_LOG(JSONL) + SAVE_PATH(디스크) 스캔 결과를 일별로 집계해 DB에 UPSERT.
 *
 * 기본: 어제(Asia/Seoul) 기준.
 * 사용:
 *   npx tsx scripts/push-imap-daily-stats.ts --date=2026-04-21
 *   npx tsx scripts/push-imap-daily-stats.ts --days=7
 *   npx tsx scripts/push-imap-daily-stats.ts --date=2026-04-21 --imap-on=1
 */
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { sql } from '@/lib/db';

function ymd(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function parseArg(args: string[], name: string): string {
  const raw = args.find((a) => a.startsWith(`${name}=`));
  return (raw?.split('=')[1] ?? '').trim();
}

function hasFlag(args: string[], name: string): boolean {
  const raw = args.find((a) => a === name || a.startsWith(name + '='));
  if (!raw) return false;
  if (raw === name) return true;
  const v = raw.split('=')[1]?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function dateRangeDaysInclusive(endYmd: string, days: number): string[] {
  const m = endYmd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return [];
  const end = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(end.getDate() - i);
    out.push(ymd(d));
  }
  return out;
}

function prefixForDay(day: string): string {
  const m = day.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  return `${m[1]}${m[2]}${m[3]}_`;
}

function monthFolder(day: string): string {
  const m = day.match(/^(\d{4})-(\d{2})-/);
  if (!m) return '';
  return `${m[1]}-${m[2]}`;
}

function countDiskFilesForDay(savePath: string, day: string): number {
  const mf = monthFolder(day);
  if (!mf) return 0;
  const base = path.join(path.resolve(savePath), mf);
  if (!fs.existsSync(base) || !fs.statSync(base).isDirectory()) return 0;
  const pfx = prefixForDay(day);
  if (!pfx) return 0;
  let n = 0;
  for (const fn of fs.readdirSync(base)) {
    const fp = path.join(base, fn);
    if (!fs.statSync(fp).isFile()) continue;
    if (fn.startsWith(pfx)) n++;
  }
  return n;
}

async function countAuditForDay(auditPath: string, day: string): Promise<{ ok: number; err: number }> {
  if (!auditPath) return { ok: 0, err: 0 };
  if (!fs.existsSync(auditPath) || !fs.statSync(auditPath).isFile()) return { ok: 0, err: 0 };
  const pfx = prefixForDay(day);
  if (!pfx) return { ok: 0, err: 0 };

  let ok = 0;
  let err = 0;

  const rl = readline.createInterface({
    input: fs.createReadStream(auditPath, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    const t = String(line ?? '').trim();
    if (!t) continue;
    let o: any;
    try {
      o = JSON.parse(t);
    } catch {
      continue;
    }
    const fp = String(o.file_prefix ?? '');
    if (!fp.startsWith(pfx)) continue;
    if (o.error) err++;
    else ok++;
  }
  return { ok, err };
}

async function upsertDailyStat(input: {
  day: string;
  savePathFiles: number;
  auditOk: number;
  auditErr: number;
  imapOnCount: number | null;
  notes?: string | null;
}) {
  await sql`
    INSERT INTO imap_daily_stats (
      day,
      save_path_files,
      audit_ok,
      audit_err,
      imap_on_count,
      generated_at,
      notes
    )
    VALUES (
      ${input.day}::date,
      ${input.savePathFiles}::int,
      ${input.auditOk}::int,
      ${input.auditErr}::int,
      ${input.imapOnCount}::int,
      now(),
      ${input.notes ?? null}
    )
    ON CONFLICT (day) DO UPDATE SET
      save_path_files = EXCLUDED.save_path_files,
      audit_ok = EXCLUDED.audit_ok,
      audit_err = EXCLUDED.audit_err,
      imap_on_count = EXCLUDED.imap_on_count,
      generated_at = EXCLUDED.generated_at,
      notes = EXCLUDED.notes
  `;
}

async function main() {
  const args = process.argv.slice(2);

  const dateArg = parseArg(args, '--date');
  const days = Math.max(parseInt(parseArg(args, '--days') || '1', 10) || 1, 1);
  const withImapOn = hasFlag(args, '--imap-on');

  // 기본: 어제(Asia/Seoul). 시스템 타임존은 NAS 환경에 의존하므로, 로컬 날짜에서 -1일.
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const end = dateArg || ymd(yesterday);

  const savePath = (process.env.SAVE_PATH ?? '').trim();
  if (!savePath) throw new Error('SAVE_PATH is required (env.nas).');

  const auditPath = (process.env.IMAP_AUDIT_LOG ?? '').trim();
  const pdfBase = (process.env.PDF_BASE_PATH ?? '').trim();
  const notesParts: string[] = [];
  if (!auditPath) notesParts.push('IMAP_AUDIT_LOG not set');
  if (!pdfBase) notesParts.push('PDF_BASE_PATH not set');

  // Optional IMAP ON count is expensive; keep it off by default.
  let imapOnCount: number | null = null;
  if (withImapOn) {
    // Best-effort: reuse python helper via child process? (avoid in TS for now)
    // We'll store null here; ON count can be added later if needed.
    imapOnCount = null;
    notesParts.push('imap_on_count not collected (ts-only mode)');
  }

  const targets = dateRangeDaysInclusive(end, days);
  for (const day of targets) {
    const disk = countDiskFilesForDay(savePath, day);
    const aud = await countAuditForDay(auditPath, day);
    await upsertDailyStat({
      day,
      savePathFiles: disk,
      auditOk: aud.ok,
      auditErr: aud.err,
      imapOnCount,
      notes: notesParts.length > 0 ? notesParts.join(' · ') : null,
    });
    // eslint-disable-next-line no-console
    console.log(`[imap_daily_stats] ${day} disk=${disk} audit_ok=${aud.ok} audit_err=${aud.err}`);
  }

  if (typeof (sql as any).end === 'function') await (sql as any).end();
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('[push-imap-daily-stats] failed:', e);
  process.exit(1);
});

