/**
 * Ingest API 테스트 — 돼지 질병 샘플 (PRRS Ag+Ab, PED Ag)
 * 실행: npm run ingest:test
 */
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const INGEST_SECRET = process.env.INGEST_SECRET;
const BASE_URL = process.env.NEXTAUTH_URL || 'http://localhost:3005';

if (!INGEST_SECRET) {
  console.error('.env.local에 INGEST_SECRET을 추가하세요. (예: INGEST_SECRET=my-secret-123)');
  process.exit(1);
}

function formatLocalYMD(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const today = new Date();
const yesterday = new Date(today);
yesterday.setDate(yesterday.getDate() - 1);

/** 넣으면 모든 샘플 행에 동일 원본 링크 (대덕·성진 모두 밑줄) */
const SAMPLE_DRIVE_ID = '1J5b-vgi8RoDAU2Firm8hbRQinqyvFiO6';

const drive = SAMPLE_DRIVE_ID ? { drive_file_id: SAMPLE_DRIVE_ID } : {};

const body = {
  pdfFileId: 'test-' + Date.now(),
  records: [
    // 성진 PRRS: Ag·Ab 둘 다 (한 열에 묶임)
    {
      date: formatLocalYMD(today),
      farm_code: 'DB1001',
      disease: 'PRRS',
      test_type: 'PCR',
      result: '음성',
      ...drive,
    },
    {
      date: formatLocalYMD(today),
      farm_code: 'DB1001',
      disease: 'PRRS',
      test_type: 'ELISA',
      result: '음성',
      ...drive,
    },
    // 성진 PED Ag
    {
      date: formatLocalYMD(yesterday),
      farm_code: 'DB1001',
      disease: 'PED',
      test_type: 'PCR',
      result: '음성',
      ...drive,
    },
    // 대덕 PRRS: Ab만 (Ag 없음 → Ag 칸 —)
    {
      date: formatLocalYMD(today),
      farm_code: 'DB1002',
      disease: 'PRRS',
      test_type: 'ELISA',
      result: '음성',
      ...drive,
    },
  ],
};

async function run() {
  const secret = INGEST_SECRET as string;
  console.log('POST', BASE_URL + '/api/ingest');
  const res = await fetch(BASE_URL + '/api/ingest', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-ingest-secret': secret,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('오류:', res.status, data);
    process.exit(1);
  }
  console.log('성공:', data);
}

run();
