# PRRS 항체(ELISA) 파싱·DB·UI — 운영 메모

> **목적**: 항체가(S/P) 파싱·import·매트릭스 불일치가 다시 났을 때 **어디를 볼지** 한곳에 모은다.  
> **최종 정리일**: 2026-04-11 (성진·디앤디 PRRS Ab 오판 정·재import 검증 포함)

---

## 1. 양성 기준(코드와 동일)

| 구간 | 해석 | import 후 DB `result` |
|------|------|------------------------|
| S/P ≥ **0.4** | 양성 | `+` (또는 파서 출력 `양성`) |
| **0.3 ≤ S/P < 0.4** | 의심 | `?` |
| 모두 **< 0.3** | 음성 | `-` |

**코드 위치**

- OCR 집계: `ocr-pipeline/app/parsers/jbnu.py` — `JbnuParser._aggregate_prrs_elisa`
- 옵티팜: `ocr-pipeline/app/parsers/optifarm.py` — 위 집계 재사용
- 엑셀 → DB: `scripts/import-ocr-results.ts` — `resultFromPrrsElisaCell`, `aggregatePrrsElisa`
- UI 범례: `components/TiterTrendPanel.tsx`

매트릭스 PRRS Ab 슬롯: `lib/matrix.ts` `getPrrsPair` (같은 주·농장에서 **id 큰 행** 우선), 표시는 `lib/result-display.ts` `parseTestResult`.

---

## 2. 오류가 자주 나는 원인(기준이 아니라 **데이터·경로**)

1. **엑셀 `PRRS_항체` 셀에 잘못된 숫자**  
   예: 개체번호 `80-506`에서 앞자리 **80**만 잘못 들어가면, import는 숫자만 보면 `80 ≥ 0.4` → 양성(`+`)으로 해석할 수 있음.  
   **대응**: PRRS S/P는 보통 **소수 한 자리대(-1~10)**. 아래 “가짓값 필터” 참고.

2. **관리자 「DB 새로고침」 vs 터미널 import**  
   둘 다 `import-ocr-results.ts`를 쓰되, **읽는 `results.xlsx` 경로**가 다르면 옛 엑셀을 반영함.  
   `OCR_OUTPUT_PATH` 우선 → `ocr-pipeline/output/results.xlsx` 등 (`app/api/admin/import-ocr/route.ts` `findXlsxPath`).

3. **`--replace` 없이 기대한 것과 다른 갱신**  
   재파싱 후 **동일 PDF 행 UPDATE**가 필요하면 `--replace` 경로를 쓴다 (`scripts/import-ocr-results.ts`).

4. **OCR 배치 범위**  
   input에 PDF가 일부만 있으면 엑셀에 그 주·농장 행이 없어 **UPDATE 대상이 안 됨**.

5. **날짜/주 버킷**  
   접수일 vs 파일명 날짜 불일치 시 매트릭스 **열(주)** 이 어긋날 수 있음.

---

## 3. 코드로 넣어 둔 방어(재발 시 확인)

### 3.1 PRRS S/P “가짓값” 범위 (APP와 구분)

- **PRRS ELISA S/P ratio** 만: 대략 **-1 ~ 10** 밖이면 표본 오인 가능성으로 보고 제외·필터.
- **APP(흉막폐렴) S/P Value(%)** 는 스케일이 넓어 **같은 상한을 쓰지 않음**.

**위치**

- TS import: `scripts/import-ocr-results.ts` — `isPlausiblePrrsSpRatio`, `resultFromPrrsElisaCell`
- 전북대 표: `ocr-pipeline/app/parsers/jbnu.py` — `JbnuParser._is_plausible_prrs_sp_ratio` (파일명 타깃이 **`['PRRS']`일 때만** S/P 열 숫자에 적용; 호흡기 ELISA `APP`+`MH` 등은 필터 안 함)
- 옵티팜 PRRS 표: `ocr-pipeline/app/parsers/optifarm.py` — `_prrs_serum_from_pdf_tables`에서 동일 헬퍼 사용

