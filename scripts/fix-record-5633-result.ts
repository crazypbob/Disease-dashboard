/**
 * @deprecated 디앤디 Clostridium / PRRS 유전자 오분류 정리는
 * `npx tsx scripts/fix-known-mislabels.ts` 에 통합되었습니다 (섹션 3·3b).
 */
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function main() {
  console.error(
    '이 스크립트는 사용하지 않습니다. 다음을 실행하세요:\n  npx tsx scripts/fix-known-mislabels.ts'
  );
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
