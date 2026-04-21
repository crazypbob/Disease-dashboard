import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';

export type PendingGroup = {
  farm_code: string;
  test_date: string;
  disease: string;
  count: number;
  sample_values: (number | null)[];  // sp_value 미리보기 (최대 5개)
  pdf_file_id?: string | null;
};

/** PRRS/MH: 표본 S/P가 모두 음성 구간(<0.3)이면 일령 입력 우선순위 낮음 → 목록에서 제외 */
function isAllNegativePrrsMh(g: PendingGroup, exclude: boolean): boolean {
  if (!exclude) return false;
  const d = (g.disease || '').toUpperCase();
  if (d !== 'PRRS' && d !== 'MH') return false;
  const vals = g.sample_values.filter((v): v is number => v != null && Number.isFinite(v));
  if (vals.length === 0) return false;
  return vals.every((v) => v < 0.3);
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const adminEmails = (process.env.ADMIN_EMAILS ?? process.env.ALLOWED_EMAILS ?? '')
    .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  const isAdmin = session?.user?.email &&
    (adminEmails.length === 0 || adminEmails.includes(session.user.email.toLowerCase()));
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const farmsRaw = (searchParams.get('farms') ?? '').trim();
  const farmList = farmsRaw.split(',').map((s) => s.trim()).filter(Boolean);
  const excludeNegative =
    searchParams.get('excludeNegative') === null || searchParams.get('excludeNegative') !== '0';

  if (farmList.length === 0) {
    return NextResponse.json({ groups: [], noFarmSelected: true });
  }

  let rows:
    | { farm_code: string; test_date: string; disease: string; count: string; values: string; pdf_file_id: string | null }[]
    | undefined;
  try {
    rows = (await sql`
      SELECT
        COALESCE(farm_code, farm_id) AS farm_code,
        test_date::text,
        disease,
        COUNT(*)::text AS count,
        ARRAY_TO_STRING(ARRAY_AGG(sp_value ORDER BY animal_no) FILTER (WHERE sp_value IS NOT NULL), ',') AS values,
        MAX(pdf_file_id) AS pdf_file_id
      FROM antibody_titers
      WHERE needs_review = TRUE
        AND COALESCE(farm_code, farm_id) = ANY(${farmList})
      GROUP BY COALESCE(farm_code, farm_id), test_date, disease
      ORDER BY test_date DESC, COALESCE(farm_code, farm_id), disease
    `) as unknown as { farm_code: string; test_date: string; disease: string; count: string; values: string; pdf_file_id: string | null }[];
  } catch (err) {
    // 항체가(P6) 스키마가 아직 적용되지 않은 환경에서는 500 대신 "빈 목록"으로 동작하게 둔다.
    const anyErr = err as any;
    if (anyErr?.code === '42P01') {
      return NextResponse.json({ groups: [], missingTable: 'antibody_titers' });
    }
    throw err;
  }

  const groupsRaw: PendingGroup[] = (rows ?? []).map((r) => ({
    farm_code: r.farm_code,
    test_date: r.test_date,
    disease: r.disease,
    count: parseInt(r.count, 10),
    pdf_file_id: r.pdf_file_id,
    sample_values: r.values
      ? r.values.split(',').slice(0, 5).map((v: string) => parseFloat(v))
      : [],
  }));

  const groups = groupsRaw.filter((g) => !isAllNegativePrrsMh(g, excludeNegative));

  return NextResponse.json({ groups });
}
