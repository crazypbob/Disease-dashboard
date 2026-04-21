import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';
import * as path from 'path';
import * as fs from 'fs';
import * as XLSX from 'xlsx';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? process.env.ALLOWED_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  if (ADMIN_EMAILS.length === 0) return true;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

function normalizeDate(v: unknown): string {
  const s = String(v ?? '').trim();
  if (!s) return '';
  const m1 = s.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (m1) return `${m1[1]}-${m1[2].padStart(2, '0')}-${m1[3].padStart(2, '0')}`;
  const m2 = s.match(/(\d{4})(\d{2})(\d{2})/);
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;
  return s;
}

function findColumn(headers: unknown[], names: string[]): number {
  const lower = headers.map((h) => String(h ?? '').toLowerCase().replace(/\s/g, ''));
  for (const n of names) {
    const idx = lower.findIndex((h) => h.includes(n.toLowerCase().replace(/\s/g, '')));
    if (idx >= 0) return idx;
  }
  return -1;
}

function buildNasRelativePath(date: string, filename: string): string | null {
  if (!date || !filename?.trim() || !/\.pdf$/i.test(filename)) return null;
  const m = String(date).match(/^(\d{4})[-./]?(\d{1,2})/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  return `${year}-${String(month).padStart(2, '0')}/${filename.trim()}`;
}

function normalizeFarmCode4(v: unknown): string | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const ms = s.match(/\d{4}/g);
  return ms && ms.length > 0 ? ms[ms.length - 1]! : null;
}

