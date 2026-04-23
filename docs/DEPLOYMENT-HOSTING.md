# 웹 호스팅·운영 아키텍처

> **프로젝트 채택안(기본)**: 웹앱은 **Next.js + Neon**을 클라우드(예: Vercel)에 두고, **메일 수집·PDF 저장·Docker OCR·DB import**는 **NAS 또는 Docker 가능한 VPS**에서 실행한다.  
> 일반 공유 웹호스팅(Docker 불가·짧은 실행 시간)만으로는 현재 OCR 스택을 그대로 이전할 수 없다.

상세 파이프라인: [`PIPELINE.md`](PIPELINE.md), 네이버·OCR: [`SETUP-NAVER-OCR.md`](SETUP-NAVER-OCR.md), NAS 상시 컨테이너: [`OPS-NAS-PIPELINE-DOCKER.md`](OPS-NAS-PIPELINE-DOCKER.md).

---

## 1. 운영 모델 확정 (채택 vs 대안)

### 1.1 채택: 하이브리드 (A안)

| 계층 | 역할 | 비고 |
|------|------|------|
| **클라우드** | Next.js 앱, NextAuth, `/api/*`가 **Neon**에 접속 | `DATABASE_URL`, OAuth, `NEXTAUTH_URL` |
| **엣지/온프렘** | 네이버 IMAP → 디스크 저장 → `ocr-pipeline` Docker → `import-ocr-results` → Neon | [`docker-compose.nas-pipeline.yml`](../docker-compose.nas-pipeline.yml), [`ocr-pipeline/docker-compose.yml`](../ocr-pipeline/docker-compose.yml) |

- 웹을 배포해도 **파이프라인이 별도로 돌지 않으면 DB는 갱신되지 않는다.**
- OCR 컨테이너는 메모리 상한 등 **장시간·무거운 작업**에 가깝고, 서버리스(함수 단위) 환경과 맞지 않는다.

### 1.2 대안: 단일 VPS 풀스택 (B안)

- 한 VM에 Next + PostgreSQL(또는 Neon 유지) + OCR + cron을 모두 올리는 방식.
- **가능**하나 리소스(CPU/RAM·디스크)·보안 패치·배포 파이프라인 부담이 커진다.
- Neon을 버리고 동일 서버 PG로 옮길지 등 **아키텍처 결정**이 선행되어야 한다.

### 1.3 대안: OCR만 별도 컨테이너 서비스 (C안)

- 클라우드의 Cloud Run / ECS 등에 OCR 워커만 두는 형태.
- **객체 스토리지·시크릿·장시간 실행·비용**을 별도 설계해야 하며, 현재 레포는 **NAS 경로·로컬 볼륨** 전제가 강하다.

---

## 2. OCR·IMAP·import 실행 위치 확정 (채택)

### 2.1 채택: NAS(또는 동등 호스트) + Docker

- **기본**: 지금 문서와 동일하게 **NAS에 Docker**, `OCR_CMD`로 `ocr-pipeline` 실행 ([`SETUP-NAVER-OCR.md`](SETUP-NAVER-OCR.md)).
- 상시 루프: [`OPS-NAS-PIPELINE-DOCKER.md`](OPS-NAS-PIPELINE-DOCKER.md) 또는 호스트 **작업 스케줄러** + [`OPS-AUTOMATION.md`](OPS-AUTOMATION.md) §5.

### 2.2 대안: 클라우드 전용 VM

- NAS를 쓰지 않을 때: **Linux VPS**에 레포 체크아웃, 동일 `docker compose`, 환경변수만 클라우드 경로에 맞게 조정.
- PDF 원본 장기 보관은 **디스크 또는 S3 호환 스토리지** 정책이 필요 ([`TODO.md`](TODO.md) P4와 연계).

---

## 3. 배포 전 체크리스트 (웹앱·DB·파일)

배포(특히 클라우드) 직전에 다음을 확인한다.

### 3.1 인증·URL

- [ ] `NEXTAUTH_URL` — 프로덕션 도메인(예: `https://...`)과 **정확히 일치**(trailing slash 규칙 포함, 플랫폼 문서 따름).
- [ ] `AUTH_SECRET` — 프로덕션용 강한 값, 로컬과 분리.
- [ ] Google OAuth **승인된 리디렉션 URI**에 프로덕션 URL 등록.
- [ ] `ALLOWED_EMAILS` / `ADMIN_EMAILS` / `MATRIX_*_EMAILS` — 배포 환경 변수에 반영.

### 3.2 데이터베이스

- [ ] `DATABASE_URL` — Neon 프로덕션 브랜치(또는 운영 DB)만 가리키기.
- [ ] `npm run db:init` 또는 마이그레이션으로 **스키마 최신** — `farms`, `test_records`, `parsed_files` 등.
- [ ] **항체가**: `antibody_titers` 등 사용 시 테이블 존재 여부 확인 — 미생성 시 `/api/titers/*` 등이 실패할 수 있음. 필요 시 [`app/api/admin/init-titers`](../app/api/admin/init-titers/route.ts) 등 운영 절차 정리.

### 3.3 API 시크릿

- [ ] `INGEST_SECRET`, `CRON_SECRET` — 프로덕션 값 설정, 호출 스크립트/크론과 일치.

### 3.4 PDF·파일 경로 ([`TODO.md`](TODO.md) P4)

- [ ] 프로덕션 Next 인스턴스에 **`PDF_BASE_PATH` / NAS 마운트가 없으면** `/api/pdf` 링크가 깨질 수 있음.
- [ ] 대응: (단기) 웹 호스트가 읽을 수 있는 스토리지에 동기화 또는 마운트 — (중기) **파일 키·객체 스토리지**로 이전.

### 3.5 파이프라인(데이터 갱신)

- [ ] 메일·OCR·import는 **§1·§2 채택안**대로 별도 호스트에서 동작하는지.
- [ ] `NAVER_*`, `OCR_*`, `DASHBOARD_DIR` 등은 **PC/NAS/서버별로 분리** ([`SETUP-NAVER-OCR.md`](SETUP-NAVER-OCR.md) §2.1).

### 3.6 빌드·런타임

- [ ] `npm run build` 성공(배포 플랫폼과 동일 Node 버전 권장).
- [ ] 지도용 정적 JSON(`farm-locations.json`, `national-pig-farms.json`)은 **빌드 시점**에 레포에 포함되거나 CI에서 생성하는지.

---

## 4. 호스팅 유형과 Docker OCR

| 유형 | 웹앱(Next) | Docker PDF OCR (현재 스택) |
|------|------------|------------------------------|
| 공유 호스팅 / Docker 불가 | 부적합 또는 제한적 | **불가에 가깝다** |
| Vercel 등 서버리스 프론트 | 적합 | **동일 호스트에 두지 않음** — 별도 워커 |
| VPS / NAS Docker | 자체 설치 시 가능 | **가능** — 문서 기본 경로 |

---

*최초 정리: 2026-04-10 — `웹호스팅·도커 검토` 계획 반영.*

---

## 5. 레포·호스팅 비공개

- [`SECURITY-REPO-ACCESS.md`](SECURITY-REPO-ACCESS.md) — Git Private, Vercel 접근, 시크릿 관리 체크리스트.
