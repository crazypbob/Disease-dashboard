-- IMAP 감사로그 + 디스크 스캔(옵션3): 일별 집계 테이블

CREATE TABLE IF NOT EXISTS imap_daily_stats (
  day date PRIMARY KEY,
  save_path_files int NOT NULL DEFAULT 0,
  audit_ok int NOT NULL DEFAULT 0,
  audit_err int NOT NULL DEFAULT 0,
  imap_on_count int,
  generated_at timestamptz NOT NULL DEFAULT now(),
  notes text
);

-- 최근 날짜 조회 최적화 (관리자 화면)
CREATE INDEX IF NOT EXISTS idx_imap_daily_stats_day_desc
  ON imap_daily_stats(day DESC);

