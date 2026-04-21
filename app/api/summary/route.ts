import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';
import {
  resolveMatrixScopeFarmCodes,
  type MatrixScope,
  type PublicVetDemoRegion,
} from '@/lib/matrix-region-filters';
import { canUseMatrixScope } from '@/lib/matrix-viewer-auth';
import { loadFarmCodeLocationMap } from '@/lib/load-farm-locations';
import { DEFAULT_VET_ASSIGNED_NAME } from '@/lib/viewer-constants';

function parseMatrixScope(raw: string | null): MatrixScope | null {
  if (!raw?.trim()) return null;
  const s = raw.trim() as MatrixScope;
  const allowed: MatrixScope[] = [
    'default',
    'dabi',
    'gov_central',
    'gov_local',
    'public_vet',
    'vet_assigned',
    'vet_union',
  ];
  return allowed.includes(s) ? s : null;
}

function parseMonths(raw: string | null): 1 | 3 | 6 | 12 {
  const n = parseInt((raw ?? '').trim() || '1', 10);
  if (n === 3 || n === 6 || n === 12) return n;
  return 1;
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const email = session.user.email ?? undefined;
  const { searchParams } = new URL(request.url);

  const months = parseMonths(searchParams.get('months'));
  const matrixScope = parseMatrixScope(searchParams.get('matrixScope')) ?? 'default';

  const publicVetRegion = (searchParams.get('publicVetRegion')?.trim() ?? null) as PublicVetDemoRegion | null;
  const localSido = searchParams.get('localSido')?.trim() ?? null;
  const vetAssignedName = searchParams.get('vetAssignedName')?.trim() || DEFAULT_VET_ASSIGNED_NAME;

  const farmParam = (searchParams.get('farm') ?? '').trim();
  const farmCodes = farmParam ? farmParam.split(',').map((s) => s.trim()).filter(Boolean) : null;
  const farmSet = farmCodes?.length ? new Set(farmCodes) : null;

  if (matrixScope !== 'default' && !canUseMatrixScope(email, matrixScope)) {
    return NextResponse.json({ error: 'Forbidden: matrix scope not allowed for this user' }, { status: 403 });
  }

  const now = new Date();
  const from = new Date(now);
  from.setMonth(from.getMonth() - months);

  const dateTo = ymd(now);
  const dateFrom = ymd(from);

  let allowedList: string[] | null = null;
  if (matrixScope !== 'default') {
    const locMap = await loadFarmCodeLocationMap();
    const allowed = resolveMatrixScopeFarmCodes(
      matrixScope,
      {
        publicVetRegion: publicVetRegion === 'gyeonggi' || publicVetRegion === 'chungcheong' ? publicVetRegion : null,
        localSido,
        vetAssignedName,
      },
      locMap
    );
    allowedList = allowed == null ? null : [...allowed];
  }

  const positive = sql`
    (
      LOWER(COALESCE(result,'')) = '양성' OR
      TRIM(COALESCE(result,'')) = '+' OR
      LOWER(REPLACE(COALESCE(result,''),' ','')) = 'pos' OR
      LOWER(COALESCE(result,'')) = 'positive' OR
      LOWER(COALESCE(result,'')) LIKE '양성%' OR
      LOWER(COALESCE(result,'')) LIKE '%positive%' OR
      LOWER(COALESCE(result,'')) = 'reactive' OR
      LOWER(COALESCE(result,'')) = '반응'
    )
  `;

  if (farmSet && farmSet.size > 0) {
    const farmList = [...farmSet];
    const byFarm = (await sql`
      SELECT
        disease,
        COUNT(*)::int AS tests,
        SUM(CASE WHEN ${positive} THEN 1 ELSE 0 END)::int AS positives
      FROM test_records
      WHERE 1=1
        AND date >= ${dateFrom}
        AND date <= ${dateTo}
        ${allowedList ? sql`AND farm_code = ANY(${allowedList})` : sql``}
        AND farm_code = ANY(${farmList})
      GROUP BY disease
      ORDER BY disease
    `) as { disease: string; tests: number; positives: number }[];
    return NextResponse.json({
      months,
      dateFrom,
      dateTo,
      matrixScope,
      rows: byFarm,
    });
  }

  const rows = (await sql`
    SELECT
      disease,
      COUNT(*)::int AS tests,
      SUM(CASE WHEN ${positive} THEN 1 ELSE 0 END)::int AS positives
    FROM test_records
    WHERE 1=1
      AND date >= ${dateFrom}
      AND date <= ${dateTo}
      ${allowedList ? sql`AND farm_code = ANY(${allowedList})` : sql``}
    GROUP BY disease
    ORDER BY disease
  `) as { disease: string; tests: number; positives: number }[];

  return NextResponse.json({
    months,
    dateFrom,
    dateTo,
    matrixScope,
    rows,
  });
}

