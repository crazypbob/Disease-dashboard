/**
 * approved_users 전원에 대해 `검사결과_PDF` 폴더 Drive reader 권한 부여 (일회성 백필).
 *
 * 사용법:
 *   npx tsx scripts/backfill-drive-share-approved.ts --dry-run
 *   DRIVE_AUTO_SHARE_ON_APPROVE=1 npx tsx scripts/backfill-drive-share-approved.ts
 *
 * `--dry-run`: DB 조회만 하고 Drive API는 호출하지 않음.
 */
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const { sql } = await import('../lib/db');

  const rows = (await sql`
    SELECT lower(trim(email)) AS email
    FROM approved_users
    ORDER BY email
  `) as { email: string }[];

  if (rows.length === 0) {
    console.log('approved_users 가 비어 있습니다.');
    return;
  }

  console.log(`${rows.length}명:`, rows.map((r) => r.email).join(', '));

  if (dryRun) {
    console.log('[--dry-run] Drive permissions.create 호출 없음.');
    return;
  }

  const flag = process.env.DRIVE_AUTO_SHARE_ON_APPROVE?.trim().toLowerCase();
  if (flag !== '1' && flag !== 'true' && flag !== 'yes') {
    console.error(
      '실행하려면 DRIVE_AUTO_SHARE_ON_APPROVE=1 과 Gmail·Drive .env 가 필요합니다. 먼저 --dry-run 으로 목록만 확인하세요.'
    );
    process.exit(1);
  }

  const { grantReaderOnPdfLibraryFolder } = await import('../lib/drive-share-approved');

  for (const { email } of rows) {
    const res = await grantReaderOnPdfLibraryFolder(email);
    if (res.ok) {
      console.log(`OK  ${email}`);
    } else {
      console.error(`FAIL ${email}: ${res.message}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
