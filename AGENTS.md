# 에이전트 규칙 (disease-dashboard)

- Cursor 규칙: `/.cursor/rules/*.mdc` — **전역 필수**는 [real-paths-in-commands](.cursor/rules/real-paths-in-commands.mdc) (명령어/복붙 예시는 **실제 절대 경로만**, `X:/.../` placeholder 금지).
- `CLAUDE.md`는 이 파일을 참조한다.

## 가입 승인 시 Google Drive PDF 뷰어 공유 (Vercel 등)

- **동작**: 관리자가 가입 요청을 **승인**하면 `검사결과_PDF` 상위 폴더에 해당 Google 이메일을 **reader** 로 추가하고, **승인 취소** 시 제거합니다. 대시보드의 `drive.google.com/file/d/...` 원본 링크를 브라우저에서 열 수 있게 하기 위함입니다.
- **켜기**: `DRIVE_AUTO_SHARE_ON_APPROVE=1` (또는 `true` / `yes`). 꺼 두면 Drive API를 호출하지 않습니다.
- **폴더 ID**: 기본은 `DRIVE_ROOT_FOLDER_ID` + `질병메일링_대시보드` / `검사결과_PDF` 로 해석합니다. 직접 지정하려면 `DRIVE_SHARE_FOLDER_ID` 에 해당 폴더의 Drive ID를 넣습니다.
- **공유 드라이브(팀 드라이브)**: PDF가 팀 드라이브에 있으면 `DRIVE_USE_SHARED_DRIVES=1` 을 함께 설정하세요. (`lib/mail-pipeline/drive-upload.ts` 의 list/create·권한 API에 동일 플래그가 적용됩니다.)
- **전제**: `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` / `GMAIL_REFRESH_TOKEN` 으로 쓰는 OAuth 계정이 그 폴더에 **소유 또는 공유 가능 권한**이 있어야 합니다. Google Workspace에서 **외부(@gmail.com) 공유**가 막혀 있으면 API가 실패합니다.
- **실패 시**: DB 승인/취소는 그대로 반영되고, 관리자 화면에 **Drive 공유 실패** 안내(amber)만 뜹니다.
- **기존 승인자 백필**: `npx tsx scripts/backfill-drive-share-approved.ts --dry-run` 후, `DRIVE_AUTO_SHARE_ON_APPROVE=1` 과 함께 동일 스크립트를 인자 없이 실행.
- **범위 밖**: `ALLOWED_EMAILS` 만으로 들어온 계정은 `approved_users` 와 별개라 자동 공유 대상이 아닙니다. NAS 등 개인 보관 경로(예: 위생도평가)는 이 기능과 무관하며, 메일 파이프라인 추적은 **제목·첨부 파일명** 기준이면 됩니다.
