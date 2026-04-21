# 참고 자료

---

## 1. 스크립트 목록

### 파이프라인

| 스크립트 | 용도 |
|----------|------|
| `naver-imap-to-nas.py` | 네이버 IMAP → NAS 첨부 저장 |
| `naver-vetdxlab-download.py` | 전북대 vetdxlab 링크 PDF 다운로드 |
| `naver-nas-compare-download.py` | 네이버 vs NAS 비교, 누락분 다운로드 |
| `nas-auto-pipeline.py` | 메일→OCR→DB 자동 파이프라인 |
| `naver-watch.py` | 1~2분마다 naver-imap 자동 실행 |
| `import-ocr-results.ts` | results.xlsx → DB |
| `drive-download-for-ocr.ts` | Drive PDF → NAS input (레거시) |
| `bulk-naver-to-drive.ts` | Gmail → Drive 일괄 (레거시) |

### DB·데이터

| 스크립트 | 용도 |
|----------|------|
| `init-db.ts` | DB 초기화 |
| `import-from-sheet-csv.ts` | 검사결과DB.csv → DB |
| `import-farms-from-excel.ts` | 농장주소록 Excel → DB |
| `fix-duplicate-pdf.ts` | 중복 pdf_file_id NULL 처리 |
| `fix-farm-codes.ts` | farm_code 정규화 |
| `link-josan-pdf.ts` | 조산 레코드에 PDF 경로 수동 연결 |

### 점검·검증

| 스크립트 | 용도 |
|----------|------|
| `verify-parsing.ts` | 터미널 레코드+링크 출력 |
| `verify-matrix-report.ts` | 매트릭스 검증 HTML 생성 |
| `inspect-josan.ts` | 조산 DB·링크 점검 |
| `compare-csv-db.ts` | CSV ↔ DB 대조 |

---

## 2. 농장 매핑

- **농장주소록**: `농장주소록-규모(250401 기준).xlsx`
- **매핑 파일**: `lib/farms.ts`, `lib/mail-pipeline/farm-mapping.ts`
- DB코드↔농장명 확인 후 반영

---

## 3. AI 검증 방법 (사람이 수행)

- **HTML 리포트**: `npm run verify:matrix-report [farm_code] [limit]` → `verify-matrix.html`
- **터미널 리스트**: `npm run verify:parsing [farm_code] [limit]`
- AI는 도구만 제공. 실제 PDF 대조는 사용자 수행.

---

## 4. 레거시: Drive 링크

- Drive 파일 ID: URL의 `/d/` 와 `/view` 사이
- record에 `pdf_file_id` (또는 `drive_file_id`) 넣으면 매트릭스 클릭 시 원본 열림
- NAS 전환 후에는 `/api/pdf` 사용

---

## 5. 레거시: GAS Ingest API

```
POST /api/ingest
x-ingest-secret: {INGEST_SECRET}
Body: { pdfFileId, records: [{ date, farm_code, disease, test_type, result, drive_file_id }] }
```

- `disease`: PRRS, PED, PCV2 등 (`lib/optipharm-reference.ts`)
- `test_type`: PCR(항원), ELISA(항체)
