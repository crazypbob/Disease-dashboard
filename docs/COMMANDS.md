# 명령어 모음

> 입력 가능한 모든 명령어를 한 곳에 모았습니다.

> **매일·운영에서 쓰는 명령은 `../최신명령어.md`가 단일 출처**입니다.  
> 이 문서는 **전체 목록·레거시·드물게 쓰는 명령** 보조용입니다.

> **대량 `results.xlsx` → DB 반영**은 관리자 API가 아니라 **호스트에서 `import-ocr-results` 직접 실행**이 표준입니다. 상세: `IMPORT-RUNBOOK.md`.

> **상시 자동화(메일→OCR→DB)**: `OPS-AUTOMATION.md` — `nas-auto-pipeline.py` 스케줄 등록(§5).

---

## 1. 개발·실행

```bash
npm run dev              # 개발 서버 (포트 3005)
npm run build            # 빌드
npm run start            # 프로덕션 실행
```

---

## 2. NAS 파이프라인 (자주 쓰는 것)

> 운영 시에는 `../최신명령어.md`에 있는 명령을 그대로 사용하세요.

### 누락 PDF 다운로드 (네이버 → NAS)

```bash
# 시뮬레이션: 누락 개수만 확인
npm run naver:compare-download -- --dry-run

# 실제 다운로드
npm run naver:compare-download

# 전북대 vetdxlab 링크 PDF (메일 첨부 없이 링크만 있는 경우)
npm run naver:vetdxlab-download -- --dry-run
npm run naver:vetdxlab-download
# 신규 메일만 (파이프라인에서 자동 실행)
npm run naver:vetdxlab-download -- --unseen

# 3/20 성진·관인·남도·조산 등이 안 잡힐 때
# - TARGET_SENDER 비우기 또는 jbnu.ac.kr 포함
# - 기존 폴더 매칭 오류 시: --no-existing-check 로 강제 다운로드
python scripts/naver-nas-compare-download.py --no-existing-check --dry-run
python scripts/naver-nas-compare-download.py --no-existing-check
```

### 전체 자동 파이프라인 (메일 → OCR → DB)

```bash
# 1회 실행 (환경변수 필요: SAVE_PATH, OCR_*, DASHBOARD_DIR, PDF_BASE_PATH, NAVER_*)
# 1a. 전북대 vetdxlab 링크 PDF (신규 메일) → 1b. 첨부 저장 → 2. OCR input 복사 → 3. OCR → 4. DB
npm run naver:pipeline

# 옵션
npm run naver:pipeline -- --dry-run     # 시뮬레이션만
npm run naver:pipeline -- --skip-imap   # 네이버 다운로드 스킵 (vetdxlab + 첨부)
npm run naver:pipeline -- --skip-ocr    # OCR 실행 스킵
npm run naver:pipeline -- --ocr-input-only  # 복사 생략, input 폴더 PDF만 OCR (이전 OCR 실패 후 재시도)
```

### OCR 결과 → DB 반영

```bash
# 기본(권장): results.xlsx → DB — ../최신명령어.md 및 IMPORT-RUNBOOK.md 참조
npm run import:ocr -- --file=ocr-pipeline/output/results.xlsx --replace
```

PowerShell에서 `npx`가 막히면 `npm run` 또는 `IMPORT-RUNBOOK.md` / `WINDOWS-EXECUTIONPOLICY.md` 참고.

#### (레거시/주의) 전북대 A열 형식

- **언제 쓰나**: 엑셀의 모든 내용이 A열 1칸에만 들어간 구형 포맷
- **주의**: 현재 운영 `results.xlsx`(멀티컬럼)에는 보통 필요 없음

```bash
npm run import:ocr -- --file=ocr-pipeline/output/results.xlsx --format=single-column --replace
```

### 전북대 PDF 일괄 OCR (vetdxlab 다운로드 후)

```bash
# 환경변수 설정 후 (SAVE_PATH, OCR_* 등 — docs/OCR-SETUP-VERIFY.md 참고)
npm run ocr:batch-jbnu

# dry-run으로 복사 예정 파일만 확인
npm run ocr:batch-jbnu -- --dry-run
```

### PDF↔DB 비교 기반 OCR 파이프라인 (권장)

DB에 없는 PDF만 골라 OCR → import → input 비우기 → results.xlsx 복사.

```bash
npm run ocr:pdf-db-pipeline
npm run ocr:pdf-db-pipeline -- --dry-run
npm run ocr:pdf-db-pipeline -- --all-dates   # 3/23 이전 포함
```

---

## 3. DB·데이터

