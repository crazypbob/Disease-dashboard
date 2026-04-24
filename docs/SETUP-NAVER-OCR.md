# 네이버 메일·OCR 설정

> 네이버 IMAP → NAS 저장, OCR Docker, 자동 감시.

---

## 1. 네이버 IMAP 사전 준비

1. **IMAP 활성화**: 네이버 메일 → 환경설정 → POP3/IMAP → IMAP 사용함
2. **앱 비밀번호** (2단계 인증 시): 네이버 계정 → 보안설정 → 2단계 인증 → 앱 비밀번호 생성

---

## 2. 환경변수 (.env.local)

| 변수 | 용도 |
|------|------|
| `NAVER_EMAIL` | 네이버 메일 주소 |
| `NAVER_APP_PASSWORD` | 앱 비밀번호 |
| `SAVE_PATH` | PDF 저장 경로 (기본: ocr-pipeline/input/검사결과_PDF) |
| `PDF_BASE_PATH` | 결과지 PDF 경로 (대시보드 클릭 시, SAVE_PATH와 동일) |
| `OCR_INPUT_PATH` | OCR 입력 (기본: ocr-pipeline/input) |
| `OCR_OUTPUT_PATH` | OCR 결과 (ocr-pipeline/output) |
| `OCR_CMD` | `docker compose -f ocr-pipeline/docker-compose.yml run --rm ocr-pipeline` |
| `OCR_WORK_DIR` | ocr-pipeline 경로 |
| `DASHBOARD_DIR` | disease-dashboard 프로젝트 경로 |
| `TARGET_SENDER` | 발신자 필터 (쉼표 구분, 비우면 전체) |

### 2.0 `naver-imap-to-nas.py`가 만드는 경로 (Z: 혼동 방지)

이 스크립트는 첨부를 **`SAVE_PATH/<메일 Date 헤더의 YYYY-MM>/`** 아래에만 씁니다. 파일명은 대략 다음 형태입니다.

`{YYYYMMDD}_{제목앞40자}_{발신앞30자}_{원본첨부파일명}.pdf`

- **`Z:\home\...\위생도평가\26\상반기\(혈청) 26-04129 DB3023.pdf`** 처럼, 메일 제목과 무관한 깊은 폴더 구조는 **이 스크립트가 생성하지 않습니다.** (다른 동기화 클라이언트·수동 정리·타 시스템 경로일 수 있음.)
- **OCR·`nas-auto-pipeline.py`** 는 `SAVE_PATH` 루트에서 `os.walk`로 **모든 하위 폴더**의 PDF를 볼 수 있습니다. 따라서 `SAVE_PATH`가 `Z:\home\다비육종\농장`이고 그 아래에 `위생도평가\26\상반기\*.pdf`가 있으면 파이프라인은 해당 파일을 후보로 잡을 수 있습니다. 반대로 **`SAVE_PATH`와 Z: 트리가 완전히 분리**되어 있으면 OCR은 그 PDF를 보지 못합니다.

**저장 여부 확인:** 프로젝트 루트에서 (`.env.local`의 `SAVE_PATH` 사용)

```powershell
python scripts/find-pdfs-under-savepath.py --contains 26-04129 --contains DB3023
```

**메일이 안 내려올 때:** 기본 검색은 `UNSEEN`이라 이미 읽음 처리된 메일은 제외됩니다. `python scripts/naver-imap-to-nas.py --all` 또는 `--since=2026-04-21` 로 재시도. `TARGET_SENDER`가 설정돼 있으면 발신 주소에 그 문자열이 **포함**될 때만 저장합니다. 스킵 이유를 보려면 `--verbose-skip` 을 붙입니다.

---

## 2.1 PC/NAS 환경 분리 (중요)

PC 여러 대를 오가고, OCR Docker는 NAS에서 실행되는 구조라면 **PC용과 NAS용 환경변수를 분리**해야 합니다.

- **PC용 (`.env.local`)**: `OCR_INPUT_PATH`, `OCR_OUTPUT_PATH`를 프로젝트 로컬 `ocr-pipeline/input|output`으로 통일  
  (PC에서 NAS docker 볼륨 경로 `X:/docker/...`를 가리키면, 스크립트가 그쪽에 PDF를 계속 복사할 수 있음)
- **NAS용 (예시)**: `docs/env.nas.example` 참고  
  NAS 내부 경로(`/volume1/...`) 기준으로 `OCR_CMD`, `OCR_WORK_DIR`, `DASHBOARD_DIR` 설정

---

## 3. 스크립트

| 스크립트 | 용도 |
|----------|------|
| `naver-imap-to-nas.py` | 네이버 IMAP 첨부 → SAVE_PATH 저장 |
| `find-pdfs-under-savepath.py` | `SAVE_PATH` 이하 PDF 파일명 토큰 검색 (접수번호·DB코드 등) |
| `naver-vetdxlab-download.py` | 전북대 vetdxlab 링크 PDF 다운로드 |
| `naver-nas-compare-download.py` | 네이버 vs NAS 비교, 누락분만 |
| `naver-watch.py` | 1~2분마다 IMAP 자동 실행 (루프) |
| `nas-auto-pipeline.py` | 메일→OCR→DB 전체 파이프라인 |

---

## 4. OCR Docker

### docker-compose volumes

```yaml
volumes:
  - ./input:/app/input        # PDF 입력
  - ./output:/app/output      # 결과
```

- **출력**: `result.xlsx` 또는 `results.xlsx` — import 시 경로 지정 필요
- **위치**: `X:/ocr-pipeline/` (또는 NAS `/volume1/docker/ocr-pipeline`)

### 경로 매핑

| 구분 | Docker | 파이프라인 env |
|------|--------|----------------|
| 입력 | ./input | `OCR_INPUT_PATH` |
| 출력 | ./output | `OCR_OUTPUT_PATH` |

Windows에서 Docker 없으면 NAS Docker UI로 수동 실행.

---

## 5. 전북대 vetdxlab A열 파싱

전북대 PDF OCR 결과가 **A열에 모든 내용**일 때:

```powershell
npx tsx scripts/import-ocr-results.ts --file=X:/ocr-pipeline/output/result.xlsx --format=single-column
```

자동 감지: A열에만 긴 텍스트, 나머지 비어 있으면 단일 컬럼 모드 사용.

---

## 6. 자동 감시 (선택)

### naver-watch.py (90초마다)

```powershell
python scripts/naver-watch.py
python scripts/naver-watch.py --interval 60   # 1분마다
```

### Windows 작업 스케줄러

1분마다 `naver-imap-to-nas.py` 실행. (Win + R → `taskschd.msc`)

### NAS 작업 스케줄러

5~10분마다 `naver-imap-to-nas.py` 또는 `nas-auto-pipeline.py` 실행.

### n8n (Docker)

Docker n8n → Schedule Trigger → Execute Command. 상세는 `PIPELINE.md` 참조.

---

## 7. 3/23 이전 PDF 포함

기본은 2026-03-23 이후만 처리. 3/20 등 이전 포함 시:

```powershell
npm run ocr:pdf-db-pipeline -- --all-dates
python scripts/nas-auto-pipeline.py --skip-imap --all-dates
```
