# 변경 사항 요약

> 드랍·변경된 내용을 간략히 정리. 상세는 각 문서 참조.

---

## UI·매트릭스·메일 검증 (2026-04-24)

**한줄**: `RecordsMatrix` **헤더/본문 이중 테이블** + **픽셀 `colgroup`·`table-fixed`** 로 세로선 정합, **날짜 블록마다 굵은 왼쪽 구분선**, 열 너비 **단일(`single`) 45px · PRRS 병합 75px · SIV·APP·MH(`ab_ag_merged`)는 `abAgMergedColumnHasBothSlotsInRecords()`로 Ag·Ab가 둘 다 있을 때만 75px·아니면 45px**, 병합 셀 Ag/Ab **간격(`gap-2`)** 확대. **IMAP**: `SETUP-NAVER-OCR` §2.0a에 일별 `verify-imap-saves-for-day.py`·**자동 실행 아님·추후 스케줄** 명시, `naver-imap-to-nas.py` 보강 등. **문서**: `00-DOCS-INDEX`·`OCR-NAS-운영-정리` 정본 포인터, `AGENTS.md` 매트릭스·PDF 갭 절차.

| 구분 | 내용 |
|------|------|
| `components/RecordsMatrix.tsx` | 이중 `<table>`·동일 `colgroup`, `scrollbar-gutter:stable`, `cellEdge` 날짜 구분, `matrixDataColWidthPx` |
| `lib/matrix.ts` | `abAgMergedColumnHasBothSlotsInRecords` export |
| `docs/SETUP-NAVER-OCR.md` | §2.0a 일별 검증·감사 로그·자동화 로드맵 |
| 스크립트 (선택 동반) | `verify-imap-saves-for-day.py`, `verify-savepath-mail-tokens.py`, Drive·PDF 링크 점검 스크립트 등 |

---

## 운영·파싱 (2026-04-11 — PRRS 항체·일령 미입력)

**한줄**: PRRS ELISA **S/P 가짓값 필터**(개체번호 오인 숫자 등), 옵티팜/전북대 파서·`import-ocr-results` 정합, **DB 새로고침 기본 `--replace`·30분 타임아웃**, `verify-prrs-elisa-sources.ts` 검증, **일령 미입력 항체가**는 URL `farm` 선택 농장만·PRRS/MH 전부 음성 구간 그룹 제외.  
**통합 문서**: [`PRRS-ANTIBODY-PARSING-AND-OPS.md`](PRRS-ANTIBODY-PARSING-AND-OPS.md)

**추가 (2026-04-12)**: 전북대 `ocr-pipeline/app/parsers/jbnu.py` — 파일명이 `PRRS ELISA`만 있어도 **시료/본문에 APP·MH 항체가 함께 명시**되면 `PRRS_항체`뿐 아니라 **`APP_항체`·`MH_항체`**에 동일 판정(또는 S/P 문자열)을 채움. 테이블 추출 실패 시 regex 폴백에도 동일. 재반영: NAS에서 해당 PDF로 OCR 재실행 → `results.xlsx` → `import-ocr-results --replace`.

**문서·도구 (2026-04-12)**: 도드람(합본)·옵티팜(항원/혈청 파일 분리)·전북대(검사별 파일) **PDF 묶음 규칙**을 [`docs/OCR-PARSER-LAB-BUNDLING.md`](OCR-PARSER-LAB-BUNDLING.md)에 정리하고, `parsers/lab_source_profiles.py`·`ocr-pipeline/tools/analyze_input_pdf_names.py` 추가.

---

## 문서 (2026-04-10 — 웹 호스팅·운영 아키텍처)

**한줄**: **하이브리드 채택** — 웹앱(Next+Neon)은 클라우드, **메일·Docker OCR·import는 NAS/VPS** 등 별도 호스트. 공유 웹호스팅만으로 OCR 스택 이전은 어렵다는 점·대안·배포 체크리스트를 [`DEPLOYMENT-HOSTING.md`](DEPLOYMENT-HOSTING.md)에 정리. `PROJECT-CONTEXT.md`·`README.md`·`00-DOCS-INDEX.md`에 링크.

---

## 문서 (2026-04-06 — 항체가 추세 설계)

