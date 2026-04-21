# 질병메일링 대시보드 — 설정 가이드

> X: 드라이브 이전 시 `OCR_INPUT_PATH`, `NAVER_*` 등 추가 → `docs/X-DRIVE-MIGRATION.md`

## 1. 환경 변수 설정

`.env.local` 파일을 만들고 아래 내용을 채우세요.

```env
# Neon DB (Vercel 프로젝트 → Storage → Neon → 연결 후 자동 추가됨)
DATABASE_URL=postgresql://...

# NextAuth
AUTH_SECRET=랜덤문자열
NEXTAUTH_URL=http://localhost:3000
ALLOWED_EMAILS=crazypbob@gmail.com

# Google OAuth (https://console.cloud.google.com → API 및 서비스 → 사용자 인증 정보)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# GAS → Ingest API (GAS 사용 시)
INGEST_SECRET=랜덤문자열

# 메일 파이프라인 (Node 전용, GAS 없음)
GMAIL_CLIENT_ID=
GMAIL_CLIENT_SECRET=
GMAIL_REFRESH_TOKEN=          # /setup/gmail에서 1회 연결 후 발급
CRON_SECRET=                  # /api/cron/check-gmail 인증

# PDF 파싱: NAS TeraCast OCR 사용

# Discord 알림 (선택, 검사결과 등록 시 웹훅)
DISCORD_WEBHOOK_URL=
```

### AUTH_SECRET 생성

```bash
openssl rand -base64 32
```

### Google OAuth 설정

1. https://console.cloud.google.com 접속
2. 프로젝트 생성 또는 선택
3. API 및 서비스 → 사용자 인증 정보 → 사용자 인증 정보 만들기 → OAuth 클라이언트 ID
4. 애플리케이션 유형: 웹 애플리케이션
5. 승인된 리디렉션 URI: `http://localhost:3000/api/auth/callback/google`

---

## 2. DB 초기화

```bash
npm run db:init
```

---

## 3. 로컬 실행

```bash
npm run dev
```

PowerShell에서 `npm.ps1` 실행이 막히면(`ExecutionPolicy`): **`npm.cmd run dev`** 로 실행하거나, `docs/WINDOWS-EXECUTIONPOLICY.md` 참고.

`Error: listen EADDRINUSE ... port 3005` 이면 **이미 3005를 쓰는 프로세스**(다른 터미널의 `next dev` 등)가 있음. `netstat -ano | findstr :3005`로 PID 확인 후 종료하거나, **`npm.cmd run dev:3006`** 으로 http://localhost:3006 에서 띄움.

http://localhost:3005 접속 후 Google 로그인 → 대시보드 확인

## 4. Google Drive 원본 결과지

- 이 프로젝트 폴더가 Drive에 연동되어 있으면, GAS에서 파싱한 PDF 결과지를 Drive에 저장 후 `drive_file_id`로 전달하면 됩니다.
- 매트릭스 셀 클릭 시 새 탭에서 원본 결과지가 열립니다.
- **다른 사람도 볼 수 있게**: Drive에서 해당 파일/폴더 우클릭 → 공유 → "링크가 있는 모든 사용자" 또는 특정 이메일 추가.

## 5. GAS 파싱·ingest 형식 (돼지 전용)

- **disease**: PRRS, PED, PCV2, CSF, APP, Sal 등 (`lib/optipharm-reference.ts` 참고)
- **test_type**: ELISA, PCR, VN test, 세균배양 등
- ND(뉴캐슬병)·AI(조류인플루엔자) 등 가금 질병은 사용하지 않습니다.
