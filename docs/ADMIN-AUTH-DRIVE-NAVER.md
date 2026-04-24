## 운영 런북: 관리자/로그인/승인/Drive/네이버

이 문서는 운영에서 “로그인(구글/네이버) → 가입 신청 → 관리자 승인 → Google Drive PDF 열람 권한 부여”까지를 한 번에 정리합니다.

---

## 1) 운영 URL(기본)

- **Vercel(운영)**: `https://darbydd.vercel.app`
- **로컬(dev)**: `http://localhost:3005`

---

## 2) 관리자 화면(탭)

로그인 후 상단 “관리자” 영역에서 접근합니다.

- **가입 승인(요청/승인/거절 이력)**: `/dashboard/admin/access`
- **Drive 승인(폴더 공유 상태/재시도)**: `/dashboard/admin/drive-approvals`
- **디버그리포트(검증 전송 내역)**: `/dashboard/admin/debug-reports`

---

## 3) 로그인 정책(중요)

### `SIGN_IN_POLICY=db_allowlist` 동작 요약

- **로그인 자체는 가능**(구글/네이버 OAuth 성공 시 세션 생성)
- 하지만 **승인 전에는** 아래가 모두 차단됩니다.
  - `/dashboard/*`
  - 주요 `/api/*`
- 승인 전 사용자는 `/access-request?reason=needs_approval`로 유도됩니다.

승인 기준:
- `OWNER_EMAILS` 또는 `ALLOWED_EMAILS`에 포함, 또는
- DB `approved_users`에 존재

---

## 4) 환경변수(Vercel) — 필수/선택

### 4-1. 웹앱/DB/구글 로그인(필수)

- `DATABASE_URL`
- `NEXTAUTH_URL` (예: `https://darbydd.vercel.app`)
- `AUTH_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `SIGN_IN_POLICY` = `db_allowlist` (사내 승인형 운영 시)
- `OWNER_EMAILS` (권장)
- `ADMIN_EMAILS` (선택)
- `ALLOWED_EMAILS` (선택: 고정 허용 계정)

### 4-2. 네이버 로그인(선택)

- `NAVER_CLIENT_ID`
- `NAVER_CLIENT_SECRET`

네이버 개발자센터에도 아래 콜백을 등록해야 합니다.
- 운영: `https://darbydd.vercel.app/api/auth/callback/naver`
- 로컬(선택): `http://localhost:3005/api/auth/callback/naver`

### 4-3. Drive 자동 공유(권장: PDF 뷰어 권한 자동 부여)

승인 시 `검사결과_PDF` 폴더에 승인된 이메일을 **reader로 공유**합니다.

- `DRIVE_AUTO_SHARE_ON_APPROVE=1`
- Shared Drive 사용 시: `DRIVE_USE_SHARED_DRIVES=1`
- 공유 대상 폴더 지정(권장):
  - `DRIVE_SHARE_FOLDER_ID=<폴더ID>`
  - 폴더 URL을 복사해 넣어도 되지만, **가능하면 순수 ID**를 권장합니다.

Drive API 호출 자격증명(없으면 공유 실패):
- `GMAIL_CLIENT_ID`
- `GMAIL_CLIENT_SECRET`
- `GMAIL_REFRESH_TOKEN`

---

## 5) DB 마이그레이션(Neon)

Neon SQL Editor에서 **파일 경로가 아니라 SQL 본문**을 실행해야 합니다.

### 5-1. 기본 승인 테이블(필수)

- `scripts/migrations/2026-04-23_access_rbac.sql`

### 5-2. 네이버/Drive 이메일 확장(권장)

- `scripts/migrations/2026-04-24_access_drive_email.sql`

```sql
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
```

---

## 6) 운영 절차(정상 흐름)

1. 사용자: 구글/네이버로 로그인(성공)\n+2. 사용자: `/access-request`에서 가입 신청\n+   - 네이버 로그인 사용자는 **Drive 권한 부여용 Gmail(drive_email)**을 함께 입력\n+3. 관리자: `/dashboard/admin/access`에서 승인\n+4. (자동) Drive 공유가 켜져 있으면 승인과 함께 폴더 reader 공유 시도\n+5. 실패 시: `/dashboard/admin/drive-approvals`에서 공유 상태 확인/재시도\n+
---

## 7) 자주 발생하는 문제/해결

- **가입승인 화면이 ‘조회 실패’**\n+  - 원인: DB에 컬럼/테이블 마이그레이션이 빠진 경우가 많음\n+  - 조치: 위 5번 마이그레이션 적용\n+
- **Drive 승인 화면에 ‘공유 대상 폴더: (알 수 없음)’**\n+  - 원인: `DRIVE_SHARE_FOLDER_ID` 미설정/오타, 또는 Drive API 자격증명(`GMAIL_*`) 누락\n+  - 조치: env 확인 후 재배포\n+
- **Drive 공유 재시도 시 에러 메시지**\n+  - Shared Drive면 `DRIVE_USE_SHARED_DRIVES=1` 필요\n+  - OAuth 계정이 폴더 공유 권한을 갖고 있어야 함(조직 정책에 따라 외부 공유가 막힐 수 있음)\n+
