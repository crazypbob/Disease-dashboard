# OAuth 리디렉션 URI (프로덕션)

Vercel에 배포한 뒤에는, OAuth 콘솔에 **프로덕션 도메인**을 리디렉션 URI로 등록해야 로그인/연동이 동작합니다.

## 1) Google 로그인(NextAuth)

- 콜백 경로: `/api/auth/callback/google`
- 예시(프로덕션 도메인 가정):
  - `https://<your-domain>/api/auth/callback/google`

## 2) (선택) Gmail 연결(/setup/gmail)

메일 파이프라인(Gmail API)을 쓸 경우, 아래 콜백도 등록되어야 합니다.

- 콜백 경로: `/api/setup/gmail/callback`
- 예시:
  - `https://<your-domain>/api/setup/gmail/callback`

