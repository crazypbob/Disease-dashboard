import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';
import { recordMatchesDiseaseFilter } from '@/lib/disease-filtering';
import type { DiseaseFilterCode } from '@/lib/disease-filter';
import { loadFarmCodeLocationMap } from '@/lib/load-farm-locations';
import {
  resolveMatrixScopeFarmCodes,
  type MatrixScope,
  type PublicVetDemoRegion,
} from '@/lib/matrix-region-filters';
import { canUseMatrixScope } from '@/lib/matrix-viewer-auth';
import { effectiveMatrixScopeForRestrictedUser } from '@/lib/api-matrix-scope-session';
import { buildSidoMonthDiseaseAggregates, monthDiseaseKey } from '@/lib/gov-central-aggregate';
import { parseSidoLabelFromAddress } from '@/lib/farm-sido';
import { DEFAULT_VET_ASSIGNED_NAME } from '@/lib/viewer-constants';

export type TestRecord = {
  id: number;
  date: string;
  farm_code: string;
  disease: string;
  test_type: string;
  result: string;
  pdf_file_id: string | null;
  method: string | null;
  details: string | null;
  created_at: string;
};

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

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const email = session.user.email ?? undefined;

  const { searchParams } = new URL(request.url);
  // #region agent log
  fetch('http://127.0.0.1:7612/ingest/8aea60fb-361d-42a0-a3fc-40b103521aac', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '9078ec' },
    body: JSON.stringify({
      sessionId: '9078ec',
      runId: 'pre-fix',
      hypothesisId: 'H1/H2/H3/H4',
      location: 'app/api/records/route.ts:GET:start',
      message: 'api/records called',
      data: {
        url: request.url,
        email: session.user.email ?? null,
        query: Object.fromEntries(searchParams.entries()),
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  const farmParam = searchParams.get('farm');
  const farmCodes = farmParam
    ? farmParam.split(',').map((s) => s.trim()).filter(Boolean)
    : null;
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  const diseaseParam = searchParams.get('disease') || searchParams.get('diseases');
  const diseases = diseaseParam ? diseaseParam.split(',').map((d) => d.trim()).filter(Boolean) : null;
  const customerOnly = searchParams.get('customerOnly') === '1' || searchParams.get('customerOnly') === 'true';
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '3000', 10), 8000);

  const matrixScope = effectiveMatrixScopeForRestrictedUser(
    session,
    parseMatrixScope(searchParams.get('matrixScope'))
  );
  const publicVetRegion = (searchParams.get('publicVetRegion')?.trim() ?? null) as PublicVetDemoRegion | null;
  const localSido = searchParams.get('localSido')?.trim() ?? null;
  const vetAssignedName = searchParams.get('vetAssignedName')?.trim() || DEFAULT_VET_ASSIGNED_NAME;
  const govView = searchParams.get('govView')?.trim() === 'farms' ? 'farms' : 'aggregate';

  const { FARMS } = await import('@/lib/farms');
  const { getFarmCode } = await import('@/lib/mail-pipeline/farm-mapping');
  const registeredCodes = new Set(Object.keys(FARMS));

  const farmSet = farmCodes?.length ? new Set(farmCodes) : null;

  if (matrixScope && matrixScope !== 'default') {
    if (!canUseMatrixScope(email, matrixScope)) {
      return NextResponse.json({ error: 'Forbidden: matrix scope not allowed for this user' }, { status: 403 });
    }

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

    if (matrixScope === 'gov_local' && (!localSido || !allowed || allowed.size === 0)) {
      return NextResponse.json({
        format: 'detail' as const,
        records: [] as TestRecord[],
        total: 0,
        matrixScope,
        warning: '지방정부: 관할 시·도를 선택하거나, 해당 주소의 농장이 없습니다.',
      });
    }

    if (matrixScope === 'public_vet') {
      if (publicVetRegion !== 'gyeonggi' && publicVetRegion !== 'chungcheong') {
        return NextResponse.json({
          format: 'detail' as const,
          records: [] as TestRecord[],
          total: 0,
          matrixScope,
          warning: '공수의: 권역(경기 / 충청)을 선택하세요.',
        });
      }
    }

    const allowedList =
      allowed == null ? null : allowed.size > 0 ? [...allowed] : ([] as string[]);

    let records = (await sql`
    SELECT id, date::text, farm_code, disease, test_type, result, pdf_file_id, method, details, created_at::text
    FROM test_records
    WHERE 1=1
    ${dateFrom ? sql`AND date >= ${dateFrom}` : sql``}
    ${dateTo ? sql`AND date <= ${dateTo}` : sql``}
    ORDER BY date DESC, farm_code, disease
    LIMIT ${matrixScope === 'gov_central' && govView === 'aggregate' ? 12000 : limit}
  `) as TestRecord[];

    records = records.map((r) => {
      const resolved = getFarmCode(r.farm_code);
      if (typeof resolved === 'string' && resolved in FARMS && resolved !== r.farm_code) {
        return { ...r, farm_code: resolved };
      }
      return r;
    });

    if (allowedList !== null) {
      const allow = new Set(allowedList);
      records = records.filter((r) => allow.has(r.farm_code));
    }
    if (farmSet) {
      records = records.filter((r) => farmSet.has(r.farm_code));
    }

    if (diseases?.length) {
      const selected = new Set(diseases as DiseaseFilterCode[]);
      records = records.filter((r) => recordMatchesDiseaseFilter(r, selected));
    }
    if (customerOnly && registeredCodes.size > 0) {
      records = records.filter((r) => !registeredCodes.has(r.farm_code));
    }

    if (matrixScope === 'gov_central' && govView === 'aggregate') {
      const farmCodeToSido = new Map<string, string>();
      for (const [code, meta] of locMap) {
        const sido = meta.sidoLabel ?? parseSidoLabelFromAddress(meta.address) ?? '미분류';
        farmCodeToSido.set(code, sido);
      }
      for (const code of Object.keys(FARMS)) {
        if (!farmCodeToSido.has(code)) {
          const meta = locMap.get(code);
          const sido = meta?.sidoLabel ?? parseSidoLabelFromAddress(meta?.address ?? '') ?? '미분류';
          farmCodeToSido.set(code, sido);
        }
      }

      const { rows, columnKeys } = buildSidoMonthDiseaseAggregates(records, farmCodeToSido);
      const serializable = rows.map((r) => {
        const cells: Record<string, { tests: number; positives: number }> = {};
        for (const k of columnKeys) {
          const c = r.cells.get(k);
          if (c && c.tests > 0) cells[k] = { tests: c.tests, positives: c.positives };
        }
        return { sido: r.sido, cells };
      });

      return NextResponse.json({
        format: 'aggregate' as const,
        aggregate: {
          rows: serializable,
          columnKeys,
          columnMeta: columnKeys.map((k) => {
            const [month, disease] = k.split('\t');
            return { key: k, month, disease };
          }),
        },
        total: records.length,
        matrixScope,
        govView,
      });
    }

    return NextResponse.json({
      format: 'detail' as const,
      records: records as TestRecord[],
      total: records.length,
      matrixScope,
    });
  }

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
    records: records as TestRecord[],
    total: records.length,
  });
}
