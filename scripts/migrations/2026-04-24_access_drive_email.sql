-- 가입 승인/Drive 공유용 확장: drive_email + auth_provider
-- 적용: Neon SQL Editor 또는 psql에서 실행

ALTER TABLE access_requests
  ADD COLUMN IF NOT EXISTS drive_email VARCHAR(320),
  ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(32);

CREATE INDEX IF NOT EXISTS idx_access_requests_drive_email_lower
  ON access_requests(lower(drive_email));

ALTER TABLE approved_users
  ADD COLUMN IF NOT EXISTS drive_email VARCHAR(320),
  ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(32);

CREATE INDEX IF NOT EXISTS idx_approved_users_drive_email_lower
  ON approved_users(lower(drive_email));

