-- antibody_titers: 항체가(S/P 수치) 저장 테이블
-- 실행: psql $DATABASE_URL -f scripts/create-titers-table.sql

CREATE TABLE IF NOT EXISTS antibody_titers (
  id           SERIAL      PRIMARY KEY,
  -- 익명 농장코드(뒤 4자리). 예: '1001' (DB1001/DA1001 등 접두어 제거 후 저장)
  farm_code    TEXT        NOT NULL,
  -- 선택: 원문 농장표기(농장명 등). 익명성 요구로 기본 조회/표시는 farm_code 중심.
  farm_id      TEXT,
  test_date    DATE        NOT NULL,
  disease      TEXT        NOT NULL,   -- PRRS | MH | APP | Lawsonia | FMD | SIV
  animal_no    INTEGER     NOT NULL,   -- 1-based 샘플 순번 (같은 farm+date+disease 내)
  age_days     INTEGER,                -- 일령 (NULL = PDF 미기재, needs_review=true)
  age_range    TEXT,                   -- 구간 입력 시: '40-60' 또는 '육성돈' 등
  sp_value     REAL,                   -- S/P 비 또는 역가 수치
  source_file  TEXT,                   -- 원본 파일명 (PDF 등)
  pdf_file_id  TEXT,                   -- 원본 PDF 참조(상대경로 또는 절대경로)
  needs_review BOOLEAN     NOT NULL DEFAULT FALSE,  -- 일령 미입력 → 웹에서 수동 보정 필요
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- upsert 키용 유니크 제약 (farm + date + disease + animal 번호)
CREATE UNIQUE INDEX IF NOT EXISTS idx_titers_upsert
  ON antibody_titers(farm_code, test_date, disease, animal_no);

CREATE INDEX IF NOT EXISTS idx_titers_farm_date
  ON antibody_titers(farm_code, test_date);

CREATE INDEX IF NOT EXISTS idx_titers_disease
  ON antibody_titers(farm_code, disease);

-- 일령 미입력 레코드만 빠르게 조회
CREATE INDEX IF NOT EXISTS idx_titers_pending
  ON antibody_titers(needs_review)
  WHERE needs_review = TRUE;
