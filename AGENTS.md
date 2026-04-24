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

## PDF·Drive 링크 갭 검증 → 해결 순서

1. **갭 리포트**: `npx tsx scripts/report-pdf-link-gaps.ts` — 결과는 있는데 `pdf_file_id` 가 비어 있는 행(A), NAS 상대경로만 있는 행(B). `--since=`, `--farm=`, `--base=`(디스크 존재 여부), `--csv=` / `--json=` 지원.
2. **NAS만 있고 파일이 디스크에 있음**: `npx tsx scripts/sync-pdfs-to-drive.ts --base="…검사결과_PDF" --pending-only` (또는 `--rel=`). 환경·경로는 해당 스크립트 주석 참고.
3. **NAS 경로인데 파일이 없음**: `python scripts/find-pdfs-under-savepath.py --contains …` 로 SAVE_PATH 이하 검색 후, 규칙 경로에 두고 다시 2번. 메일 첨부명(접수번호·`DB3023` 등)으로 한 번에 보려면 `python scripts/verify-savepath-mail-tokens.py` — [SETUP-NAVER-OCR 2.0·저장 여부](docs/SETUP-NAVER-OCR.md) (원본명과 달리 IMAP이 접두 붙인 파일명으로 저장됨). **일별 prefix 점검·감사 로그:** `IMAP_AUDIT_LOG` + `python scripts/verify-imap-saves-for-day.py --date=…` — [SETUP-NAVER-OCR 2.0a](docs/SETUP-NAVER-OCR.md).
4. **`pdf_file_id` 가 NULL**: 원본 PDF 확보 후 ingest / `scripts/link-josan-pdf.ts`(조산 전용) / **`scripts/link-pdf-by-record-ids.ts --csv=…`**(여러 `record_id`에 Drive ID 일괄)으로 `UPDATE`. 2026-04 매트릭스 22건은 `scripts/data/pdf-link-matrix-2026-04.example.csv`에 `drive_file_id`를 채운 뒤 실행. 한빛청주 `DB3023` 특정일 누락 보완은 **결과지와 일치하는 값**으로 `scripts/insert-db3023-missing-day.ts --date= --pdf-id= --prrs-pcr= …`.
5. **(선택) Drive에만 있고 DB에 없는 PDF**: `npx tsx scripts/report-drive-pdf-orphans.ts` — 고아 파일 ID 목록; 정리·수동 매핑 시 참고. (`DRIVE_ROOT_FOLDER_ID`가 이미 `검사결과_PDF`이거나 `DRIVE_SHARE_FOLDER_ID` 사용.) `report-drive-pdf-orphans.ts` 는 목록 API에 **항상** `supportsAllDrives` 를 켜서, 팀 드라이브 안의 `검사결과_PDF` 도 잡습니다(`.env` 의 `DRIVE_USE_SHARED_DRIVES` 와 무관). 업로드 스크립트(`sync-pdfs-to-drive` 등)는 기존처럼 그 플래그를 쓰면 됨. PowerShell에서 `npx` 가 막히면 `npx.cmd` — [WINDOWS-EXECUTIONPOLICY](docs/WINDOWS-EXECUTIONPOLICY.md).)

## 매트릭스 UI (`RecordsMatrix`)

- 스크롤 겹침(본문이 헤더에 비침) 방지: 헤더·데이터 **테이블 분리**, **동일** `colgroup`(single 45px, PRRS 병합 75px, SIV·APP·MH 등 `ab_ag_merged` 는 records에 Ag·Ab **둘 다** 있을 때 75px·아니면 45px — `abAgMergedColumnHasBothSlotsInRecords`), 헤더 래퍼 `sticky` + `z`·`isolate` + 본문은 **셀에 불필요한** `z-index`/`relative` 를 쌓지 않는다(검증 ring 등 **필요한 셀만** `relative`).
