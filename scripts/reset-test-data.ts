/**
 * 잘못된 테스트 데이터(AI, ND 등) 초기화
 * 실행: npm run db:reset-test
 */
import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL이 .env.local에 필요합니다.');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function reset() {
  console.log('test_records, parsed_files 테이블 초기화 중...');
  await sql`TRUNCATE TABLE test_records`;
  await sql`TRUNCATE TABLE parsed_files`;
  console.log('완료. npm run ingest:test로 돼지 전용 샘플 데이터를 넣을 수 있습니다.');
}

reset().catch((e) => {
  console.error(e);
  process.exit(1);
});
