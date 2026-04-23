# 파이프라인 가이드

> **저장·OCR 진실 공급원: NAS(X: 드라이브).**  
> **Google Drive(선택):** `test_records.pdf_file_id`에 Drive 파일 ID·공유 URL이 들어 있으면, 매트릭스 원본 링크와 `/api/pdf`는 **브라우저에서 Drive로 리다이렉트**합니다. Vercel 등 서버리스에서는 NAS 경로 스트리밍 대신 이 방식이 필요합니다.

---

## 1. 전체 흐름

```
네이버 메일 (IMAP / vetdxlab)
    ↓ naver-imap-to-nas.py, naver-vetdxlab-download.py
ocr-pipeline/input/검사결과_PDF/{YYYY-MM}/*.pdf
    ↓ OCR Docker
ocr-pipeline/output/results.xlsx
    ↓ import-ocr-results.ts
Neon DB → 대시보드 매트릭스
    ↓ 원본: NAS 경로 → /api/pdf 스트림 · Drive ID/URL → Drive 뷰로 이동
```

| 단계 | 명령 | 비고 |
|------|------|------|
| 누락 다운로드 | `npm run naver:compare-download` | 네이버 vs NAS 비교, 누락분만 |
| 자동 파이프라인 | `npm run naver:pipeline` | 메일→OCR→DB 1회 실행 |
| OCR 결과 → DB | `npm run import:ocr` | results.xlsx 경로 지정 가능 |
| NAS PDF → Drive + DB | `npm run sync:drive -- --base="<SAVE_PATH>"` | `YYYY-MM/파일.pdf` 업로드 후 `pdf_file_id`를 Drive ID로 갱신 — 단계별 절차는 [RUNBOOK-DRIVE-REPARSING.md](RUNBOOK-DRIVE-REPARSING.md) |
| 3/23 이전 포함 | `npm run ocr:pdf-db-pipeline -- --all-dates` | 날짜 컷오프 무시 |

**1회(전체 재파싱 → Drive 이전):** NAS에서 `python scripts/ocr-full-reparse.py --replace`로 OCR·DB 반영 후, 같은 호스트에서 `npm run sync:drive -- --base="<SAVE_PATH>"` 실행. 대량 업로드 시 API 한도를 피하려면 `--sleep-ms=200` 옵션을 붙일 수 있다. 미리보기는 `--dry-run`, 특정 월 이후만 `--since=2026-04`.

**상시(자동 업로드):** `scripts/nas-auto-pipeline.py`는 DB import에 성공하면 곧바로 `sync-pdfs-to-drive.ts`를 호출한다 (이번 OCR input에 있던 PDF에 대해 SAVE_PATH 기준 상대경로로 동기화). 끄려면 `SKIP_DRIVE_SYNC=1`. Drive 루트를 이름 검색 대신 고정 ID로 쓰려면 `DRIVE_ROOT_FOLDER_ID`(질병메일링_대시보드에 해당하는 폴더)를 `.env.local` / `env.nas`에 둔다.

→ 전체 명령: **`COMMANDS.md`**  
→ 네이버·OCR 설정: **`SETUP-NAVER-OCR.md`**

---

## 2. 현재 vs 목표

| 구분 | 현재 | 목표 |
|------|------|------|
| 저장 | NAS (X:) | 동일 |
| 메일 | 네이버 IMAP → NAS | 동일 |
| 파싱 | 수동 OCR 실행 | input 감지 → OCR 자동 |
| DB | 수동 import | results.xlsx 감지 → 자동 import |
| 매트릭스 | 새로고침 | DB 반영 시 실시간 |

---

## 3. 폴더 구조

### PDF·OCR

```
X:/질병메일링_대시보드/
├── ocr-pipeline/
│   ├── input/
│   │   └── 검사결과_PDF/    ← SAVE_PATH (기본)
│   │       └── {YYYY-MM}/*.pdf
│   └── output/
│       └── results.xlsx
├── disease-dashboard/
│   ├── scripts/
│   │   └── verify-matrix.html
│   └── ...
└── 검사결과_PDF/             ← 또는 별도 통합 루트
    └── {YYYY-MM}/*.pdf
```

### 폴더 통합

- **SAVE_PATH**: 한 곳으로 통일 (예: `X:/질병메일링_대시보드/검사결과_PDF`)
- **하위 규격**: `YYYY-MM` (2026-03 등)
- 메일저장 → 검사결과_PDF 이전: `migrate-mail-to-pdf-folder.py` 또는 robocopy
- `.processed_pdfs.txt`: SAVE_PATH 변경 시 초기화 검토

---

## 4. 처리 대상·옵션

- **기본**: 2026-03-23 이후 PDF만 처리
- **3/23 이전 포함**: `--all-dates` (3/20 등 미반영 시)
- **전북대 vetdxlab**: 링크 PDF → `naver-vetdxlab-download.py`

---

## 5. 관련 문서

- `COMMANDS.md` — 명령어 전체
- `SETUP-NAVER-OCR.md` — 네이버 IMAP, OCR Docker
- `CHANGELOG.md` — 변경 요약
