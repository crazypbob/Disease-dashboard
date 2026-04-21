/**
 * 수동 실행: 메일 파이프라인 (Gmail → Drive → 파싱 → DB)
 * npm run cron:check-gmail
 */
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function main() {
  const { runMailPipeline } = await import('../lib/mail-pipeline/run');
  console.log('메일 파이프라인 실행 중...');
  const result = await runMailPipeline();
  console.log(JSON.stringify(result, null, 2));
  if (result.errors.length > 0) {
    console.error('오류:', result.errors);
    process.exit(1);
  }
}

main();
