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
import { driveFileUrl, isLikelyGoogleDriveRef } from '@/lib/drive';
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

  // Google Drive ID·URL → 브라우저에서 바로 열도록 리다이렉트 (Vercel은 NAS 파일을 읽을 수 없음)
  if (isLikelyGoogleDriveRef(ref)) {
    const url = driveFileUrl(ref);
    if (url) {
      return NextResponse.redirect(url, 302);
    }
    return NextResponse.json({ error: 'Invalid Drive ref' }, { status: 400 });
  }

  let filePath: string;
  if (isAbsolutePath(ref)) {
    filePath = ref.replace(/\//g, path.sep);
  } else if (PDF_BASE_PATH) {
    filePath = path.join(PDF_BASE_PATH, ref.replace(/\//g, path.sep));
  } else {
    return NextResponse.json(
      {
        error: 'PDF_BASE_PATH 미설정',
        hint: '배포 환경(Vercel 등)에서는 NAS 로컬 경로를 바로 읽을 수 없습니다. PDF는 나중에 객체 스토리지로 옮기거나, 우선은 매트릭스/DB 조회만 배포하세요.',
      },
      { status: 503 }
    );
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