**한줄**: PRRS·MH·APP 등 **항체가 추세(1~3농장)** 를 **농장당 엑셀 1개 + 도/시군/면 폴더**로 두고, **대시보드는 DB만 조회**하도록 방향 고정 — 상세·구현 단계 A~E는 [`TITER-TRACKING-SPEC.md`](TITER-TRACKING-SPEC.md). `TODO.md` P6, `ROADMAP-PATENT-STATUS.md` §5.3·§10·§11, `개발일지.md` 반영.

---

## 기능 (2026-04-07 — 로그인 주최 UX · MHR 분리)

**한줄**: 상단 `로그인 주최`로 **매트릭스/지도/좌측 농장선택**을 일관되게 전환하고, 공수의는 `pv(경기/충청)` 데모로 스코프를 제한. 옵티팜 항원 결과서의 **Mycoplasma hyorhinis를 MH가 아닌 `MHR`로 분리**해 오표시를 방지하고, DB backfill SQL을 추가.

---

## 주요 수정 (2026-04-05 — 매트릭스 역할·지도 ASF·문서)

**한줄**: 매트릭스에 **역할 6종**(정부 중앙·지방·공수의·담당 수의·합집합) 및 **시·도 집계**; 지도 **ASF 전국 가상 30점·클릭 동심원·우측 거리 구간 목록·제주 bounds**; **로드맵 단일 문서** [`ROADMAP-PATENT-STATUS.md`](ROADMAP-PATENT-STATUS.md).

| 구분 | 내용 |
|------|------|
| `components/DashboardContent.tsx` | 매트릭스 관점 6버튼, 정부 집계/익명·지방 시도·공수의 권역·합집합; 역할 뷰 시 사이드바 숨김 |
| `components/DashboardPageClient.tsx` | 역할 뷰와 농장 사이드바 표시 연동 |
| `components/RecordsMatrix.tsx` | `matrixViewer`·집계 응답(`SidoAggregateMatrix`) |
| `components/SidoAggregateMatrix.tsx` | 정부·중앙 시·도×월·질병 집계 표 |
| `app/api/records/route.ts` | `matrixScope`·화이트리스트·집계 분기 |
| `lib/matrix-region-filters.ts`, `matrix-viewer-auth.ts`, `farm-sido.ts`, `load-farm-locations.ts`, `gov-central-aggregate.ts`, `viewer-constants.ts` | 스코프·시도·집계·담당 수의명 공통화 |
| `lib/matrix-sido-options-client.ts` | 지방정부 시·도 옵션 로드 |
| `components/FarmMapPanel.tsx` | ASF 전국 가상 점, 클릭 시 500m~10km 5색 원, 우측 패널, 제주 fit·bounds, `DEFAULT_VET_ASSIGNED_NAME` |
| `lib/map-mock-nearby.ts` | `generateNationalAsfMockSites` |
| `lib/map-asf-rings.ts` | 동심원 스타일·거리 구간별 버킷 |
| `lib/map-view-tab-hint.tsx` | ASF 레이어 안내 문구 |
| 문서 | `docs/ROADMAP-PATENT-STATUS.md` 신설, STATUS/TODO/인덱스/개발일지/특허 표 정리 |

**추가 (같은 날)**: [`BACKLOG-ALIGNMENT.md`](BACKLOG-ALIGNMENT.md) — 운영 스케줄·호스트·지도 데모/실DB·RBAC·다음 매트릭스 작업(`vet_union` 1순위)·특허 캡처 일정 합의를 문서화; `TODO.md`·`ROADMAP-PATENT-STATUS.md`·`00-DOCS-INDEX.md` 교차 링크.

---

## 주요 수정 (2026-04-04 — 지도 탭·행안부 레이어·좌표 빌드)

**한줄**: 농장 좌표 JSON 빌드 **geo dedupe**, 지도 탭 **역할별 레이어**(정부·수의사·공수의·농장주)·행안부 권역 필터·정부 인근 목록/CSV·React **중복 key** 방지.

