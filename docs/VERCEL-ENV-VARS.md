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

## 선택(해당 기능을 쓰는 경우에만)

- `INGEST_SECRET` (GAS/외부 ingest 호출 보호)
- `CRON_SECRET` (Gmail cron API 보호)
- `GMAIL_CLIENT_ID`
- `GMAIL_CLIENT_SECRET`
- `GMAIL_REFRESH_TOKEN` (`/setup/gmail` 연결 후 발급되는 토큰)

## PDF 관련(주의)

- `PDF_BASE_PATH` 또는 `SAVE_PATH`
  - 로컬/NAS에서는 유효하지만, **Vercel 같은 서버리스 배포 환경에서는 NAS 로컬 경로를 직접 읽을 수 없습니다.**
  - 설정이 없으면 `/api/pdf`, `/api/pdf-ref`는 `503`을 반환합니다(의도된 동작).

