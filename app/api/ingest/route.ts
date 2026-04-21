import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { parseTestResult } from '@/lib/result-display';

const INGEST_SECRET = process.env.INGEST_SECRET ?? '';

type IngestRecord = {
  date: string;
  farm_code: string;
  disease: string;
  test_type: string;
  result: string;
  method?: string;
  details?: string;
  /** 원본 결과지: Google Drive 파일 ID 또는 전체 URL (없으면 셀에 링크 없음. pdfFileId는 중복 방지용만) */
  drive_file_id?: string;
};

type IngestBody = {
  pdfFileId: string;
  records: IngestRecord[];
};

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization');
  const secret = authHeader?.replace(/^Bearer\s+/i, '') ?? request.headers.get('x-ingest-secret') ?? '';

  if (!INGEST_SECRET || secret !== INGEST_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: IngestBody;
  try {
    body = (await request.json()) as IngestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { pdfFileId, records } = body;
  if (!pdfFileId || !Array.isArray(records) || records.length === 0) {
    return NextResponse.json(
      { error: 'pdfFileId and non-empty records array required' },
      { status: 400 }
    );
  }

  const existing = await sql`
    SELECT 1 FROM parsed_files WHERE id = ${pdfFileId} LIMIT 1
  `;
  if (existing.length > 0) {
    return NextResponse.json(
      { ok: true, message: 'Already processed', inserted: 0 },
      { status: 200 }
    );
  }

  let inserted = 0;
  for (const r of records) {
    const { date, farm_code, disease, test_type, result, method, details, drive_file_id } = r;
    if (!date || !farm_code || !disease || !test_type || !result) continue;

    const fileRef = drive_file_id?.trim() || null;

    try {
      await sql`
        INSERT INTO test_records (date, farm_code, disease, test_type, result, pdf_file_id, method, details)
        VALUES (${date}, ${farm_code}, ${disease}, ${test_type}, ${result}, ${fileRef}, ${method ?? null}, ${details ?? null})
      `;
      inserted++;
    } catch (err) {
      console.error('[ingest] insert error:', err);
    }
  }

  if (inserted > 0) {
    await sql`INSERT INTO parsed_files (id) VALUES (${pdfFileId}) ON CONFLICT (id) DO NOTHING`;

    // Discord 웹훅 알림 (선택)
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (webhookUrl) {
      try {
        const farms = [...new Set(records.map((r) => r.farm_code))].join(', ');
        const positives = records.filter(
          (r) => parseTestResult(r.result).variant === 'positive'
        ).length;
        const summary =
          positives > 0
            ? `양성 ${positives}건 포함`
            : '모두 음성';
        const body = JSON.stringify({
          content: null,
          embeds: [
            {
              title: '🔬 검사결과 등록',
              description: `농장: ${farms}\n등록: ${inserted}건 ${summary}`,
              color: positives > 0 ? 0xe74c3c : 0x27ae60,
              timestamp: new Date().toISOString(),
              footer: { text: '질병메일링 대시보드' },
            },
          ],
        });
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        });
      } catch {
        // Discord 실패는 무시
      }
    }
  }

  return NextResponse.json({
    ok: true,
    inserted,
    total: records.length,
  });
}
