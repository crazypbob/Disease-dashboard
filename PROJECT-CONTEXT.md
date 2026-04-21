# 프로젝트 컨텍스트 — 작업 시작 시 **가장 먼저 읽을 파일**

이 파일은 AI 에이전트가 작업을 이어갈 때 전체 맥락을 파악하기 위한 문서입니다.  
`00-READ-ME-FIRST.md` 다음으로 이 파일을 읽어주세요.

---

## 1. 프로젝트 개요

| 항목 | 내용 |
|------|------|
| **프로젝트명** | 질병메일링 대시보드 (Disease Mailing Dashboard) |
| **스택** | Next.js 16.2, NextAuth v4, Neon PostgreSQL, Vercel |
| **목적** | 검사결과 PDF 파싱 → 대시보드 매트릭스 표시 (기존 GAS 대체) |
| **현황·특허 요약** | `docs/ROADMAP-PATENT-STATUS.md` |

### 웹 호스팅·운영 아키텍처 (프로젝트 채택)

- **웹앱**: Next.js + Neon PostgreSQL → **클라우드(예: Vercel)** 에 배포하는 것을 기본으로 한다.
- **메일 수집·PDF 저장·Docker OCR·import**: **웹앱과 같은 호스트에 두지 않는다.** NAS 또는 Docker·스케줄이 가능한 VPS 등 **별도 실행 환경**에서 돌린다. 공유 웹호스팅(Docker 불가)만으로는 현재 OCR 스택을 그대로 이전하기 어렵다.
- **대안**(단일 VPS 풀스택, OCR만 클라우드 워커)과 **배포 전 체크리스트**: `docs/DEPLOYMENT-HOSTING.md`.

---

## 2. 파이프라인 (현재 vs 목표)

### 현재 (Google Drive 중심)

```
네이버 메일 → Gmail 전달 → Drive 업로드 → (수동) NAS OCR → results.xlsx → (수동) DB import → 매트릭스
```

### 목표 (X: 드라이브 / NAS 중심)

```
네이버 메일 (IMAP) → NAS 저장 → OCR 자동 → results.xlsx → DB 자동 import → 매트릭스 실시간
```

→ 상세: `docs/PIPELINE.md`

---

## 3. 폴더 구조

### 프로젝트 (이동 후 X: 드라이브 기준)

```
X:/.../disease-dashboard/
├── 00-READ-ME-FIRST.md    ← 가장 먼저 읽기
├── PROJECT-CONTEXT.md     ← 이 파일
├── AGENTS.md, CLAUDE.md
├── app/
├── components/
├── lib/
├── public/data/farm-locations.json   # 지도 다비 마커 (농장주소록 xlsx에서 생성)
├── public/data/national-pig-farms.json   # 전국 돼지농장(행안부) — 축산일련번호·WGS84·시도만 (`npm run map:build-national`)
├── scripts/
│   ├── naver-imap-to-nas.py   # 네이버 → NAS
│   ├── import-ocr-results.ts  # results.xlsx → DB
│   ├── build-farm-locations-from-xlsx.ts  # 농장주소록 xlsx → public/data/farm-locations.json (`npm run map:build-locations`)
│   ├── build-national-pig-farms-from-xlsx.ts  # 전국돼지농장_행안부기준.xlsx → national-pig-farms.json (EPSG:5179→WGS84)
│   ├── inspect-national-pig-farms-xlsx.ts  # 행안부 엑셀 시트·헤더 확인 (`npm run inspect:national-xlsx`)
│   ├── drive-download-for-ocr.ts
│   ├── bulk-naver-to-drive.ts
│   └── ...
└── docs/
```

### NAS / X: 드라이브 (목표)

```
X:/
├── 질병검사결과/메일저장/{년}년/{월}월/*.pdf
├── ocr-pipeline/input/   # PDF 입력
├── ocr-pipeline/output/  # results.xlsx
└── disease-dashboard/
```

---

## 4. 완료된 작업

