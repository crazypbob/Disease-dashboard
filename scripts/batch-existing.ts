/**
 * 기존 파일 일괄 처리 1단계: Drive PDF → NAS input 다운로드
 * 이후 2~4단계는 수동 (NAS OCR 실행 → results.xlsx → import)
 *
 * 사용법: npm run batch:existing
 *   NAS input 직접 저장: OCR_INPUT_PATH=X:/ocr-pipeline/input npm run batch:existing
 */
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function main() {
  const outDir =
    process.env.OCR_INPUT_PATH ||
    path.join(process.cwd(), 'scripts', 'result', 'input');

  console.log('\n=== 기존 파일 일괄 처리 (1단계) ===\n');
  console.log('대상 폴더:', outDir);
  if (process.env.OCR_INPUT_PATH) {
    console.log('  (OCR_INPUT_PATH로 NAS input 직접 지정됨)\n');
  } else {
    console.log('  (NAS 직접 저장 시: OCR_INPUT_PATH=X:/ocr-pipeline/input 설정)\n');
  }

  const { spawn } = await import('child_process');
  const child = spawn(
    'npx',
    ['tsx', 'scripts/drive-download-for-ocr.ts', 'all', '--out=' + outDir],
    { stdio: 'inherit', shell: true, cwd: process.cwd() }
  );

  await new Promise<void>((resolve, reject) => {
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`exit ${code}`));
    });
  });

  console.log('\n--- 다음 단계 ---\n');
  console.log('2. NAS에서 TeraCast OCR 실행:');
  console.log('   cd /volume1/docker/ocr-pipeline');
  console.log('   docker compose run --rm ocr-pipeline\n');
  console.log('3. output/results.xlsx → scripts/ 복사 (scripts/results.xlsx)\n');
  console.log('4. DB 업데이트:');
  console.log('   npx tsx scripts/import-ocr-results.ts --file=scripts/results.xlsx');
  console.log('   # 또는: --file=X:/ocr-pipeline/output/results.xlsx\n');
  console.log('자세한 내용: docs/BATCH-EXISTING.md\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