### 3.2 옵티팜 PDF 테이블

- 단일 표 `개체 구분 | S/P ratio | 결과 판독` 은 헤더로 S/P 열을 찾음.
- **APP+MH+PRRS 복합 표**는 PRRS 블록만 타겟하는 추가 로직이 필요할 수 있음(레이아웃·pdfplumber 표 깨짐 시 OCR 텍스트 폴백으로 이슈).

### 3.3 검증 스크립트

```powershell
Set-Location "X:\...\disease-dashboard"
npm.cmd exec -- tsx scripts/verify-prrs-elisa-sources.ts
# 옵션: --from= --to= --farms=DB1001,DB1003 --file=ocr-pipeline/output/results.xlsx
```

DB `PRRS`+`ELISA` 행과 같은 기간·농장의 `PRRS_항체` 셀을 나란히 출력한다.

---

## 4. 재파싱 → DB 반영(규칙과 동일한 순서)

**NAS (bash, SSH 후)**

```bash
cd /volume1/docker/질병메일링_대시보드/disease-dashboard/ocr-pipeline
docker compose build --pull
docker compose run --rm ocr-pipeline
```

**Windows (프로젝트 루트)** — NAS와 **같은 폴더를 마운트**해 쓰면 복사 생략 가능.

```powershell
Set-Location "X:\질병메일링_대시보드\disease-dashboard"
npm.cmd exec -- tsx scripts/import-ocr-results.ts --file=ocr-pipeline/output/results.xlsx --replace
```

상세·주의: `.cursor/rules/ocr-db-pipeline-commands.mdc`

**관리자 UI 「DB 새로고침」**  
`POST /api/admin/import-ocr` — 기본 `--replace`, spawn 타임아웃 **30분**(`1_800_000` ms). 대량은 CLI 권장.

---

## 5. 대시보드 「일령 미입력 항체가」패널 (2026-04-11)

- **왼쪽 농장 선택(`?farm=`)이 있을 때만** 해당 농장의 pending만 API에서 조회 (`GET /api/titers/pending?farms=...`).
- **PRRS/MH** 그룹 중 표본 S/P가 **모두 0.3 미만**(전부 음성 구간)이면 목록에서 제외(추세 입력 우선순위 낮음). **APP** 는 자동 제외 규칙 없음.
- `excludeNegative=0` 으로 끌 수 있음.

---

## 6. 문제 재발 시 체크리스트

1. **DB**: `test_records`에서 해당 농장·주·`disease=PRRS`,`test_type=ELISA`,`result`,`id`,`pdf_file_id`
2. **엑셀**: 같은 `results.xlsx` 행의 `PRRS_항체`·`PRRS_S/P`·`판정` 열
3. **import**: `--replace`, 사용한 xlsx 경로가 Next가 읽는 파일과 동일한지
4. **파서**: 옵티팜이면 PDF 테이블 추출 결과가 S/P 열을 가리키는지(개체 ID 열 숫자 혼입 여부)
5. **`verify-prrs-elisa-sources.ts`** 로 DB vs xlsx 한 번에 비교

---

## 7. 관련 파일 목록

| 역할 | 경로 |
|------|------|
| import·PRRS 셀 숫자 | `scripts/import-ocr-results.ts` |
| 관리자 import API | `app/api/admin/import-ocr/route.ts` |
| 관리자 버튼 | `components/AdminHeaderActions.tsx` |
| 옵티팜 파서 | `ocr-pipeline/app/parsers/optifarm.py` |
| 전북대 파서 | `ocr-pipeline/app/parsers/jbnu.py` |
| 일령 미입력 API | `app/api/titers/pending/route.ts` |
| 일령 미입력 UI | `components/PendingTitersPanel.tsx`, `components/DashboardContent.tsx` |
| OCR→DB 명령 규칙 | `.cursor/rules/ocr-db-pipeline-commands.mdc` |
