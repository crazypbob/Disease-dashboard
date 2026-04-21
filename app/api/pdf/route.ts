/**
 * PDF 원본 결과지 스트리밍 (인증된 사용자만)
 * - NAS 경로에서 파일 읽어 응답
 * - ALLOWED_EMAILS 로그인 사용자만 접근
 *
 * GET /api/pdf?id=레코드ID
 */
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';
import * as fs from 'fs';
import * as path from 'path';

const PDF_BASE_PATH = process.env.PDF_BASE_PATH ?? process.env.SAVE_PATH ?? '';

function isAbsolutePath(p: string): boolean {
  const s = p.replace(/\\/g, '/').trim();
  return s.startsWith('/') || /^[A-Za-z]:\//.test(s) || s.startsWith('//') || s.startsWith('\\\\');
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const allowed = (process.env.ALLOWED_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length > 0 && !allowed.includes(session.user.email.toLowerCase())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id || !/^\d+$/.test(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const rows = await sql`
    SELECT pdf_file_id FROM test_records WHERE id = ${parseInt(id, 10)} LIMIT 1
  ` as { pdf_file_id: string | null }[];

  if (!rows.length || !rows[0]?.pdf_file_id?.trim()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const ref = rows[0].pdf_file_id.trim();

  // Drive ID (legacy) → 더 이상 지원 안 함
  if (/^[a-zA-Z0-9_-]{10,}$/.test(ref) && !ref.includes('/') && !ref.includes('\\')) {
    return NextResponse.json({ error: 'PDF 미연결 (Drive 미사용)' }, { status: 404 });
  }

  let filePath: string;
  if (isAbsolutePath(ref)) {
    filePath = ref.replace(/\//g, path.sep);
  } else if (PDF_BASE_PATH) {
    filePath = path.join(PDF_BASE_PATH, ref.replace(/\//g, path.sep));
  } else {
    return NextResponse.json({ error: 'PDF_BASE_PATH 미설정' }, { status: 500 });
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  try {
    const buf = fs.readFileSync(filePath);
    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="result.pdf"',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (e) {
    console.error('[api/pdf] read error:', e);
    return NextResponse.json({ error: 'Read failed' }, { status: 500 });
  }
}