| 항목 | 상태 |
|------|------|
| DB 스키마 (Neon) | ✅ farms, test_records, parsed_files |
| NextAuth + Google 로그인 | ✅ ALLOWED_EMAILS 화이트리스트 |
| 대시보드 레이아웃 | ✅ 농장 사이드바, 등록/고객농장 탭 |
| **농장 다중 선택** | ✅ 버튼식, 직영만 보기, URL ?farm=DB1001,DB1002 |
| **매트릭스 그룹 +/-** | ✅ 직영·협력 등 펼치기/접기 |
| **지도 탭** | ✅ Leaflet(OSM), 다비 `farm-locations.json` + 행안부 `national-pig-farms.json`, 역할 데모; **배포 UI는 주소·농장명 미표시**(다비 팝업은 DB코드 중심, 전국은 축산일련번호·시도만); 지도 탭 시 좌측 농장 사이드바 숨김; **빌드·표시 시 동일 좌표 dedupe**; 정부는 다비/행안부 점 기준·반경·목록·CSV; 공수의는 경기/충청 **주소+행안부 `sido`** 필터; 농장주는 기준 농장+반경 **클립** |
| GET /api/records | ✅ farm(단일/다중), dateFrom, dateTo, diseases |
| POST /api/ingest | ✅ GAS/파이프라인, INGEST_SECRET |
| 매트릭스 | ✅ PRRS Ag/Ab 병합, 질병 필터, PDF 링크 |
| import-ocr-results | ✅ NAS OCR results.xlsx → DB |
| **PRRS 항체 파싱·운영** | ✅ 임계값·가짓값 필터·재import 절차 — [`docs/PRRS-ANTIBODY-PARSING-AND-OPS.md`](docs/PRRS-ANTIBODY-PARSING-AND-OPS.md) |
| **전북대 파서 수정** | ✅ jb5219 신규 패턴 regex, JBNU_TEST_TYPE_MAP, 세균 배양/항생제내성 감지 (2026-03-25) |
| naver-imap-to-nas.py | ✅ 네이버 IMAP → NAS 첨부 저장 |
| 날짜 범위 필터 | ✅ 1개월/3개월/6개월/1년/15개월 |
| 양성만 표기 | ✅ 양성 결과가 있는 농장만 |
| bulk-naver-to-drive | ✅ Gmail → Drive 일괄 |
| drive-download-for-ocr | ✅ Drive → NAS input |

---

## 5. 미완료 / 다음 작업

| 항목 | 설명 |
|------|------|
| **NAS 자동화** | `scripts/nas-auto-pipeline.py`를 **스케줄러에 등록**해 메일→OCR→DB를 주기 실행(권장 5분). 절차: `docs/OPS-AUTOMATION.md` §5. (선택) input만 감시하는 방식은 `docs/TODO.md` 참고. |
| **X: 드라이브 이전** | 폴더 이동, 경로 갱신, 실시간 파이프라인 구축 |

---

## 6. 주요 파일 경로

| 역할 | 경로 |
|------|------|
| 인증 | `lib/auth.ts` |
| 대시보드 | `app/dashboard/page.tsx`, `components/DashboardPageClient.tsx`(지도 탭 시 사이드바 토글) |
| 농장 사이드바 | `components/FarmSidebar.tsx` |
| 매트릭스 | `components/RecordsMatrix.tsx` |
| 농장/매트릭스 로직 | `lib/farms.ts`, `lib/matrix.ts` |
| 질병 필터 | `lib/disease-filter.ts` |
| 지도 탭 | `components/FarmMapPanel.tsx`, `lib/map-region.ts`, `lib/map-nearby.ts`, `lib/map-mock-nearby.ts` |
| Gmail 파이프라인 | `lib/mail-pipeline/run.ts` |
| Drive 파싱 | `lib/run-parse-drive.ts` |
| Records API | `app/api/records/route.ts` |
| Ingest API | `app/api/ingest/route.ts` |
| Cron Gmail | `app/api/cron/check-gmail/route.ts` |

---

## 7. 스크립트·npm 명령

