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
| `IMAP_AUDIT_LOG` | (선택) JSONL 파일 경로. 설정 시 `naver-imap-to-nas.py`가 첨부·EML 저장(및 일부 저장 실패) 시 한 줄씩 append |

### 2.0 `naver-imap-to-nas.py`가 만드는 경로 (Z: 혼동 방지)

이 스크립트는 첨부를 **`SAVE_PATH/<메일 Date 헤더의 YYYY-MM>/`** 아래에만 씁니다. 파일명은 대략 다음 형태입니다.

`{YYYYMMDD}_{제목앞40자}_{발신앞30자}_{원본첨부파일명}.pdf`

- **`Z:\home\...\위생도평가\26\상반기\(혈청) 26-04129 DB3023.pdf`** 처럼, 메일 제목과 무관한 깊은 폴더 구조는 **이 스크립트가 생성하지 않습니다.** (다른 동기화 클라이언트·수동 정리·타 시스템 경로일 수 있음.)
- **OCR·`nas-auto-pipeline.py`** 는 `SAVE_PATH` 루트에서 `os.walk`로 **모든 하위 폴더**의 PDF를 볼 수 있습니다. 따라서 `SAVE_PATH`가 `Z:\home\다비육종\농장`이고 그 아래에 `위생도평가\26\상반기\*.pdf`가 있으면 파이프라인은 해당 파일을 후보로 잡을 수 있습니다. 반대로 **`SAVE_PATH`와 Z: 트리가 완전히 분리**되어 있으면 OCR은 그 PDF를 보지 못합니다.

**저장 여부 확인:** 프로젝트 루트에서 (`.env.local`의 `SAVE_PATH` 사용)

- 접수번호(예: `26-04129`, `26-04130`)·`DB3023`처럼 **부분 문자열**로 찾는다. 메일 원본 첨부명 `(혈청) 26-04129 …` 그대로는 거의 없고, `naver-imap-to-nas.py`가 앞에 `YYYYMMDD_제목_발신_` 접두를 붙인 **다른 파일명**으로만 저장되기 때문이다.
- **한 번에 점검(권장):** `python scripts/verify-savepath-mail-tokens.py` — `26-04129+DB3023` / `26-04130+DB3023` 두 조합을 연속 실행하고, 0건이면 아래 “누락 시”를 안내한다.
- **개별 검색 예:**

```powershell
python scripts/find-pdfs-under-savepath.py --contains 26-04129 --contains DB3023
python scripts/find-pdfs-under-savepath.py --contains 26-04130 --contains DB3023
```

- **접수 `26-04130`은 혈청·항원 PDF가 둘 다 있을 수 있다.** 둘 다 `SAVE_PATH`에 있으면 위 두 번째 검색(또는 `verify` 스크립트의 두 번째 조합)에서 **파일 2개**가 나와야 정상(동일 원본명 충돌 시 `_1` 등이 붙을 수 있음). 한 건만 있으면 메일 한 통만 수신/저장된 경우를 의심.

**메일이 안 내려올 때 / [일치] 0개일 때:** 기본 IMAP은 `UNSEEN`이라 이미 읽음 처리된 메일은 제외됩니다. `python scripts/naver-imap-to-nas.py --all --since=2026-04-21` 로 재시도(필요 시 `--verbose-skip`). `TARGET_SENDER`가 설정돼 있으면 발신 주소에 그 문자열이 **포함**될 때만 저장합니다.

**Z: `위생도평가\…\26-04129 …` 등만 있고 `SAVE_PATH` 밑엔 없을 때:** 위 2.0절. `find-pdfs`·OCR은 **`SAVE_PATH` 루트**에서만 `os.walk`하므로, PDF가 `SAVE_PATH`와 **완전히 다른 트리**에만 있으면 이 검색에 안 잡힌다. Drive·웹에만 있을 수도 있으니 동기 범위를 별도로 본다.

### 2.0a 자동 저장 검증 (감사 로그 + 일별 점검)

- **`IMAP_AUDIT_LOG`** 가 있을 때만 `naver-imap-to-nas.py`가 JSONL에 기록합니다. 성공 시 대략 `ts_iso`, `imap_seq`, `month_folder`, `file_prefix`, `rel_path`, `bytes`, `kind`(`pdf`|`file`|`eml`), `subject_head`, `from_head` 필드가 들어갑니다.
- **일별 점검:** `python scripts/verify-imap-saves-for-day.py --date=2026-04-23`  
  - `SAVE_PATH` 하위 `YYYY-MM` 폴더에서 **파일명이 `20260423_` 로 시작하는지**를 센다(저장 규칙의 `YYYYMMDD`는 **메일 `Date` 헤더** 기준이며, 수신일과 다를 수 있음).  
  - `IMAP_AUDIT_LOG` 가 있으면 같은 `file_prefix`로 감사 줄 수를 집계한다.
- **참고 IMAP 건수:** `python scripts/verify-imap-saves-for-day.py --date=2026-04-23 --imap-compare`  
  - INBOX에 대해 `ON 23-Apr-2026` 형태로 **그 날짜의 메시지 개수**만 본다. **첨부 개수·파일 개수와 1:1이 아님**(다첨부·첨부 없음·EML만·`TARGET_SENDER` 제외 등).
- **자동 실행 아님:** 스크립트는 **수동** 또는 **작업 스케줄러/cron에 직접 등록했을 때만** 돈다. 저장 시·IMAP 수신 시 **기본으로는 호출되지 않는다.**
- **자동화 로드맵(추후):** 일별 점검을 **매일** 돌리는 것은 현재 **배포/파이프라인에 포함되지 않음**. 운영자가 Task Scheduler·cron·NAS 스케줄에 `verify-imap-saves-for-day.py`를 **나중에** 붙이는 전제로, 지금은 **스크립트만** 제공한다.
- **스케줄 예:** 다음날 오전에 “어제”를 `--date=`로 넘기려면 Windows 작업 스케줄러·NAS cron에서 `python …/scripts/verify-imap-saves-for-day.py --date=…` 를 등록(날짜 인자는 운영 환경에서 하루 전으로 치환).

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
| `verify-savepath-mail-tokens.py` | 접수·농장코드 샘플(예: DB3023 `26-04129`/`26-04130`) 일괄 검색 + 누락 시 안내 |
| `verify-imap-saves-for-day.py` | `--date=YYYY-MM-DD` 기준 `YYYYMMDD_` prefix 파일·옵션 감사 로그·`--imap-compare` |
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
