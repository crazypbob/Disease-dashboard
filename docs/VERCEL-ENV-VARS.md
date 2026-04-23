# Vercel 배포용 환경변수(프로덕션)

이 프로젝트는 **Vercel(웹앱) + Neon(DB)** 조합을 기본 배포로 가정합니다.

## 필수(웹앱이 뜨는 데 필요)

- `DATABASE_URL`
- `NEXTAUTH_URL`
- `AUTH_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `ALLOWED_EMAILS` (쉼표로 구분)
- `ADMIN_EMAILS` (선택이지만 운영에선 보통 넣음)
- `OWNER_EMAILS` (선택) — 전체 UI·가입 승인 권한을 가진 소유자(쉼표 구분). `SIGN_IN_POLICY=db_allowlist`일 때 로그인 허용에 사용.
- `SIGN_IN_POLICY` — 비우거나 `open`(기본): 기존처럼 `ALLOWED_EMAILS` 비어 있으면 전원 로그인 가능. `db_allowlist`: `OWNER_EMAILS`·`ALLOWED_EMAILS`·`approved_users` 테이블에 있는 이메일만 로그인.

## 디버그 리포트·메일 (선택)

매트릭스 **검증 모드**에서 「관리자에게 전송」 시 DB에 저장되며, 아래가 있으면 **Resend**로 관리자 메일함에도 사본을 보냅니다.

- `ADMIN_DEBUG_EMAIL` — 수신함(예: `crazypbob@gmail.com`). 비우면 DB 저장만 하고 메일은 보내지 않음.
- `RESEND_API_KEY` — [Resend](https://resend.com) API 키. 없으면 메일 단계는 건너뜀.
- `RESEND_FROM_EMAIL` — 발신 주소(도메인 인증된 주소 권장). 없으면 Resend 기본 `onboarding@resend.dev`(테스트 한도·정책 확인).

## 선택(해당 기능을 쓰는 경우에만)

- `INGEST_SECRET` (GAS/외부 ingest 호출 보호)
- `CRON_SECRET` (Gmail cron API 보호)
- `GMAIL_CLIENT_ID`
- `GMAIL_CLIENT_SECRET`
- `GMAIL_REFRESH_TOKEN` (`/setup/gmail` 연결 후 발급되는 토큰)

## PDF 관련(주의)

- `PDF_BASE_PATH` 또는 `SAVE_PATH`
  - 로컬/NAS에서는 유효하지만, **Vercel 같은 서버리스 배포 환경에서는 NAS 로컬 경로를 직접 읽을 수 없습니다.**
  - 설정이 없으면 **NAS 상대·절대 경로** `pdf_file_id`에 대해 `/api/pdf`, `/api/pdf-ref`는 `503`을 반환합니다(의도된 동작).
  - **Drive 파일 ID·URL**이면 해당 라우트는 `302`로 Google Drive 뷰로 보냅니다.

---

## 사내 가입·디버그 메일 배포 전 체크리스트

DB 마이그레이션·Vercel 변수를 한 번에 점검할 때 사용합니다.

### Neon / 테이블

- [ ] `npm run db:init` 또는 [scripts/migrations/2026-04-23_access_rbac.sql](../scripts/migrations/2026-04-23_access_rbac.sql)로 `access_requests`, `approved_users` 존재
- [ ] (검증 전송 사용 시) `debug_reports` — [scripts/migrations/2026-04-23_debug_reports.sql](../scripts/migrations/2026-04-23_debug_reports.sql) 등 해당 마이그레이션 적용

### Vercel(프로덕션) — 인증·RBAC

- [ ] `DATABASE_URL`, `NEXTAUTH_URL`, `AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- [ ] 사내 전용으로 막을 때: **`SIGN_IN_POLICY=db_allowlist`**
- [ ] **`OWNER_EMAILS`** — 본인(전체 UI·가입 승인 권한) 이메일(쉼표 구분)
- [ ] (선택) `ADMIN_EMAILS` — 승인 UI 접근을 소유자 외에도 줄 경우
- [ ] (선택) `ALLOWED_EMAILS` — `db_allowlist`에서도 허용할 고정 계정

### Vercel — 검증 리포트 메일(Resend)

- [ ] `ADMIN_DEBUG_EMAIL` — 수신함
- [ ] `RESEND_API_KEY`
- [ ] `RESEND_FROM_EMAIL` — 도메인 인증 발신 주소(없으면 Resend 테스트 발신 한도·정책 확인)

### 배포 후 스모크

- [ ] 비로그인 시 `/access-request`에서 신청 폼 제출 → DB `access_requests`에 행 생성
- [ ] `OWNER_EMAILS` 계정으로 `/dashboard/admin/access`에서 승인 → 동일 Google 이메일로 로그인 성공
- [ ] 승인된 사내 계정이 **다비** 매트릭스만 보이는지(다른 `aud` URL 조작 시에도 서버에서 제한되는지)
- [ ] 매트릭스 `verify=1`에서 「관리자에게 전송」 후 `ADMIN_DEBUG_EMAIL` 수신 및 `/dashboard/admin/debug-reports` 목록 확인