```bash
npm run db:init          # DB 초기화
npm run db:reset-test    # 테스트 데이터 초기화
npm run import:sheet     # 검사결과DB.csv → DB
npm run import:farms     # 농장주소록 Excel → DB
```

---

## 4. 점검·검증

```bash
npm run verify:parsing       # 터미널에 레코드+링크 출력
npm run verify:matrix-report # scripts/verify-matrix.html 생성 (매트릭스 검증)
npm run inspect:josan        # 조산(DB3001) DB·링크 점검
npm run inspect:ocr-excel    # results.xlsx 구조 점검 (전북대 디버깅)
```

---

## 5. 수정용 (1회성)

```bash
npm run fix:duplicate-pdf   # 중복 pdf_file_id NULL 처리
npm run fix:farm-codes      # farm_code 정규화
npm run fix:march4-farm     # 3/4 성진→다비연구소 수정
```

---

## 6. Python 스크립트 (직접 실행)

```bash
# 네이버 메일 → NAS (IMAP)
python scripts/naver-imap-to-nas.py

# 네이버 vs NAS 비교·누락 다운로드
python scripts/naver-nas-compare-download.py
python scripts/naver-nas-compare-download.py --dry-run

# 전북대 메일 본문 vetdxlab.com 링크 PDF 다운로드 ([최종결과][중간결과] 제외)
python scripts/naver-vetdxlab-download.py
python scripts/naver-vetdxlab-download.py --dry-run
python scripts/naver-vetdxlab-download.py --unseen   # 신규 메일만 (파이프라인용)

# 자동 파이프라인 (메일→OCR→DB)
python scripts/nas-auto-pipeline.py
python scripts/nas-auto-pipeline.py --dry-run
python scripts/nas-auto-pipeline.py --skip-imap --skip-ocr

# 1~2분마다 메일 감시 (백그라운드 루프)
python scripts/naver-watch.py
python scripts/naver-watch.py --interval 60
```

---

## 7. 기타 (참고)

```bash
npm run import:ocr -- --file=경로 --dry-run   # 미리보기
npm run import:ocr -- --file=경로 --replace    # 덮어쓰기
npm run verify:matrix-report                  # verify-matrix.html 생성
```

---

## 8. 환경변수 요약 (필수)

**매번 입력할 필요 없음**: `.env.local`에 넣어두면 Python·Node 스크립트가 자동 로드함.
형식은 `KEY=value` (PowerShell `$env:KEY` 아님).

| 변수 | 용도 |
|------|------|
| `NAVER_EMAIL` | 네이버 메일 주소 |
| `NAVER_APP_PASSWORD` | 네이버 앱 비밀번호 (2단계 인증) |
| `SAVE_PATH` | PDF 저장 경로 (기본: X:/질병메일링_대시보드/검사결과_PDF) |
| `PDF_BASE_PATH` | 결과지 PDF 경로 (대시보드 클릭 시, SAVE_PATH와 동일) |
| `OCR_INPUT_PATH` | OCR 입력 폴더 |
| `OCR_OUTPUT_PATH` | OCR 출력 폴더 |
| `OCR_CMD` | OCR 실행 명령 (Docker 등) |
| `OCR_WORK_DIR` | OCR 실행 디렉터리 |
| `DASHBOARD_DIR` | disease-dashboard 프로젝트 경로 |

**.env.local 예시** (프로젝트 루트에 저장):

```
NAVER_EMAIL=your@naver.com
NAVER_APP_PASSWORD=xxxx xxxx xxxx xxxx
SAVE_PATH=X:/질병메일링_대시보드/검사결과_PDF
PDF_BASE_PATH=X:/질병메일링_대시보드/검사결과_PDF
OCR_INPUT_PATH=X:/ocr-pipeline/input
OCR_OUTPUT_PATH=X:/ocr-pipeline/output
OCR_CMD=docker compose -f X:/ocr-pipeline/docker-compose.yml run --rm ocr-pipeline
OCR_WORK_DIR=X:/ocr-pipeline
DASHBOARD_DIR=X:/질병메일링_대시보드/disease-dashboard
```

PowerShell에서 일회 설정 (현재 세션만):

```powershell
$env:NAVER_EMAIL="your@naver.com"
$env:SAVE_PATH="X:/질병메일링_대시보드/검사결과_PDF"
# ...
```

---

## 9. 자동화·스케줄 (참고)

운영에서 **메일→OCR→DB**를 상시 돌리는 절차는 `OPS-AUTOMATION.md`(스케줄 예: §5), 파이프라인 개요는 `PIPELINE.md`, 네이버·Docker 설정은 `SETUP-NAVER-OCR.md`를 봅니다. 할 일 목록은 `TODO.md`.
