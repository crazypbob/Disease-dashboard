/**
 * Gemini Vision으로 PDF 파싱 (GAS parseWithGeminiVision 이식)
 */
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getFarmCode } from './farm-mapping';
import { FARMS } from '@/lib/farms';
import { MAIL_CONFIG } from './config';

export type ParsedTest = {
  disease: string;
  testType: string;
  overallResult: string;
  method?: string;
  details?: string;
};

export type GeminiParseResult = {
  farmCode?: string;
  farmName?: string;
  testDate?: string;
  accessionNo?: string;
  tests: ParsedTest[];
};

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

export async function parsePdfWithGemini(
  pdfBuffer: Buffer,
  filename: string,
  driveFileId: string
): Promise<IngestRecord[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY가 .env.local에 필요합니다.');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const modelName = process.env.GEMINI_MODEL || MAIL_CONFIG.GEMINI_MODEL;
  const model = genAI.getGenerativeModel({ model: modelName });

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

농장코드: ${farmContext}
(대덕종돈=DB1002, 성진종돈=DB1001, 다비연구소=DB9001 등)

JSON만 출력하세요.`;

  const maxRetries = 3;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await model.generateContent([
        prompt,
        {
          inlineData: {
            mimeType: 'application/pdf',
            data: pdfBuffer.toString('base64'),
          },
        },
      ]);
      const text = result.response.text();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error(`Gemini JSON 추출 실패: ${text.slice(0, 200)}`);
      }

      const parsed: GeminiParseResult = JSON.parse(jsonMatch[0]);
      if (!parsed.tests?.length) return [];

      const farmCode = getFarmCode(parsed.farmName || parsed.farmCode || '') as string;
      const dateStr = parsed.testDate || formatDate(new Date());
      const records: IngestRecord[] = [];

      for (const test of parsed.tests) {
        if (!test.overallResult) continue;
        const disease = normalizeDisease(test.disease || 'PRRS');
        const methodLower = (test.method || '').toLowerCase();
        const isGenomic = methodLower.includes('염기서열') || methodLower.includes('유전자');
        const testType = isGenomic ? '유전자분석' : (test.testType || '항원').includes('항체') ? 'ELISA' : 'PCR';
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
    } catch (e) {
      const msg = (e as Error).message;
      const is429 = msg.includes('429') || msg.includes('quota') || msg.includes('Quota exceeded');
      const retryMatch = msg.match(/retry in (\d+\.?\d*)s/i) || msg.match(/retryDelay["\s:]+(\d+)/i);
      const delayMs = retryMatch ? Math.ceil(parseFloat(retryMatch[1]) * 1000) : 60_000;

      if (is429 && attempt < maxRetries - 1) {
        console.warn(`  [Gemini 429] ${Math.ceil(delayMs / 1000)}초 후 재시도 (${attempt + 1}/${maxRetries})`);
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      throw e;
    }
  }
  throw new Error('Gemini 파싱 실패');
}

function normalizeDisease(d: string): string {
  const u = d.toUpperCase();
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

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
