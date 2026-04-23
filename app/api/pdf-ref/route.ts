/**
 * PDF 원본 결과지 스트리밍 (인증된 사용자만)
 * - test_records id를 모를 때, pdf_file_id(ref)를 직접 받아 스트리밍한다.
 *
 * GET /api/pdf-ref?ref=2026-04/xxx.pdf
 */
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { driveFileUrl, isLikelyGoogleDriveRef } from '@/lib/drive';
import * as fs from 'fs';
import * as path from 'path';

const PDF_BASE_PATH = process.env.PDF_BASE_PATH ?? process.env.SAVE_PATH ?? '';

function isAbsolutePath(p: string): boolean {
  const s = p.replace(/\\/g, '/').trim();
  return s.startsWith('/') || /^[A-Za-z]:\//.test(s) || s.startsWith('//') || s.startsWith('\\\\');
}

function normalizeRef(ref: string): string {
  return ref.replace(/\\/g, '/').replace(/^\/+/, '').trim();
}

function guessMonthFolderFromFilename(filename: string): string | null {
  const m = filename.match(/^(\d{4})(\d{2})\d{2}/);
  if (!m) return null;
  return `${m[1]}-${m[2]}`;
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
  const ref = normalizeRef((searchParams.get('ref') ?? '').trim());
  if (!ref) return NextResponse.json({ error: 'Invalid ref' }, { status: 400 });

  if (isLikelyGoogleDriveRef(ref)) {
    const url = driveFileUrl(ref);
    if (url) return NextResponse.redirect(url, 302);
    return NextResponse.json({ error: 'Invalid Drive ref' }, { status: 400 });
  }

  const candidates: string[] = [];
  if (isAbsolutePath(ref)) {
    candidates.push(ref.replace(/\//g, path.sep));
  } else if (PDF_BASE_PATH) {
    candidates.push(path.join(PDF_BASE_PATH, ref.replace(/\//g, path.sep)));

    // 월 폴더가 빠진 ref(예: '20260409_....pdf') 폴백: YYYYMMDD → YYYY-MM 추론
    if (!ref.includes('/') && /\.pdf$/i.test(ref)) {
      const month = guessMonthFolderFromFilename(ref);
      if (month) {
        candidates.push(path.join(PDF_BASE_PATH, month, ref));
      }
    }
  } else {
    return NextResponse.json(
      {
        error: 'PDF_BASE_PATH 미설정',
        hint: '배포 환경(Vercel 등)에서는 NAS 로컬 경로를 바로 읽을 수 없습니다. PDF는 나중에 객체 스토리지로 옮기거나, 우선은 매트릭스/DB 조회만 배포하세요.',
      },
      { status: 503 }
    );
  }

  const filePath = candidates.find((p) => fs.existsSync(p) && fs.statSync(p).isFile()) ?? '';
  if (!filePath) {
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
    console.error('[api/pdf-ref] read error:', e);
    return NextResponse.json({ error: 'Read failed' }, { status: 500 });
  }
}

