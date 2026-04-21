# 데이터 검증 런북 (관찰 항목 추적용)

## 목적

“매트릭스에 보이는 값이 실제 PDF와 맞는지”, “연속 양성이 데이터 중복/재의뢰인지”를 **사람이 빠르게 대조**할 수 있게 하는 최소 절차입니다.

---

## 1) 기본 검증 루틴 (권장)

### A. 검증 HTML 생성 (가장 빠름)

```bash
npm run verify:matrix-report -- DB1001 200
```

- 결과: `scripts/verify-matrix.html`
- 표에서 셀을 클릭하면 `/api/pdf?id=...`로 PDF가 열리도록 구성되어 있어, **PDF 원본과 직접 대조**할 수 있습니다.

### B. OCR 엑셀 구조가 의심될 때 (전북대/단일컬럼 등)

```bash
npm run inspect:ocr-excel -- --file="X:/ocr-pipeline/output/results.xlsx"
```

---

## 2) “연속 양성”이 보일 때 체크리스트

예: 성진(DB1001) 3/24~3/25 PRRS 항체 연속 양성

- **같은 날짜에 중복 행이 있는지** (동일 `date + farm + disease + test_type`)
- **PDF가 다른지** (접수번호/파일명이 다른지, 같은 파일을 재처리한 건지)
- **PRRS 항체 판정 근거**가 S/P 수치 기준으로 맞는지 (양성/의심/음성)
- 재-import 후에도 동일하면 **원본 PDF·접수번호·파일명**으로 의뢰 중복 여부를 확인 (`개발일지.md` 추적 항목)

---

## 2b) 조산(DB3001) 점검

- 터미널 점검: `npm run inspect:josan`
- OCR import만으로 `pdf_file_id`가 비어 수동 연결이 필요했던 케이스: `npm run link:josan-pdf -- --date=YYYY-MM-DD --disease=PRRS --type=ELISA --id=...` (상세·CSV 일괄은 `scripts/link-josan-pdf.ts` 주석, `docs/CHANGELOG.md` “조산 점검” 참고)
- 특정 일자 미반영: 해당일 PDF가 메일/NAS에 도착했는지 먼저 확인

---

## 3) 재처리(리커버리) 표준 흐름

### A. 먼저 dry-run으로 변화량 확인

```bash
npm run import:ocr -- --file="X:/ocr-pipeline/output/results.xlsx" --dry-run
```

### B. 기존 레코드 갱신이 필요하면 `--replace`

```bash
npm run import:ocr -- --file="X:/ocr-pipeline/output/results.xlsx" --replace
```

### C. 3/23 이전 누락까지 한 번에 재처리해야 하면

```bash
python scripts/nas-auto-pipeline.py --skip-imap --all-dates
```

---

## 4) 중복 방지 메커니즘(운영 확인 포인트)

- `nas-auto-pipeline.py`는 NAS 저장소에서 **신규 PDF만 OCR input으로 복사**하고, 처리 로그를 `scripts/.processed_pdfs.txt`에 기록합니다.
- OCR 쪽 watcher는 `parsed_files` + sha256으로 “엑셀 중복 적재”를 줄이도록 설계되어 있습니다(단, 대시보드 DB 반영은 import 단계가 책임).

