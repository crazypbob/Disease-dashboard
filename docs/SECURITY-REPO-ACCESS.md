# Git·Vercel·시크릿 — 비공개 운영 체크리스트

소스·배포·환경변수가 **회사 외부 또는 미승인 내부 인원**에게 불필요하게 노출되지 않도록 할 때의 최소 점검입니다. (앱 코드만으로는 “비공개”를 강제할 수 없고, **호스팅·조직 설정**이 핵심입니다.)

---

## 1. Git (GitHub / GitLab 등)

- [ ] 저장소 **Visibility: Private**.
- [ ] **Outside collaborators** / 팀원 초대를 최소한으로 유지.
- [ ] Fork 정책: 조직 정책으로 public fork 방지 또는 저장소별 제한.
- [ ] 기본 브랜치 **보호 규칙**(필수 리뷰·직접 push 제한) — 선택이나 권장.
- [ ] `.env.local`, `*.pem`, 서비스 계정 JSON 등 **비밀 파일이 커밋 이력에 없는지** 주기적으로 확인 (`git log --all --full-history -- path`).

---

## 2. Vercel

- [ ] 프로젝트가 **팀/개인 소유**이며 불필요한 **Guest** 또는 외부 이메일 초대가 없는지.
- [ ] **Deployment** 목록·Preview URL 접근 권한이 팀 정책과 맞는지(특히 Preview가 외부에 열리지 않도록).
- [ ] Production / Preview **Environment Variables**에만 시크릿을 두고, 로그에 값이 찍히지 않도록 개발 시 주의.

---

## 3. 앱·API

- [ ] `RECORDS_VERIFY_TOKEN` 등 **Bearer 토큰**은 절대 공개 저장소·슬랙에 붙여넣지 않기. 유출 시 해당 엔드포인트는 사실상 공개 DB 읽기에 가깝게 동작할 수 있음.
- [ ] `INGEST_SECRET`, `CRON_SECRET`, `RESEND_API_KEY` 등은 Vercel에만 보관.

---

## 4. OAuth (Google)

- [ ] Google Cloud Console에서 **OAuth 동의 화면·승인된 도메인**이 실제 서비스 범위와 일치하는지.
- [ ] `NEXTAUTH_URL`과 등록된 **redirect URI**가 프로덕션·프리뷰별로 정확한지.

---

## 5. 관련 문서

- 배포 전 절차: [`DEPLOYMENT-HOSTING.md`](DEPLOYMENT-HOSTING.md)
- Vercel 환경변수 목록: [`VERCEL-ENV-VARS.md`](VERCEL-ENV-VARS.md)
