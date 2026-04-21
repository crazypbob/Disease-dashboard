import { timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { recordMatchesDiseaseFilter } from '@/lib/disease-filtering';
import type { DiseaseFilterCode } from '@/lib/disease-filter';
import type { TestRecord } from '@/app/api/records/route';

/**
 * Colab / 외부 스크립트에서 PDF↔DB 검증용으로 레코드를 가져올 때 사용.
 * 브라우저 세션 대신 RECORDS_VERIFY_TOKEN(Bearer)으로만 인증한다.
 * 토큰이 .env에 없으면 라우트는 404를 반환한다(비활성).
 */
function verifyBearerToken(request: Request, secret: string): boolean {
  const auth = request.headers.get('authorization') ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
  if (!m) return false;
  const token = m[1].trim();
  if (!token || !secret) return false;
  const a = Buffer.from(token, 'utf8');
  const b = Buffer.from(secret, 'utf8');
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const secret = process.env.RECORDS_VERIFY_TOKEN?.trim() ?? '';
  if (!secret) {
    return NextResponse.json({ error: 'Not configured' }, { status: 404 });
  }
  if (!verifyBearerToken(request, secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const farmParam = searchParams.get('farm');
  const farmCodes = farmParam
    ? farmParam.split(',').map((s) => s.trim()).filter(Boolean)
    : null;
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  const diseaseParam = searchParams.get('disease') || searchParams.get('diseases');
  const diseases = diseaseParam ? diseaseParam.split(',').map((d) => d.trim()).filter(Boolean) : null;
  const customerOnly =
    searchParams.get('customerOnly') === '1' || searchParams.get('customerOnly') === 'true';
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '8000', 10), 8000);

  const { FARMS } = await import('@/lib/farms');
  const { getFarmCode } = await import('@/lib/mail-pipeline/farm-mapping');
  const registeredCodes = new Set(Object.keys(FARMS));
  const farmSet = farmCodes?.length ? new Set(farmCodes) : null;

  let records = (await sql`
    SELECT id, date::text, farm_code, disease, test_type, result, pdf_file_id, method, details, created_at::text
    FROM test_records
    WHERE 1=1
    ${farmCodes?.length === 1 ? sql`AND farm_code = ${farmCodes[0]}` : sql``}
    ${dateFrom ? sql`AND date >= ${dateFrom}` : sql``}
    ${dateTo ? sql`AND date <= ${dateTo}` : sql``}
    ORDER BY date DESC, farm_code, disease
    LIMIT ${customerOnly ? 5000 : limit}
  `) as TestRecord[];

  records = records.map((r) => {
    const resolved = getFarmCode(r.farm_code);
    if (typeof resolved === 'string' && resolved in FARMS && resolved !== r.farm_code) {
      return { ...r, farm_code: resolved };
    }
    return r;
  });

  if (farmSet && farmSet.size > 1) {
    records = records.filter((r) => farmSet.has(r.farm_code));
  }

  if (diseases?.length) {
    const selected = new Set(diseases as DiseaseFilterCode[]);
    records = records.filter((r) => recordMatchesDiseaseFilter(r, selected));
  }
  if (customerOnly && registeredCodes.size > 0) {
    records = records.filter((r) => !registeredCodes.has(r.farm_code));
  }

  return NextResponse.json({
    format: 'detail' as const,
    records,
    total: records.length,
  });
}
