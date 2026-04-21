# 현재 상태·할 일

**합의 기록(운영·지도·RBAC·다음 매트릭스 작업·특허 캡처)**: [`BACKLOG-ALIGNMENT.md`](BACKLOG-ALIGNMENT.md) (2026-04-05).

---

## 운영에서 먼저 할 일 (우선순위 요약, 2026-04-05)

| 순서 | 작업 | 내용 | 참고 |
|------|------|------|------|
| 1 | **주기 실행으로 파이프라인 고정** | `python3 scripts/nas-auto-pipeline.py`를 NAS/상시 PC **스케줄러에 등록**(예: 5분마다) | `docs/OPS-AUTOMATION.md` §5 |
| 2 | **(선택) 더 촘촘한 메일 수집** | 바쁜 시간대만 스케줄을 1~2분으로, 또는 n8n/UGreen 작업으로 동일 스크립트 실행 | 위와 동일 |
| 3 | **(선택) 파일 감지형** | input에 PDF가 생길 때만 OCR 등 — 파이프라인을 단계별로 나눌 때 | `docs/TODO.md` §2 P1 체크리스트 |

---

## 1. 이미 된 것 (요약)

파이프라인(NAS·OCR·import), 매트릭스(사이드바·필터·PDF), **매트릭스 역할 6종·시·도 집계**, 지도(행안부·다비·역할·정부 패널), **ASF 전국 가상 점·동심원·우측 구간 목록 데모**, 좌표 JSON 빌드·dedupe 등.

**표 형태 목록은 [`ROADMAP-PATENT-STATUS.md`](ROADMAP-PATENT-STATUS.md) §5와 [`CHANGELOG.md`](CHANGELOG.md)에 둔다.** (여기서는 중복하지 않음.)

---

## 2. 해야 할 것 (우선순위)

### P1: 파이프라인 상시 실행 (권장안 = 문서 반영됨)

- [x] **권장**: `nas-auto-pipeline.py` 주기 실행으로 메일→OCR→import까지 한 번에 처리 — 등록 예시 `docs/OPS-AUTOMATION.md` §5
- [ ] (선택) input 폴더 새 파일 감지 → OCR만 별도 트리거
- [ ] (선택) results.xlsx 생성 감지 → import만 별도 트리거

### P2: 메일 자동 가져오기

- [ ] NAS/상시 호스트 **작업 스케줄러**에 위 파이프라인 등록(실질적으로 P1과 동일 작업)
- [ ] (선택) n8n 등으로 동일 명령만 주기 실행
- [ ] **(내일) 2026-03-25 이후 누락분 일괄 가져오기**: 네이버에서 기간 지정 다운로드/비교 → NAS 저장 → OCR+import 재처리
- [ ] **(내일) 네이버 메일 도착 자동 감지→저장→OCR 자동 실행**: 상시 프로세스(서비스/스케줄러)로 구동, 실패·중복 방지 로그/리트라이 포함

### P3: 레거시 정리

- [ ] Drive 의존성 최소화 (기존 데이터 참조용만 유지)
- [ ] GAS → Gmail 대안 완전 전환 (현재 네이버 IMAP 사용)

### P3-완료(2026-03-27): 데이터/표시 이슈 정리

- [x] 전북대(jbnu) 날짜를 접수일자로 통일해 중간/최종 중복 완화
- [x] ELISA 판정: 판정열 우선 + 미해독 시 S/P 폴백, 폴백 케이스 목록화(관리자)
- [x] 전북대 항원(PCR) 결과 타깃 컬럼(SIV/PED 등) 분기 → PRRS 컬럼 오염 방지
- [x] `--replace` import 시 stale 레코드(`pdf_file_id` null + 파일명날짜) 자동 정리 → 매트릭스 “양성 잔존” 해결
- [x] 관리자 버튼 정리(DB 새로고침/폴백 목록만 유지), MH 헤더 표기 버그 수정

### P4: PDF 링크/경로 안정화 (추후)

