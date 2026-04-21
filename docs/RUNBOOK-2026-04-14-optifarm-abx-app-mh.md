# 2026-04-14 Runbook — 옵티팜(Optipharm) / 항생제 감수성 / APP·MH 혈청 / 효돈 링크 누락

내일 그대로 실행할 수 있게, **OCR → results.xlsx → DB 반영** 절차와 오늘 수정한 포인트를 정리한다.

---

## 오늘까지 반영한 변경 요약

### 1) 매트릭스 질병 필터 추가

- **`항생제 감수성검사`** 필터 추가
- 위치: **`기타세균`과 `유전자검사` 사이**
- 결과 표기: 양성/음성 대신 **결과지 존재 = `V`**

관련 파일:

- `lib/disease-filter.ts`
- `lib/disease-filtering.ts`
- `lib/result-display.ts`
- `lib/matrix.ts`

### 2) 옵티팜 파서 확장

- **세균 검사 결과서(약제 내성/감수성 표)** 감지 시 `항생제_감수성 = V`
- **혈청 결과서 테이블(APP ApxIV / MH)**에서 **‘결과 판독’**을 집계해 `APP_항체`, `MH_항체` 요약 생성
- `PDF_파일ID`가 비어 링크가 깨지는 케이스 방지용으로:
  - OCR 결과 row에 **`PDF_파일ID = YYYY-MM/<파일명>.pdf`**를 기본으로 채움

관련 파일:

- `ocr-pipeline/app/parsers/optifarm.py`
- `ocr-pipeline/tests/test_optifarm.py`

### 3) 메일 수집에서 `@optipharm.co.kr` 발신 처리 강화

- `jew@optipharm.co.kr` 같은 신규 발신이 들어와도 첨부 PDF가 **항상 수집/파싱 대상**이 되도록 키워드 추가

관련 파일:

- `lib/mail-pipeline/config.ts`

### 4) 효돈(DB3007) 2026-04-14 “링크 없음” 원인 확인

DB 레코드:

- `5578` MH PCR `-` (pdf 없음)
- `5579` MHR PCR `+` (pdf 없음)
- `5580` APP PCR `-` (pdf 없음)

원인:

- `ocr-pipeline/output/results.xlsx`의 해당 행에 **`PDF_파일ID`가 비어있었고**
- import가 `pdf_file_id`를 채우지 못해 **매트릭스에서 근거 PDF 링크가 null**로 보였음

이번 수정으로, 옵티팜 파서가 `PDF_파일ID` 기본값을 채우도록 보강했으니 **OCR 재실행 + import 재수행**하면 해결되는 흐름이다.

---

## 내일 실행 절차 (권장: 전체 재반영)

> 주의: **NAS(bash)**와 **Windows PowerShell**은 환경이 다르다. 아래 섹션을 섞지 말 것.

---

## A) NAS (SSH, bash) — OCR 파이프라인 재실행

### A-1. 먼저 실제 경로 찾기 (플레이스홀더 금지)

```bash
find /volume1 -maxdepth 6 -type d -name "disease-dashboard" 2>/dev/null
```

출력된 경로를 확인한 뒤, `ocr-pipeline`으로 이동한다. 예:

```bash
cd /volume1/docker/질병메일링_대시보드/disease-dashboard/ocr-pipeline
```

### A-2. OCR 실행

```bash
docker compose build --pull
docker compose run --rm ocr-pipeline
```

완료되면 호스트에 `ocr-pipeline/output/results.xlsx`가 갱신된다.

---

## B) Windows (PowerShell) — results.xlsx 복사/동기화

NAS의 `ocr-pipeline/output/results.xlsx`를 로컬 저장소의 아래 위치로 복사(동기화):

- `X:\질병메일링_대시보드\disease-dashboard\ocr-pipeline\output\results.xlsx`

---

## C) Windows (PowerShell) — DB 반영(import)

프로젝트 루트에서 실행:

```powershell
Set-Location "X:\질병메일링_대시보드\disease-dashboard"
npm.cmd exec -- tsx scripts/import-ocr-results.ts --file=ocr-pipeline/output/results.xlsx --replace
```

기대효과:

- 대덕: 옵티팜 **혈청 APP/MH 판독 요약**이 `APP_항체`, `MH_항체`로 들어감
- 대덕: **항생제 감수성** 결과서는 `항생제 감수성검사`로 들어가고 결과는 `V`
- 효돈(DB3007) 2026-04-14: 기존 APP/MH/MHR PCR 레코드에 **`pdf_file_id`가 채워질 가능성**이 커짐(엑셀에 `PDF_파일ID`가 들어오므로)

---

## D) 빠른 확인(검증) 명령

### D-1. 특정 record_id 확인

```powershell
Set-Location "X:\질병메일링_대시보드\disease-dashboard"
npm.cmd exec -- tsx scripts/query-record-ids.ts 5578 5579 5580
```

여기서 `pdf_file_id`가 null → 값으로 채워졌는지 확인.

### D-2. 엑셀에서 특정 날짜/농장 행이 있는지 확인

```powershell
Set-Location "X:\질병메일링_대시보드\disease-dashboard"
npm.cmd exec -- tsx scripts/inspect-ocr-excel-rows.ts --date=2026-04-14 --farm=DB3007 --file="ocr-pipeline/output/results.xlsx"
```

`PDF_파일ID`가 **비어있지 않게** 출력되는지 확인.

### D-3. PRRS ELISA 소스 대조(필요 시)

```powershell
Set-Location "X:\질병메일링_대시보드\disease-dashboard"
npm.cmd exec -- tsx scripts/verify-prrs-elisa-sources.ts --from=2025-02-05 --to=2025-02-11 --farms=DB1002
```

---

## 매트릭스에서 기대하는 화면 변화

- 질병 필터에 **`항생제 감수성검사`**가 보이고 선택 가능
- 항생제 감수성 결과는 **`V`**로 표기(결과지 존재)
- 옵티팜 혈청 결과서의 APP/MH는 **`APP` / `MH` Ab(ELISA) 요약**이 채워짐
- 효돈 2026-04-14 APP/MH/MHR 레코드는 **PDF 링크가 붙어** 근거 확인 가능(엑셀 `PDF_파일ID`가 채워지는 경우)

