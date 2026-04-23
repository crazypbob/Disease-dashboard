# RUNBOOK: 전체 재파싱 → DB → Drive → 웹 원본 확인

NAS를 진실 공급원으로 두고, OCR 결과를 DB에 반영한 뒤 PDF를 Google Drive에 올리고 `pdf_file_id`를 Drive ID로 바꿉니다. Vercel에서는 NAS 경로 스트리밍이 불가하므로 **Drive ID·URL이 들어가야** 매트릭스에서 원본이 열립니다.

상위 개요는 [PIPELINE.md](PIPELINE.md)를 참고하세요.

## 사전 조건

- Neon `DATABASE_URL`이 `.env.local`(또는 실행 환경)에 설정됨.
- PDF 루트 경로: `SAVE_PATH` 또는 `PDF_BASE_PATH`와 실제 NAS 폴더(`…/검사결과_PDF`)가 일치.
- Drive 업로드: `.env.local`에 `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`. 선택 `DRIVE_ROOT_FOLDER_ID`(고정 업로드 폴더).
- Drive에서 해당 폴더·파일이 **뷰어에게 읽기 가능**한 공유 정책인지 확인(링크 열림 테스트).

## 권장 순서(체크리스트)

### 1) NAS에서 OCR·엑셀 재생성

- 전체 재파싱이 필요하면 프로젝트 루트에서 예:
  - `npm run ocr:full-reparse` — [scripts/ocr-full-reparse.py](../scripts/ocr-full-reparse.py) (`--replace` 등 옵션은 해당 스크립트 도움말 참고)
  - 또는 `npm run ocr:pdf-db-pipeline -- --all-dates` 등 상황에 맞는 배치
- 산출물: `ocr-pipeline/output/results.xlsx` (또는 운영에서 쓰는 동일 파일 경로)

### 2) DB 반영(import)

```bash
npm run import:ocr
```

- `import-ocr-results.ts`가 읽는 `results.xlsx` 경로가 맞는지 확인(스크립트 인자·환경변수).
- 반영 후 DB에서 `pdf_file_id`가 **NAS 상대경로** 형태(`YYYY-MM/파일.pdf`)인 행이 있는지 샘플 조회.

### 3) Drive 업로드 + `pdf_file_id` 일괄 갱신

**반드시 먼저 dry-run:**

```bash
npm run sync:drive -- --base="X:/질병메일링_대시보드/ocr-pipeline/input/검사결과_PDF" --dry-run
```

- `--since=2026-04`처럼 월 단위로 나눠 돌리면 부담이 적음.
- 특정 파일만: `--rel=2026-04/sample.pdf` 또는 `--rels-file=scripts/.drive_sync_rels.txt`

**본 실행(API 한도 완화):**

```bash
npm run sync:drive -- --base="…동일 경로…" --sleep-ms=200
```

- 스크립트: [scripts/sync-pdfs-to-drive.ts](../scripts/sync-pdfs-to-drive.ts)
- DB에 해당 `pdf_file_id`(상대경로)가 없는 파일은 스킵됨.

### 4) Drive 권한·웹에서 원본 열기 검증

- 브라우저에서 매트릭스 셀(밑줄 링크) 클릭 → `/api/pdf` 또는 클라이언트 `pdfViewUrl`이 **Drive 뷰**로 열리는지 확인.
- 403/비공개면 Drive 폴더·파일 공유 범위를 조정.

### 5) 자동 파이프라인과의 관계

- [PIPELINE.md](PIPELINE.md): `nas-auto-pipeline.py`가 import 성공 후 Drive 동기화를 호출할 수 있음. 끄려면 `SKIP_DRIVE_SYNC=1`.

## 문제 발생 시

- **sync가 모두 스킵**: `--base`가 PDF 실제 루트와 다른지, `pdf_file_id`가 `YYYY-MM/…pdf` 패턴인지 확인.
- **Vercel에서만 원본 안 열림**: `pdf_file_id`가 여전히 NAS 경로면 `503`/`404`가 정상 동작이며, Drive ID 반영이 필요함.
- **업로드 실패**: 토큰 만료·Drive API 쿼터·`DRIVE_ROOT_FOLDER_ID` 권한 확인.