| 명령 | 용도 |
|------|------|
| `npm run dev` | 개발 서버 (3005) |
| `npm run dev:3006` | 개발 서버 (3006, 3005 점유 시) |
| `npm run db:init` | DB 초기화 |
| `npm run import:ocr` | results.xlsx → DB |
| `npm run bulk:naver-drive` | Gmail → Drive 일괄 |
| `npm run drive:download-ocr` | Drive → NAS input |
| `npm run batch:existing` | 기존 파일 1단계 + 안내 |
| `npm run import:sheet` | 검사결과DB.csv → DB |
| `npm run verify:matrix-report` | 매트릭스 검증 HTML |
| `npm run verify:parsing` | 터미널 검증 리스트 |
| `npm run verify:prrs-elisa` | PRRS ELISA DB vs `PRRS_항체` 엑셀 대조 — [`docs/PRRS-ANTIBODY-PARSING-AND-OPS.md`](docs/PRRS-ANTIBODY-PARSING-AND-OPS.md) |
| `npm run inspect:josan` | 조산 점검 |
| `npm run map:build-locations` | 기본 `농장주소록_좌표추가.xlsx` — 엑셀 위·경도(WGS84) 우선, 빈 행만 Nominatim + fallback |
| `npm run map:build-locations:legacy-scale` | 구 `농장주소록-규모(250401 기준).xlsx` 로 빌드 |
| `npm run map:build-locations:demo` | 지오코딩 생략(`--skip-geocode`) — 빠른 확인용, **지도상 뭉침 큼** |
| `npm run map:build-national` | `전국돼지농장_행안부기준.xlsx`(루트) → `public/data/national-pig-farms.json` |
| `npm run inspect:national-xlsx` | 행안부 전국 엑셀 시트·컬럼 확인 |
| `python3 scripts/naver-imap-to-nas.py` | 네이버 → NAS |

---

## 8. 환경 변수

| 변수 | 용도 |
|------|------|
| `DATABASE_URL` | Neon PostgreSQL |
| `AUTH_SECRET`, `NEXTAUTH_URL` | NextAuth |
| `ALLOWED_EMAILS`, `ADMIN_EMAILS` | 로그인·관리자 |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` | Gmail/Drive |
| `INGEST_SECRET`, `CRON_SECRET` | API 인증 |
| `OCR_INPUT_PATH` | NAS OCR input (예: X:/ocr-pipeline/input) |
| `NAVER_EMAIL`, `NAVER_APP_PASSWORD` | naver-imap-to-nas.py |
| `PDF_BASE_PATH`, `SAVE_PATH` | NAS 결과지 PDF 경로 (대시보드 클릭 시 /api/pdf가 여기서 파일 읽음) |

---

## 9. 지도·개인정보(배포본)

- **`farm-locations.json`**: 빌드 파이프라인·레포에는 주소 필드가 있을 수 있으나, **지도 탭 UI에서는 주소·농장명을 노출하지 않음**(공수의 권역 필터 등은 브라우저 내 문자열 매칭에만 사용). 빌드 스크립트에서 **동일 농장코드·좌표** 중복 행을 제거하고, 클라이언트에서도 지도용 목록을 한 번 더 dedupe함.
- **`national-pig-farms.json`**: 엑셀의 사업장명·지번·도로명 등은 **JSON에 넣지 않음**. 클라이언트에는 **축산일련번호**, **WGS84 좌표**, 선택 **시도(1단어)** 만 포함. 좌표는 출처가 EPSG:5179(Korea 2000 / Central Belt)로 가정해 빌드 시 변환(`scripts/build-national-pig-farms-from-xlsx.ts`).

---

## 10. 문서 인덱스

- **`docs/00-DOCS-INDEX.md`** — 전체 문서 읽기 순서
- **`docs/PIPELINE.md`** — 파이프라인 흐름
- **`docs/COMMANDS.md`** — 명령어 전체
- **`docs/SETUP-NAVER-OCR.md`** — 네이버 IMAP·OCR Docker 설정
- **`docs/OCR-PARSER-LAB-BUNDLING.md`** — 도드람·옵티팜·전북대별 PDF 묶음(합본/분리)과 파서 매핑
- **`docs/TODO.md`** — 현재 상태·할 일
- **`docs/CHANGELOG.md`** — 변경 요약
- **`docs/DEPLOYMENT-HOSTING.md`** — 웹 호스팅·OCR 실행 위치·배포 체크리스트

---

*마지막 업데이트: 2026-04-10*