| 구분 | 내용 |
|------|------|
| `scripts/build-farm-locations-from-xlsx.ts` | `farm_code`+`address` dedupe 이후 동일 **`farm_code`·좌표(lat/lng)** 조합으로 중복 행 제거 |
| `components/FarmMapPanel.tsx` | 정부: 다비+행안부 전국, **다비 또는 행안부 점 클릭**으로 기준 설정, 반경 0.5~10km, 인근 목록·**CSV**, 가상 양성 데모, 기준 선택 시 **지도 옆(~20%) 패널**; 공수의: 경기/충청 **주소** 필터 다비 + **`sido`** 로 행안부 권역 필터; 농장주: 기준 농장+반경 내 다비·행안부만 표시 |
| `lib/map-region.ts` | 행안부 레이어용 `nationalSidoMatchesGyeonggi` / `nationalSidoMatchesChungcheong` |
| `lib/map-nearby.ts` | 반경 내 다비·행안부 행 집계·CSV 헬퍼 |
| React | `filtered` 지도용 **geo dedupe**; 농장주·수의사 `<select>` 옵션도 dedupe → **duplicate key** 경고 제거 |
| `components/DashboardContent.tsx` | 지도 모드에서 매트릭스/지도 토글 옆 **`MapViewTabHint`**(다비·좌표·개인정보 안내) |

**특허 명세 대비 구현 단계**: `docs/특허명세서_초안.md` 「구현 현황」표 참고.

---

## 주요 수정 (2026-03-26 — OCR·NAS·전북대 표 파싱)

**한줄**: 전북대 디지털 PDF는 **표(`extract_tables`) 기반 파싱**으로 전환, 옵티팜 디폴트·**watcher DB 중복 방지**, 네이버→NAS 경로·날짜 필터·**엑셀→DB import 타임아웃** 이슈를 문서화.

**상세 통합 문서**: `docs/OCR-NAS-운영-정리.md`

| 구분 | 내용 |
|------|------|
| `parsers/` | 전북대 제외 시 옵티팜 파서 + 날짜 없는 파일명 fallback |
| `watcher.py` | `parsed_files` + 파일 sha256으로 중복 스킵, `DATABASE_URL` 필요 |
| `ocr.py` | `extract_tables_from_pdf` (pdfplumber 테이블) |
| `jbnu.py` | 1·2페이지 활용, `parse_report(..., pdf_path=)`에서 테이블 파싱, 실패 시 regex 폴백 |
| 네이버→NAS | `SAVE_PATH` 실경로 필수; `naver-vetdxlab-download` / `naver-nas-compare-download`에 `--since`/`--before` 등 |
| DB 반영 | `import-ocr-results.ts` 또는 `/api/admin/import-ocr` (대량 시 120초 타임아웃 주의) |

---

## 주요 수정 (2026-03-27 — 전북대 정확도·운영 안정화)

| 구분 | 변경 |
|------|------|
| `ocr-pipeline/app/parsers/jbnu.py` | 접수일자 기준 날짜 통일, ELISA 판정은 **판정열 우선**(미해독 시 S/P 폴백), `MH ELISA`/`호흡기 ELISA` 항체 결과 생성, 항원(PCR) 결과 컬럼 타깃(PED/SIV 등) 분기, `PDF_파일ID` 컬럼 제공 |
| `scripts/import-ocr-results.ts` | `MH_항체`(ELISA) 컬럼 매핑 추가, `--replace` import 시 **stale 레코드(`pdf_file_id` null + 파일명날짜)** 자동 정리로 매트릭스 오표시(양성 잔존) 해결 |
| 대시보드 UI | 관리자 버튼 정리(**DB 새로고침/폴백 목록만 유지**), 매트릭스 헤더에서 `MH`가 ‘세균’으로 표기되던 버그 수정 |

---

## 저장소·파이프라인

| 구분 | 기존 | 변경 |
|------|------|------|
| 저장소 | Google Drive | **NAS** (X: 드라이브) 전용 |
| PDF 보기 | Drive 링크 | **/api/pdf** (인증 사용자, NAS에서 읽기) |
| 결과 파일 | scripts/result/ | **ocr-pipeline/output/results.xlsx** 단일 경로 |
| SAVE_PATH | 질병검사결과/메일저장 | **ocr-pipeline/input/검사결과_PDF** |

---

## 주요 수정 (2026-03-25 — 전북대 파서 전면 수정)

### 전북대(jb5219) 파일명 파싱 버그 수정

**문제**: `parser.py`의 전북대 감지 조건(`'PCR' in 파일명 or 'ELISA' in 파일명`)과 regex가
실제 파일명 패턴과 불일치 → 날짜·농장명·검사종류 전부 빈값으로 저장됨.

