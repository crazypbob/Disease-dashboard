import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';
import { canUseMatrixScope } from '@/lib/matrix-viewer-auth';
import { resolveMatrixScopeFarmCodes, type MatrixScope } from '@/lib/matrix-region-filters';
import { isInternalDabiOnly } from '@/lib/dashboard-role';

export type TiterRecord = {
  id: number;
  /** 익명 코드(뒤 4자리). DB 컬럼은 farm_code로 정규화하는 것을 목표로 함. */
  farm_code: string;
  test_date: string;
  disease: string;
  animal_no: number;
  age_days: number | null;
  age_range: string | null;
  parity_group: string | null;
  sp_value: number | null;
  source_file: string | null;
  pdf_file_id: string | null;
  needs_review: boolean;
  created_at: string;
};

type InsertPayload = {
  /** 익명 코드. 예: '1001' */
  farm_code: string;
  /** 과거 호환: 들어오면 farm_code로 정규화해 저장 */
  farm_id?: string;
  test_date: string;
  disease: string;
  animal_no: number;
  age_days?: number | null;
  age_range?: string | null;
  parity_group?: string | null;
  sp_value?: number | null;
  source_file?: string | null;
  needs_review?: boolean;
};

function parseMatrixScope(raw: string | null): MatrixScope | null {
  if (!raw) return null;
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

function normalizeFarmCode(raw: string | null | undefined): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  // DB1001 / DA1001 같은 접두어는 버리고 뒤 4자리만 사용
  const m = s.match(/(\d{4})$/);
  return m ? m[1] : null;
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const farmCodes = searchParams.get('farm_codes')?.split(',').map(normalizeFarmCode).filter(Boolean) as string[] | undefined;
  const farmCode  = normalizeFarmCode(searchParams.get('farm_code'));
  const disease = searchParams.get('disease') ?? null;
  const from    = searchParams.get('from') ?? null;
  const to      = searchParams.get('to') ?? null;
  let matrixScope = parseMatrixScope(searchParams.get('matrixScope'));
  const localSido = searchParams.get('localSido');
  const publicVetRegion = searchParams.get('publicVetRegion');

  if (isInternalDabiOnly(session)) {
    if (matrixScope !== null && matrixScope !== 'default' && matrixScope !== 'dabi') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    matrixScope = matrixScope === 'default' ? 'dabi' : matrixScope;
  }

  const ids = farmCode ? [farmCode, ...(farmCodes ?? [])] : (farmCodes ?? []);
  if (ids.length === 0) return NextResponse.json({ records: [] });

  // 최대 3농장 제한
  const limitedIds = ids.slice(0, 3);

  // 서버 RBAC: 매트릭스와 동일한 스코프 철학(데모면 env 비었을 때 허용)
  if (matrixScope && matrixScope !== 'default') {
    const email = session.user.email ?? '';
    if (!canUseMatrixScope(email, matrixScope)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const allowed = resolveMatrixScopeFarmCodes(
      matrixScope,
      { localSido, publicVetRegion: publicVetRegion as unknown as 'gyeonggi' | 'chungcheong' | null },
      new Map()
    );
    if (allowed !== null && allowed.size === 0) {
      return NextResponse.json({ records: [] });
    }
    if (allowed !== null && allowed.size > 0) {
      const ok = limitedIds.every((id) => allowed.has(id) || allowed.has(`DB${id}`));
      if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  let rows: unknown;
  try {
    rows = await sql`
      SELECT id, COALESCE(farm_code, farm_id) AS farm_code, test_date::text, disease, animal_no,
             age_days, age_range, parity_group, sp_value, source_file, pdf_file_id, needs_review, created_at::text
      FROM antibody_titers
      WHERE COALESCE(farm_code, farm_id) = ANY(${limitedIds})
        AND (${disease}::text IS NULL OR disease = ${disease})
        AND (${from}::date IS NULL OR test_date >= ${from}::date)
        AND (${to}::date IS NULL OR test_date <= ${to}::date)
      ORDER BY test_date, COALESCE(farm_code, farm_id), disease, animal_no
    `;
  } catch (err) {
    // 항체가(P6) 스키마가 아직 적용되지 않은 환경에서는 500 대신 "빈 목록"으로 동작하게 둔다.
    const anyErr = err as any;
    if (anyErr?.code === '42P01') {
      return NextResponse.json({ records: [], missingTable: 'antibody_titers' });
    }
    console.error('[api/titers]', err);
    return NextResponse.json({ error: 'Failed to load titers' }, { status: 500 });
  }

  return NextResponse.json({ records: rows as TiterRecord[] });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body: InsertPayload[] = await req.json();
  if (!Array.isArray(body) || body.length === 0)
    return NextResponse.json({ error: 'body must be a non-empty array' }, { status: 400 });

  let inserted = 0;
  for (const r of body) {
    const farm_code = normalizeFarmCode(r.farm_code ?? r.farm_id) ?? '';
    if (!farm_code) continue;
    await sql`
      INSERT INTO antibody_titers
        (farm_code, test_date, disease, animal_no, age_days, age_range, parity_group, sp_value, source_file, needs_review)
      VALUES (
        ${farm_code}, ${r.test_date}::date, ${r.disease}, ${r.animal_no},
        ${r.age_days ?? null}, ${r.age_range ?? null}, ${r.parity_group ?? null}, ${r.sp_value ?? null},
        ${r.source_file ?? null}, ${r.needs_review ?? false}
      )
      ON CONFLICT (farm_code, test_date, disease, animal_no)
      DO UPDATE SET
        age_days     = EXCLUDED.age_days,
        age_range    = EXCLUDED.age_range,
        parity_group = EXCLUDED.parity_group,
        sp_value     = EXCLUDED.sp_value,
        source_file  = EXCLUDED.source_file,
        needs_review = EXCLUDED.needs_review
    `;
    inserted++;
  }

  return NextResponse.json({ ok: true, inserted });
}