- [ ] 웹 UI에서 원본 PDF를 열 때 `pdf_file_id`가 **경로 문자열**에 의존함  
  - NAS 폴더 구조/경로가 바뀌거나(마운트 변경), 상대경로 규칙이 바뀌면 기존 레코드 링크가 깨질 수 있음  
  - 방향: `pdf_file_id`를 “파일 경로”가 아니라 “안정적인 파일 키(예: 해시/DB 테이블)”로 관리하고, `/api/pdf`는 그 키로 resolve

**구현 시 참고(스코프 메모)**

- 파일 본문 **sha256**(또는 `parsed_files`와 동일 키)을 `test_records` 또는 별도 `pdf_files` 테이블에 보관하고, UI·API는 **내부 id(PK)** 만 노출.
- `/api/pdf?id=...`는 DB에서 id→저장 경로(또는 NAS 마운트 루트 + 상대키)를 resolve. 마운트 루트는 **환경변수 한 곳**에서만 읽기.
- 기존 경로 문자열 레코드는 마이그레이션 스크립트로 키 채우기 또는 읽기 시 fallback(구 경로 → 신 키 조회).

### P5: 지도·명세 정합 (제품/특허 연계)

합의 요약: [`BACKLOG-ALIGNMENT.md`](BACKLOG-ALIGNMENT.md) §2–§3. 아래는 구현 체크리스트.

- [ ] 지도 **가상 양성**(주황)·**ASF 전국/동심원 데모**(빨강)는 단기 **데모 유지**; `test_records` 등 **실질 양성·질병 필터** 연동은 API·스코프 설계 후 구현
- [ ] **서버 측 RBAC**와 지도 탭 **클라이언트 역할**의 정책 일치 — 단기 데모 토글 유지, 중기에 `matrixScope`/`MATRIX_*` 와 정합
- [ ] `FitBounds` / 역할 전환 시 **줌·중심 UX** 추가 조정(요구에 맞게 유지 또는 재맞춤)

### P6: 항체가 추세(1~3농장, DB 조회 정본)

설계·단계: [`TITER-TRACKING-SPEC.md`](TITER-TRACKING-SPEC.md).

- [ ] DB: 표본/롱 테이블(또는 동등) + 인덱스 — `test_records` 단독으로는 다두 S/P 보존 부족
- [ ] Import: `도/시군/면/{farm_code}_titer.xlsx` → DB (앱은 런타임에 xlsx 미사용)
- [ ] API: 최대 3농장, 역할·담당 범위 스코프
- [ ] UI: 농장주·담당 수의 — 일령·산차 × 질병 × 날짜 그리드/차트

---

## 3. 계획 중 · 보류 (명세에는 있으나 미구현 또는 후순위)

- 지도 질병 레이어를 **매트릭스·DB 양성**과 실시간 연동(현재 ASF 등은 **시연용 데모**)
- **항체가 시계열 그래프** UI(특허 실시예 6 / 구성 7) — [`TITER-TRACKING-SPEC.md`](TITER-TRACKING-SPEC.md)로 범위·저장 구조 초안 확정, 구현은 P6
- 공수의 **로그인 시 시군 자동 인식** 등 명세 수준 RBAC — 현재는 주소·`sido` 규칙으로 권역 근사

---

## 4. 참고 문서

- [`TITER-TRACKING-SPEC.md`](TITER-TRACKING-SPEC.md) — 항체가 추세(농장당 xlsx·폴더 규칙·DB 정본·구현 단계)
- [`BACKLOG-ALIGNMENT.md`](BACKLOG-ALIGNMENT.md) — 백로그·구성 합의(운영·지도·RBAC·매트릭스 우선순위·특허 캡처)
- [`ROADMAP-PATENT-STATUS.md`](ROADMAP-PATENT-STATUS.md) — 완료/미완·특허·로드맵 단일 요약
- `../최신명령어.md` — 오늘 기준 유효 명령
- `COMMANDS.md` — 전체 명령(레거시 포함)
- `IMPORT-RUNBOOK.md` — 대량 import는 호스트 스크립트 표준
- `SETUP-NAVER-OCR.md` — 네이버·OCR 설정
