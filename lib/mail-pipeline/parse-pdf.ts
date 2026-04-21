/**
 * PDF 파싱 통합 진입점
 * - 기본: Gemini 사용, 429(한도초과) 시 Claude로 폴백
 * - PARSE_PROVIDER=claude: Claude만 사용
 * - PARSE_ALTERNATE=1 + 양쪽 키 있음: 교대로 사용해 처리량 2배
 */
import type { IngestRecord } from './parse-gemini';

export type { IngestRecord };

export async function parsePdf(
  pdfBuffer: Buffer,
  filename: string,
  driveFileId: string,
  index = 0
): Promise<IngestRecord[]> {
  const provider = (process.env.PARSE_PROVIDER || 'auto').toLowerCase();
  const alternate = process.env.PARSE_ALTERNATE === '1';
  const hasGemini = !!process.env.GEMINI_API_KEY;
  const hasClaude = !!process.env.ANTHROPIC_API_KEY;

  if (provider === 'claude') {
    const { parsePdfWithClaude } = await import('./parse-claude');
    return parsePdfWithClaude(pdfBuffer, filename, driveFileId);
  }

  if (alternate && hasGemini && hasClaude) {
    const useClaude = index % 2 === 1;
    if (useClaude) {
      const { parsePdfWithClaude } = await import('./parse-claude');
      return parsePdfWithClaude(pdfBuffer, filename, driveFileId);
    }
  }

  try {
    const { parsePdfWithGemini } = await import('./parse-gemini');
    return await parsePdfWithGemini(pdfBuffer, filename, driveFileId);
  } catch (e) {
    const msg = (e as Error).message;
    const isLimit =
      msg.includes('429') ||
      msg.includes('quota') ||
      msg.includes('Quota exceeded') ||
      msg.includes('resource_exhausted');
    if (isLimit && hasClaude) {
      const { parsePdfWithClaude } = await import('./parse-claude');
      return parsePdfWithClaude(pdfBuffer, filename, driveFileId);
    }
    throw e;
  }
}