**실제 전북대 파일명 패턴 (2025년 이후)**:
```
YYYYMMDD_{4자리코드+농장명}({담당자}) 최종 결과 보고서_jb5219_{검사종류}.pdf
예) 20250305_2006대월(한지현) 최종 결과 보고서_jb5219_PRRS ELISA.pdf
    20260219_2009해림(장현익) 최종 결과 보고서_jb5219_세균 배양.pdf
```

**수정 파일**:

- **`ocr-pipeline/app/parser.py`**
  - 전북대 감지 조건: `'PCR' or 'ELISA'` → **`'jb5219'`** (핵심 식별자로 통일)
    - 기존: `세균 배양`, `항생제내성` 등 PCR/ELISA 없는 검사 미감지
  - 신규 regex 추가: `YYYYMMDD_{코드+농장명}({담당자}) 최종 결과 보고서_jb5219_{검사종류}` 파싱
  - `JBNU_TEST_TYPE_MAP` 추가 (파일명 끝 검사종류 → 항원/혈청/세균 변환):
    - `PRRSV PCR` / `PED PCR` / `자돈소화기 PCR` → 항원
    - `PRRS ELISA` → 혈청
    - `세균 배양` / `세균독소 PCR` / `항생제내성` → 세균
  - 구형 네스트 패턴(`YYYYMMDD_접수번호_PCR_농장명_네스트`) 하위 호환 유지
  - 농장명 추출: `2006대월`, `3001조산` 형태 → `getFarmCode()`에서 DB코드로 자동 변환

- **`lib/mail-pipeline/farm-mapping.ts`**
  - 4자리 숫자 코드 alias 전체 추가 (`'2006'→DB2006`, `'3001'→DB3001` 등)
  - 정상 케이스는 기존 NAME_ALIASES substring 검색으로 처리됨 (엣지케이스 대비)

- **`ocr-pipeline/tests/test_parser.py`**
  - 기존 테스트가 구형 패턴만 검증 → 신규 jb5219 패턴 7케이스 추가
  - `세균 배양`, `자돈소화기 PCR`, `항생제내성`, 담당자 `(.)` 등 엣지케이스 포함

**적용 방법** (기존에 빈값으로 들어간 레코드 재처리):
```bash
# 1. OCR Docker 재실행 (전북대 파일 재파싱)
docker compose -f X:/ocr-pipeline/docker-compose.yml run --rm ocr-pipeline

# 2. DB 덮어쓰기 (--replace)
npx tsx scripts/import-ocr-results.ts --file=X:/ocr-pipeline/output/results.xlsx --replace
```

---

## 주요 수정 (이전)

- **ocr.py**: 전북대 2페이지 PDF → 1장 무시, **2장만** OCR (vetdxlab/jbnu/전북대 파일명)
- **parser.py**: 농장정보, 접수일자(2026년 02월 05일), PRRS 결과(NA)/(EU) 패턴 추가
- **farm-mapping**: 2010문강 → DB2010
- **naver-imap-to-nas.py**: 한글 IMAP 검색 에러 → UNSEEN만 사용, TARGET_SENDER 파싱 후 적용
- **대시보드**: Drive 링크 제거 → GET /api/pdf
- **import-ocr-results.ts**: PDF_BASE_PATH 시 NAS 상대경로 저장, **전북대 A열 파서** 추가 (`--format=single-column`)
- **ocr-full-reparse.py**: 전체 재파싱 (`--replace`, `--dry-run`)
- **ocr Docker**: 출력 `result.xlsx` (단수), import 시 경로 지정 필요

---

## 3월 20일 결과 미반영

**원인**: 파이프라인 기본이 **2026-03-23 이후** PDF만 처리. 3/20은 스킵됨.

**해결**: `--all-dates` 옵션 사용.

```powershell
npm run ocr:pdf-db-pipeline -- --all-dates --dry-run
npm run ocr:pdf-db-pipeline -- --all-dates
```

---

## 조산(DB3001) 점검

- **링크 없음**: OCR import는 pdf_file_id 없음. Drive 원본 수동 연결 시 `scripts/link-josan-pdf.ts` 사용.
- **3/17 미반영**: 해당 PDF가 Drive/NAS에 없던 상태. 메일 수신·업로드 확인 필요.
- 점검: `npm run inspect:josan`