function findXlsxPath(): string | null {
  const cwd = process.cwd();
  const outputPath = process.env.OCR_OUTPUT_PATH?.trim();
  const candidates: string[] = [];

  if (outputPath) {
    candidates.push(path.join(outputPath, 'result.xlsx'));
    candidates.push(path.join(outputPath, 'results.xlsx'));
    candidates.push(outputPath);
  }

  candidates.push(path.join(cwd, 'ocr-pipeline', 'output', 'result.xlsx'));
  candidates.push(path.join(cwd, 'ocr-pipeline', 'output', 'results.xlsx'));
  candidates.push(path.join(cwd, 'scripts', 'results.xlsx'));

  for (const p of candidates) {
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  }
  return null;
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '200', 10) || 200, 1), 500);
  const onlyDbMissing = (searchParams.get('onlyDbMissing') ?? '').trim() === '1';

  const xlsxPath = findXlsxPath();
  if (!xlsxPath) {
    return NextResponse.json({
      ok: true,
      items: [],
      note: 'results.xlsx를 찾을 수 없습니다. OCR_OUTPUT_PATH 또는 ocr-pipeline/output/를 확인하세요.',
    });
  }

  let wb: XLSX.WorkBook;
  try {
    // readFile이 OS/권한/동시쓰기 영향으로 실패하는 경우가 있어 버퍼 로드로 한 번 더 시도한다.
    try {
      wb = XLSX.readFile(xlsxPath, { cellDates: false });
    } catch {
      const buf = fs.readFileSync(xlsxPath);
      wb = XLSX.read(buf, { type: 'buffer', cellDates: false });
    }
  } catch (err) {
    console.error('[admin reading-history] cannot read xlsx', err);
    return NextResponse.json({
      ok: true,
      items: [],
      note: `results.xlsx를 읽을 수 없습니다: ${xlsxPath}`,
    });
  }
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return NextResponse.json({ ok: true, items: [] });
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }) as unknown[][];
  if (rows.length <= 1) return NextResponse.json({ ok: true, items: [] });

  const headers = rows[0] ?? [];
  const dateIdx = findColumn(headers, ['날짜', '검사일', 'date', 'test_date']);
  const fileIdx = findColumn(headers, ['PDF_파일ID', 'pdf_file_id', 'file_id', '파일ID', '파일명', 'pdf']);
  const farmIdx = findColumn(headers, ['농장명', 'farm', 'farm_name', '농장']);

  const itemsRaw: Array<{ date: string; filename: string; fileId: string; farm4: string | null }> = [];
  for (const r of rows.slice(1)) {
    const date = normalizeDate(dateIdx >= 0 ? r[dateIdx] : '');
    const rawFile = String(fileIdx >= 0 ? r[fileIdx] : '').trim();
    if (!rawFile) continue;
    const filename = path.basename(rawFile);
    const fileId = buildNasRelativePath(date, filename) ?? rawFile;
    const farm4 = farmIdx >= 0 ? normalizeFarmCode4(r[farmIdx]) : null;
    itemsRaw.push({ date, filename, fileId, farm4 });
  }

  // 최신순(파일Id에 날짜가 안 담길 수 있어 date 기준) + 중복 제거
  const uniq = new Map<string, { date: string; filename: string; fileId: string; farm4: string | null }>();
  for (const it of itemsRaw) {
    if (!uniq.has(it.fileId)) uniq.set(it.fileId, it);
  }
  const items = Array.from(uniq.values())
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.fileId.localeCompare(b.fileId)))
    .slice(0, limit);

  const fileIds = items.map((x) => x.fileId).filter(Boolean);
  const bases = items.map((x) => path.basename(x.fileId ?? ''));
  const dates = items.map((x) => (x.date ? x.date : null));
  const farm4s = items.map((x) => x.farm4);

  // pdf_file_id 정확 일치 + filename 부분일치(절대경로/다른 루트) + (접수일자+농장) 존재 여부를 함께 계산한다.
  const counts = (await sql`
    WITH f AS (
      SELECT * FROM UNNEST(
        ${fileIds}::text[],
        ${bases}::text[],
        ${dates}::date[],
        ${farm4s}::text[]
      ) AS t(file_id, base, dt, farm4)
    )
    SELECT
      f.file_id,
      COALESCE((
        SELECT COUNT(*)::int
        FROM test_records tr
        WHERE tr.pdf_file_id = f.file_id
      ), 0) AS exact_cnt,
      COALESCE((
        SELECT SUM(CASE WHEN tr.result = '?' THEN 1 ELSE 0 END)::int
        FROM test_records tr
        WHERE tr.pdf_file_id = f.file_id
      ), 0) AS exact_fb,
      COALESCE((
        SELECT COUNT(*)::int
        FROM test_records tr
        WHERE f.base <> ''
          AND tr.pdf_file_id LIKE ('%' || f.base)
      ), 0) AS like_cnt,
      COALESCE((
        SELECT SUM(CASE WHEN tr.result = '?' THEN 1 ELSE 0 END)::int
        FROM test_records tr
        WHERE f.base <> ''
          AND tr.pdf_file_id LIKE ('%' || f.base)
      ), 0) AS like_fb,
      COALESCE((
        SELECT COUNT(*)::int
        FROM test_records tr
        WHERE f.dt IS NOT NULL
          AND f.farm4 IS NOT NULL
          AND tr.date = f.dt
          AND (tr.farm_code = ('DB' || f.farm4) OR tr.farm_code = f.farm4)
      ), 0) AS key_cnt
    FROM f
  `) as unknown as Array<{
    file_id: string;
    exact_cnt: number;
    exact_fb: number;
    like_cnt: number;
    like_fb: number;
    key_cnt: number;
  }>;
  const countMap = new Map<
    string,
    { exact: number; exactFb: number; like: number; likeFb: number; key: number }
  >();
  for (const r of counts) {
    countMap.set(r.file_id, { exact: r.exact_cnt, exactFb: r.exact_fb, like: r.like_cnt, likeFb: r.like_fb, key: r.key_cnt });
  }

  const pdfBase = (process.env.PDF_BASE_PATH ?? process.env.SAVE_PATH ?? '').trim();

  const out = items.map((it) => {
    const c = countMap.get(it.fileId);
    const abs = pdfBase ? path.join(pdfBase, it.fileId) : '';
    const hasPdf = abs ? fs.existsSync(abs) : false;
    const exact = c?.exact ?? 0;
    const like = c?.like ?? 0;
    const key = c?.key ?? 0;
    const dbAny = key > 0 || exact > 0 || like > 0;
    const pdfLinked = exact > 0 || like > 0;
    return {
      date: it.date || null,
      filename: it.filename || null,
      fileId: it.fileId || null,
      farm4: it.farm4 ?? null,
      hasPdf,
      inOcrResults: true,
      dbImportedCount: dbAny ? Math.max(key, exact, like) : 0,
      dbExactPdfMatchCount: exact,
      dbPdfLinkedCount: Math.max(exact, like),
      dbKeyMatchCount: key,
      dbFallbackCount: c ? Math.max(c.exactFb ?? 0, c.likeFb ?? 0) : 0,
      hint:
        dbAny && !pdfLinked
          ? 'DB에는 있음(날짜+농장 기준) / 이 PDF로의 링크(pdf_file_id)가 안 붙었을 가능성'
          : !dbAny
            ? 'DB에 레코드가 없는 것으로 보임'
            : null,
    };
  });

  const filtered = onlyDbMissing ? out.filter((x) => (x.dbImportedCount ?? 0) === 0) : out;

  return NextResponse.json({
    ok: true,
    items: filtered,
    meta: {
      dateLabel: '날짜',
      dateMeaning: 'OCR 결과서의 접수일자(또는 결과 파일 내 날짜 컬럼)',
      source: 'ocr-pipeline/output/results.xlsx (sheet: 결과)',
      generatedAt: new Date().toISOString(),
      note:
        '메일 수신일/저장일은 현재 results.xlsx에 없어서 표시하지 않습니다. 필요하면 IMAP 저장 단계에서 메타데이터를 DB로 적재해야 합니다.',
    },
  });
}

