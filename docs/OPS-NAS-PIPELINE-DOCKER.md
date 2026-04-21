# NAS 파이프라인 (Docker 상시 실행) — 5분마다 메일→OCR→DB

## 목표

- NAS(또는 상시 호스트)에서 **Docker만으로** `scripts/nas-auto-pipeline.py`를 계속 실행
- **5분마다** 네이버 메일 확인 → NAS 저장 → OCR 실행 → `results.xlsx` 생성 → DB import

> 핵심: “NAS가 켜져 있다”만으로는 자동이 되지 않습니다.  
> **컨테이너(또는 스케줄러)가 명령을 주기적으로 실행**해야 자동이 됩니다.

---

## 1) 최초 1회: 2026-03-25 이후 메일 일괄 가져오기 (읽음/안읽음 무관)

레포 루트에서:

```bash
python scripts/naver-nas-compare-download.py --since=2026-03-25
python scripts/naver-vetdxlab-download.py --since=2026-03-25
python scripts/nas-auto-pipeline.py --since=2026-03-25 --skip-imap --replace
```

- **`naver-nas-compare-download.py`**: IMAP `ALL` 기반이라, 중간에 메일을 읽었어도 기간 전체를 대상으로 누락분을 받습니다.
- **`nas-auto-pipeline.py --since=...`**: OCR input으로 복사할 PDF 범위를 날짜로 제한합니다.

---

## 2) 상시 운영: 4/9 16:00 이후 메일을 5분마다 확인하고 자동 OCR

### A안(권장): `docker-compose.nas-pipeline.yml`로 상시 컨테이너 실행

```bash
docker compose -f docker-compose.nas-pipeline.yml down
docker compose -f docker-compose.nas-pipeline.yml up -d
```

중지:

```bash
docker compose -f docker-compose.nas-pipeline.yml down
```

### 동작 확인(필수)

```bash
docker compose -f docker-compose.nas-pipeline.yml ps
docker logs -f nas-pipeline
```

로그에서 `tick`이 5분마다 반복되고, `OCR_CMD`가 실행되는지 확인합니다.

> NAS 컨테이너는 Alpine 기반일 수 있어 `playwright` 설치가 실패합니다.  
> 그래서 `docker-compose.nas-pipeline.yml`은 `requirements.nas.txt`(playwright 제외)를 사용합니다.

또한 `docker compose`는 YAML 내 `${VAR}`를 **호스트에서 먼저 치환**할 수 있어,  
컨테이너 환경변수 `PIPELINE_SINCE`를 쓰려면 커맨드에서 `$$PIPELINE_SINCE` 형태로 이스케이프합니다.

### 날짜 기준

`docker-compose.nas-pipeline.yml`의 실행 커맨드에 있는:

- `python scripts/nas-auto-pipeline.py --since=2026-04-09`

을 원하는 기준으로 바꿀 수 있습니다.

> “4/9 16:00 이후”를 완전히 정확히 자르고 싶으면 IMAP 시간(시각) 기반 검색을 추가로 구현해야 합니다.  
> 운영상은 **4/9에 스케줄/컨테이너를 16:00에 켠다**로 충분히 일치합니다.

---

## 3) 주의

- `scripts/nas-auto-pipeline.py`에는 **중복 실행 방지(lock)** 가 들어가 있어, 5분 주기에서 겹쳐 실행되는 사고를 막습니다.
- NAS용 환경변수는 `env.nas`(또는 `docs/env.nas.example`)를 기준으로 분리하는 것을 권장합니다.

