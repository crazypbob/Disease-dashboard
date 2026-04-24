/**
 * Claude Vision으로 PDF 파싱 (Gemini 429 시 폴백)
 * ANTHROPIC_API_KEY 필요
 */
import Anthropic from '@anthropic-ai/sdk';
import { getFarmCode } from './farm-mapping';
import { FARMS } from '@/lib/farms';

export type IngestRecord = {
  date: string;
  farm_code: string;
  disease: string;
  test_type: string;
  result: string;
  drive_file_id: string;
  method?: string;
  details?: string;
};

type ParsedTest = {
  disease: string;
  testType: string;
  overallResult: string;
  method?: string;
  details?: string;
};

type ParseResult = {
  farmCode?: string;
  farmName?: string;
  testDate?: string;
  accessionNo?: string;
  tests: ParsedTest[];
};

export async function parsePdfWithClaude(
  pdfBuffer: Buffer,
  _filename: string,
  driveFileId: string
): Promise<IngestRecord[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY가 .env.local에 필요합니다. (Claude 폴백용)');
  }

  const client = new Anthropic({ apiKey });
  const modelName = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';

  const farmContext = Object.entries(FARMS)
    .map(([code, info]) => `${code}=${info.name}`)
    .join(', ');

  const prompt = `당신은 동물 질병 검사 보고서 분석 전문가입니다.
이 PDF는 돼지 질병 검사 결과 보고서입니다. **반드시 PDF 원문에 적힌 값만** 추출하세요. 추측·가정 금지.

[농장 식별 - 매우 중요]
- **farmCode, farmName은 반드시 "농장정보" 또는 "Farm Info" 필드 값을 사용**하세요.
- "의뢰정보" / "Requesting Party" (의뢰인, 주문처)는 무시하세요. 의뢰인(다비육종)과 농장(다비연구소, 대덕종돈 등)은 다릅니다.
- 예: 농장정보=다비연구소 → farmName:"다비연구소", 의뢰정보=(주)다비육종은 사용하지 말 것.

[레이아웃 변형]
- 검사항목이 상단/좌측/우측, 결과가 하단/우측/좌측 등 **양식이 다양**합니다. PDF 전체를 스캔해 모든 검사·결과 쌍을 추출하세요.
- 한 결과서에 혈액 PRRS, SIV(인플루엔자), PED, 타액 PRRS, 타액 SIV 등 **여러 검사**가 있으면 각각 tests 배열에 항목으로 넣으세요.
- 시료 종류(혈액/타액/분변/비강swab 등)는 method 또는 details에 포함.

[날짜·기타]
- testDate: 접수일자(접수일)를 YYYY-MM-DD로.
- 한 마리라도 양성이면 overallResult=+

출력 형식:
{"farmCode":"농장코드","farmName":"농장명(농장정보 필드)","testDate":"YYYY-MM-DD","accessionNo":"접수번호",
"tests":[{"disease":"PRRS/PED/SIV/PCV/CSF/FMD/APP/세균(마이코플라즈마)","testType":"항원 또는 항체","method":"시료종류 등","overallResult":"+ 또는 - 또는 ?","details":"S/P 등"}]}

판정: 양성/검출=+, 음성/불검출=-, 불명확=? | Mycoplasma hyorhinis→disease:"세균" | SIV(인플루엔자)→disease:"SIV"
| Clostridium(difficile·perfringens·novyi/noyvi 등)·클로스트리디움→disease:"세균", 배양/분리면 testType에 반영(PRRS 유전자로 넣지 말 것)

농장코드: ${farmContext}
(대덕종돈=DB1002, 성진종돈=DB1001, 다비연구소=DB9001 등)

JSON만 출력하세요.`;

  const response = await client.messages.create({
    model: modelName,
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf' as const,
              data: pdfBuffer.toString('base64'),
            },
          },
          { type: 'text', text: prompt },
        ],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  const text = textBlock && 'text' in textBlock ? textBlock.text : '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Claude JSON 추출 실패: ${text.slice(0, 200)}`);
  }

  const parsed: ParseResult = JSON.parse(jsonMatch[0]);
  if (!parsed.tests?.length) return [];

  const dateStr = parsed.testDate || new Date().toISOString().slice(0, 10);
  const farmCode = getFarmCode(parsed.farmName || parsed.farmCode || '') as string;
  const records: IngestRecord[] = [];

  for (const test of parsed.tests) {
    if (!test.overallResult) continue;
    const rawD = test.disease || 'PRRS';
    const methodLower = (test.method || '').toLowerCase();
    const detailsLower = (test.details || '').toLowerCase();
    const blob = `${methodLower} ${detailsLower} ${String(rawD).toLowerCase()}`;
    const isClostridium =
      /clostridium|클로스트리디|클로스트리듐|difficile|perfringens|\bnovyi\b|\bnoyvi\b/i.test(blob);
    let disease = normalizeDisease(rawD);
    if (isClostridium) disease = '세균';
    const isGenomic =
      !isClostridium && (methodLower.includes('염기서열') || methodLower.includes('유전자'));
    const testType = isClostridium
      ? '세균배양'
      : isGenomic
        ? '유전자분석'
        : (test.testType || '항원').includes('항체')
          ? 'ELISA'
          : 'PCR';
    records.push({
      date: dateStr,
      farm_code: farmCode || 'DB9001',
      disease,
      test_type: testType,
      result: test.overallResult,
      drive_file_id: driveFileId,
      method: test.method,
      details: test.details,
    });
  }
  return records;
}

function normalizeDisease(d: string): string {
  const u = d.toUpperCase();
  if (/CLOSTRIDIUM|DIFFICILE|PERFRINGENS|NOVYI|NOYVI|클로스트리디|클로스트리듐/.test(u)) return '세균';
  if (u.includes('SIV') || u.includes('인플루엔자') || u.includes('IAV')) return 'SIV';
  if (u.includes('PED')) return 'PED';
  if (u.includes('PRRS')) return 'PRRS';
  if (u.includes('PCV')) return 'PCV2';
  if (u.includes('CSF')) return 'CSF';
  if (u.includes('FMD')) return 'FMD';
  if (u.includes('APP')) return 'APP';
  if (u.includes('MYCOPLASMA') || u.includes('MH') || u.includes('마이코플라즈마') || u.includes('M.HYORHINIS')) return '세균';
  return d || 'PRRS';
}
