# 질병메일링 대시보드 — 설정 가이드

> 운영(로그인/승인/Drive/네이버) 런북은 `docs/ADMIN-AUTH-DRIVE-NAVER.md`를 우선 참고하세요.

## 1. 환경 변수 설정

`.env.local` 파일을 만들고 아래 내용을 채우세요.

```env
# Neon DB (Vercel 프로젝트 → Storage → Neon → 연결 후 자동 추가됨)
DATABASE_URL=postgresql://...

# NextAuth
AUTH_SECRET=랜덤문자열
NEXTAUTH_URL=http://localhost:3005
ALLOWED_EMAILS=crazypbob@gmail.com
SIGN_IN_POLICY=db_allowlist
OWNER_EMAILS=crazypbob@gmail.com

# Google OAuth (https://console.cloud.google.com → API 및 서비스 → 사용자 인증 정보)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# (선택) Naver OAuth
NAVER_CLIENT_ID=
NAVER_CLIENT_SECRET=

# GAS → Ingest API (GAS 사용 시)
INGEST_SECRET=랜덤문자열

# 메일 파이프라인 (Node 전용, GAS 없음)
GMAIL_CLIENT_ID=
GMAIL_CLIENT_SECRET=
GMAIL_REFRESH_TOKEN=          # /setup/gmail에서 1회 연결 후 발급
CRON_SECRET=                  # /api/cron/check-gmail 인증

# (권장) 가입 승인 시 Drive 폴더 자동 공유
DRIVE_AUTO_SHARE_ON_APPROVE=1
DRIVE_SHARE_FOLDER_ID=        # 검사결과_PDF 폴더ID(권장)
DRIVE_USE_SHARED_DRIVES=1     # Shared Drive면 1

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
5. 승인된 리디렉션 URI: `http://localhost:3005/api/auth/callback/google`

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

http://localhost:3005 접속 후 Google/Naver 로그인 → (승인 필요 시) `/access-request`에서 가입 신청 → 승인 후 대시보드 확인

## 5. GAS 파싱·ingest 형식 (돼지 전용)

- **disease**: PRRS, PED, PCV2, CSF, APP, Sal 등 (`lib/optipharm-reference.ts` 참고)
- **test_type**: ELISA, PCR, VN test, 세균배양 등
- ND(뉴캐슬병)·AI(조류인플루엔자) 등 가금 질병은 사용하지 않습니다.
