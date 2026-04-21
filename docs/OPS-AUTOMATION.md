# 운영 자동화 (NAS 상시 운영) — 권장안

## 결론(권장 운영 단위)

**NAS(또는 상시 호스트)에서 `scripts/nas-auto-pipeline.py`를 “주기 실행”하는 방식**을 기본 운영으로 권장합니다.

- **이유**: 메일→OCR→DB를 한 번에 묶어서 실행하므로, “파일 감지/단계 분리”보다 운영이 단순하고 장애 원인 분리가 쉽습니다.
- **권장 주기**: 5분 (메일 도착이 몰리는 시간대만 1~2분으로 줄여도 됨)

---

## 1) 실행 주체

둘 중 하나로 고정하세요.

- **A. NAS에서 실행(권장)**: NAS에 Docker/스케줄러가 가능하고, 레포가 NAS 내부 경로에 있음
- **B. 상시 PC/미니PC에서 실행**: NAS는 파일 공유만, 실행은 상시 PC에서 담당

---

## 2) 환경변수 분리(필수)

- **PC용**: 프로젝트 루트 `.env.local`
- **NAS용**: NAS 내부 경로 기준 env 파일(예: `docs/env.nas.example`를 복사해 사용)

중요 포인트:

- **NAS에서 OCR Docker를 돌릴 거면** `OCR_CMD`, `OCR_WORK_DIR`, `OCR_INPUT_PATH`, `OCR_OUTPUT_PATH`는 **NAS 내부 경로**여야 합니다.
- **PC에서 NAS Docker 볼륨 경로를 `OCR_INPUT_PATH`로 쓰지 않기** (실수로 NAS의 OCR input에 계속 복사되는 사고 방지)

---

## 3) 운영 스케줄(최소 구성)

### 방식 1: “주기 실행”(권장)

NAS 작업 스케줄러 / crontab / n8n 스케줄 트리거 중 아무거나로 아래를 실행합니다.

```bash
python3 scripts/nas-auto-pipeline.py
```

옵션:

- 누락분(3/23 이전 포함)까지 한 번에 재처리할 때만:

```bash
python3 scripts/nas-auto-pipeline.py --skip-imap --all-dates
```

### 방식 2: “메일 감시” + 별도 OCR/Import

메일만 초단위로 당겨야 할 때(테스트/임시 운영)에만 사용합니다.

```bash
python3 scripts/naver-watch.py --interval 60
```

이 방식은 OCR/DB import까지 이어지지 않으므로, 결국 OCR/Import 스케줄이 별도로 필요합니다.

---

## 4) 장애/운영 포인트

- **신규 PDF가 없으면 자동으로 OCR/Import를 스킵**하도록 파이프라인이 구현되어 있음 (`nas-auto-pipeline.py`).
- **OCR 결과 파일명**은 `results.xlsx` 또는 `result.xlsx`가 섞일 수 있어 import 단계에서 둘 다 탐색함.
- **관리자 API import는 타임아웃(120초) 이슈**가 있어, 대량 처리 시에는 “호스트에서 스크립트 직접 실행”을 표준으로 둡니다. 상세: `IMPORT-RUNBOOK.md`.

---

## 5) 스케줄러에 등록하는 방법 (운영 고정)

아래 중 **환경에 맞는 하나**로 고정하면 됩니다. 공통 전제:

- **작업 디렉터리**: 레포 루트 (`disease-dashboard`). `DASHBOARD_DIR`·`.env`·`python3 scripts/nas-auto-pipeline.py`가 이 경로 기준으로 동작해야 함.
- **주기**: 5분마다(기본). 메일이 몰리는 시간대만 `*/2` 또는 2분 간격 Task로 줄여도 됨.

### A. Linux / NAS crontab

```cron
*/5 * * * * cd /volume1/docker/질병메일링_대시보드/disease-dashboard && /usr/bin/python3 scripts/nas-auto-pipeline.py >> /var/log/nas-auto-pipeline.log 2>&1
```

경로·`python3` 위치는 장비에 맞게 수정합니다.

### B. Synology DSM 등 — “사용자 정의 스크립트”

- **실행 명령**: 위와 동일하게 `cd ... && python3 scripts/nas-auto-pipeline.py`
- 또는 스크립트 파일 하나로 감싼 뒤 그 파일만 스케줄 등록 (로그는 DSM 작업 로그 또는 `>>` 리다이렉트)

### C. Windows 작업 스케줄러

| 필드 | 예시 값 |
|------|---------|
| 프로그램 | `python` 또는 `py` (PATH에 있는 실행 파일) |
| 인수 추가 | `scripts\nas-auto-pipeline.py` |
| 시작 위치(작업 폴더) | `X:\질병메일링_대시보드\disease-dashboard` |

트리거: “매일”, “5분마다 반복” 등으로 설정.

### D. (선택) n8n / Ugreen NAS 작업 스케줄러

- **트리거**: 5분 주기(또는 Cron 표현식 `*/5 * * * *`)
- **액션**: 위와 동일한 한 줄 셸 실행, 또는 HTTP로 상시 호스트의 웹훅만 쓰는 방식(별도 구현 시)

`docs/TODO.md`에 있던 “input 폴더 감지만”은 **대안**이며, 운영 단순화를 위해 **본 절의 주기 실행을 먼저** 쓰는 것을 권장합니다. 파일 감지형은 필요 시 watcher·별도 스텝으로 추가하면 됩니다.

