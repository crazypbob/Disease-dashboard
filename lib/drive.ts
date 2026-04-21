/**
 * Google Drive 원본 링크
 * - 배치 키(test-123...) 등은 Drive 파일이 아니므로 링크 생성 안 함
 * - Drive 공유 링크에서 ID 추출: .../file/d/여기/view 또는 ...?id=여기
 */

const BAD_PREFIXES = /^(test-\d+|batch-)/i;

/** 실제 Drive 파일 ID 또는 URL로 보일 때만 true */
export function isLikelyGoogleDriveRef(ref: string | null | undefined): boolean {
  if (!ref?.trim()) return false;
  const t = ref.trim();

  if (/^https?:\/\//i.test(t)) {
    try {
      const u = new URL(t);
      const host = u.hostname.toLowerCase();
      if (host === 'drive.google.com' || host === 'docs.google.com') return true;
      if (host.includes('google') && (u.pathname.includes('/d/') || u.searchParams.has('id'))) return true;
      return false;
    } catch {
      return false;
    }
  }

  if (BAD_PREFIXES.test(t)) return false;

  // Drive ID: 영숫자·-·_ 10자 이상 (일부 짧은 ID 허용)
  if (/^[a-zA-Z0-9_-]{10,}$/.test(t)) return true;

  return false;
}

/** URL에서 Drive 파일 ID 추출 */
function extractDriveId(input: string): string | null {
  const t = input.trim();
  if (/^https?:\/\//i.test(t)) {
    try {
      const u = new URL(t);
      const m = u.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (m) return m[1];
      const id = u.searchParams.get('id');
      if (id && /^[a-zA-Z0-9_-]{10,}$/.test(id)) return id;
    } catch {
      // ignore
    }
  }
  if (isLikelyGoogleDriveRef(t) && !/^https?:\/\//i.test(t)) return t;
  return null;
}

export function driveFileUrl(pdfFileId: string | null | undefined): string | null {
  const id = extractDriveId(pdfFileId ?? '');
  if (!id) return null;
  return `https://drive.google.com/file/d/${id}/view?usp=sharing`;
}

/**
 * 원본 열기 URL
 * - NAS 상대·절대 경로 → 인증된 `/api/pdf?id=` 스트림
 * - Drive는 더 이상 사용하지 않음 (구형 값은 링크 미표시)
 */
export function pdfViewUrl(recordId: number, pdfFileId: string | null | undefined): string | null {
  if (!pdfFileId?.trim()) return null;
  const ref = pdfFileId.trim();
  const looksLikePath =
    ref.includes('/') ||
    ref.includes('\\') ||
    /^[A-Za-z]:/.test(ref) ||
    ref.startsWith('//') ||
    ref.startsWith('\\\\');
  if (looksLikePath) {
    return `/api/pdf?id=${recordId}`;
  }
  return null;
}
