/**
 * DB 초기화 스크립트 — 테이블 생성 + farms 시드
 * 실행: npx tsx scripts/init-db.ts
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

async function init() {
  console.log('테이블 생성 중...');

  await sql`
    CREATE TABLE IF NOT EXISTS farms (
      code VARCHAR(20) PRIMARY KEY,
      name VARCHAR(50) NOT NULL,
      "group" VARCHAR(20) NOT NULL,
      vet VARCHAR(50)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS parsed_files (
      id VARCHAR(100) PRIMARY KEY
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS test_records (
      id SERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      date DATE NOT NULL,
      farm_code VARCHAR(20) NOT NULL,
      disease VARCHAR(50) NOT NULL,
      test_type VARCHAR(20) NOT NULL,
      result VARCHAR(10) NOT NULL,
      pdf_file_id VARCHAR(100),
      method VARCHAR(50),
      details TEXT
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_test_records_date ON test_records(date)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_test_records_farm ON test_records(farm_code)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_test_records_disease ON test_records(disease)`;

  /**
   * 항체가(ELISA 등) 표본 단위 저장 — 롱 테이블(샘플 1개=1행)
   *
   * - 기존 test_records는 요약(+/-/?) 및 매트릭스/알림용.
   * - titer_samples는 10~50두 개별 S/P 등 원시 수치 보존 및 추세/비교용.
   */
  await sql`
    CREATE TABLE IF NOT EXISTS titer_samples (
      id SERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      farm_code VARCHAR(20) NOT NULL,
      test_date DATE NOT NULL,
      disease VARCHAR(50) NOT NULL,
      test_type VARCHAR(20) NOT NULL,
      sample_index INT NOT NULL,
      titer_value DOUBLE PRECISION NOT NULL,
      age_bucket VARCHAR(20),
      parity_group VARCHAR(20),
      pdf_file_id VARCHAR(100),
      page_no INT,
      raw_text TEXT
    )
  `;

  // 조회/비교 최적화용 인덱스
  await sql`CREATE INDEX IF NOT EXISTS idx_titer_samples_farm_date ON titer_samples(farm_code, test_date)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_titer_samples_disease ON titer_samples(disease)`;

  // 중복 방지(동일 PDF + 동일 표본 index + 동일 항목)
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_titer_samples_source
    ON titer_samples (farm_code, test_date, disease, test_type, sample_index, COALESCE(pdf_file_id, ''))
  `;

  console.log('farms 시드 중...');

  const farms = [
    ['DB1001', '성진', '직영', '양승혁'],
    ['DB1002', '대덕', '직영', '박지형'],
    ['DB1003', '디앤디', '직영', '고상억'],
    ['DB2005', '도화', '직영', '고상억'],
    ['DB2006', '대월', '직영', '고상억'],
    ['DB2007', '삼성', '직영', '이희원'],
    ['DB2008', '여울목', '직영', '고상억'],
    ['DB2009', '해림', '직영', '이희원'],
    ['DB2010', '문강', '직영', '박지형'],
    ['DB2011', '서후', '직영', '박지형'],
    ['DB2012', '원산', '직영', '이희원'],
    ['DB2013', '고흥', '직영', '장석현'],
    ['DB2014', '진천', '직영', '박지형'],
    ['DB2015', '다원', '직영', '고상억'],
    ['DB4014', '버들', '직영', '양승혁'],
    ['DB9001', '다비연구소', '직영', '-'],
    ['DB3001', '조산', '협력', '박지형'],
    ['DB3002', '삼경', '협력', '장석현'],
    ['DB3005', '관인', '협력', '양승혁'],
    ['DB3007', '효돈', '협력', '양승혁'],
    ['DB3014', '운도', '협력', '양승혁'],
    ['DB3015', '성일', '협력', '양승혁'],
    ['DB3016', '남도', '협력', '장석현'],
    ['DB3017', '성산', '협력', '이희원'],
    ['DB3019', '에이스팜', '협력', '이희원'],
    ['DB3020', '지혜', '협력', '박지형'],
    ['DB3021', '화진', '협력', '양승혁'],
    ['DB3022', '한빛피플', '협력', '장석현'],
    ['DB3023', '한빛청주', '협력', '박지형'],
    ['DB3024', '동산', '협력', '장석현'],
    ['DB3025', '인솔', '협력', '박지형'],
    ['DB5001', '중원', 'SP센터', '장석현'],
    ['DB5002', '조치원', 'SP센터', '이희원'],
    ['DB5003', '양산', 'SP센터', '양승혁'],
    ['DB6001', '북부유전', 'SP센터', '장석현'],
    ['DB4001', '자영', '위탁장', '장석현'],
    ['DB4002', '구산', '위탁장', '박지형'],
    ['DB4003', '유기', '위탁장', '박지형'],
    ['DB4009', '포월', '위탁장', '양승혁'],
    ['DB4011', '능국', '위탁장', '장석현'],
  ];

  for (const [code, name, group, vet] of farms) {
    await sql`
      INSERT INTO farms (code, name, "group", vet)
      VALUES (${code}, ${name}, ${group}, ${vet})
      ON CONFLICT (code) DO NOTHING
    `;
  }

  console.log('완료.');
}

init().catch((e) => {
  console.error(e);
  process.exit(1);
});
