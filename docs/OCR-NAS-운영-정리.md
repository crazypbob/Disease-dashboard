# OCR·NAS·전북대 파싱 — 운영 정리 (2026-03-26)

> **정본 흐름·스크립트·환경변수**는 `PIPELINE.md`, `SETUP-NAVER-OCR.md` 를 본다.  
> 이 문서는 2026-03-26 기준 **스냅샷**(전북대 표·watcher·나스 이슈 맥락 보존).  
> 네이버 메일 수집부터 Docker OCR, DB 반영, 나스 단독 운영 목표까지 논의·구현된 내용을 한곳에 정리합니다.  
> 변경 이력 한 줄 요약은 `CHANGELOG.md`를 참고하세요.

---

## 1. 파서 분기 (옵티팜 디폴트 + 전북대 예외)

| 구분 | 동작 |
|------|------|
| **전북대** | 파일명에 `jb5219`, `네스트`, `전북대` 등 → `JbnuParser` |
| **그 외** | `OptifarmParser`로 처리 (날짜 없는 파일명 등 fallback 패턴 포함) |

- 팩토리: `ocr-pipeline/app/parsers/__init__.py` — `get_parser(filename)`

---

## 2. 전북대(jb5219) 디지털 PDF — 표 기반 파싱

### 근본 문제

- 전북대 PDF는 **디지털 PDF**인데, 2페이지 **테이블** 구조를 `extract_text()` 한 줄 문자열 + regex만으로 파싱하면 실패하기 쉬움.
- 예: `[VDC 순번 | 검체번호 | S/P값 | 판정 | 비고]` 형태가 텍스트로 합쳐져 열 단위 매칭이 불안정.

### 대응

| 항목 | 내용 |
|------|------|
| **`ocr.py`** | `extract_tables_from_pdf(pdf_path, page_indices)` — `pdfplumber` `extract_tables()`로 2D 리스트 반환 |
| **`jbnu.py`** | `is_multi_page_skip_first()` → **False** (1페이지 메타 + 2페이지 결과 테이블 활용). `parse_report(text, filename, pdf_path=...)`에서 테이블 추출 후 혈청/항원/세균 등 매핑, 실패 시 기존 regex 폴백 |
| **호출부** | `main.py`, `watcher.py`, `parser.py` — `parse_report(..., pdf_path=pdf_path)` 전달 |

### 재처리

```bash
# Docker 이미지 재빌드 후 배치 (기존 results.xlsx 백업 권장)
docker compose -f ocr-pipeline/docker-compose.yml build
docker compose -f ocr-pipeline/docker-compose.yml run --rm ocr-pipeline

# DB 반영 (경로는 환경에 맞게)
npx tsx scripts/import-ocr-results.ts --file=ocr-pipeline/output/results.xlsx --replace
```

---

## 3. watcher — DB(`parsed_files`) 중복 방지

| 항목 | 내용 |
|------|------|
| **목적** | 동일 PDF 재처리·중복 이벤트 시 `results.xlsx`에 행이 중복 쌓이지 않게 함 |
| **키** | 파일 내용 **sha256** → `parsed_files.id`와 대조 |
| **성공 시** | `INSERT INTO parsed_files (id) ... ON CONFLICT DO NOTHING` |
| **환경** | `DATABASE_URL` (Neon 등), `docker-compose.yml`에 전달 |
| **의존성** | `psycopg[binary]` (`ocr-pipeline/requirements.txt`) |

> **주의**: `watcher`는 엑셀까지 갱신하는 역할. **대시보드 DB(`test_records`)** 는 별도로 `import-ocr-results.ts` 또는 관리자 API가 필요합니다.

---

## 4. 네이버 메일 → NAS 저장

| 스크립트 | 용도 |
|----------|------|
| `scripts/naver-vetdxlab-download.py` | 전북대 메일 본문 **vetdxlab 링크** PDF 다운로드 |
| `scripts/naver-nas-compare-download.py` | 메일 **첨부 PDF** vs NAS 비교 후 누락분만 저장 |
| `scripts/naver-imap-to-nas.py` | UNSEEN 첨부·본문 저장 |

- **`.env.local`**: `SAVE_PATH`, `PDF_BASE_PATH`는 **실제 존재하는 경로**로 통일 (존재하지 않는 드라이브면 저장 실패).
- **날짜 범위** (예: 3/1~3/25): `--since=YYYY-MM-DD`, `--before=YYYY-MM-DD` (vetdxlab), `--since` / `--before` (compare-download).

상세·환경변수: `SETUP-NAVER-OCR.md`, `COMMANDS.md`.

---

## 5. 엑셀 → DB 반영 시 유의 (관리자 import 타임아웃)

| 현상 | 원인(가능성) |
|------|----------------|
| 대시보드에 결과가 안 보임 | `results.xlsx`는 갱신됐으나 **DB import 미실행** 또는 실패 |
| `POST /api/admin/import-ocr` 500 | `spawnSync` **timeout 120초** 초과(대용량 엑셀·다수 INSERT) |

- 직접 실행: `npx tsx scripts/import-ocr-results.ts --file=...` (전북대 A열 형식 시 `--format=single-column` 등).
- 코드: `app/api/admin/import-ocr/route.ts` — `timeout: 120_000`.

---

## 6. Docker 실행과 “나스만 켜 두기” 목표

| 질문 | 답 |
|------|-----|
| Docker로 OCR 돌린 뒤 자동화해도 유지 가능한가? | **가능**. 실행 주체를 **항상 켜 두는 장비(NAS 또는 소형 서버)** 로 두면 PC는 끄고 운영 가능. |
| 전제 | 나스가 **파일 공유만**이 아니라 **Docker/스케줄 실행**(Container Station 등) 가능한지, 또는 **상시 호스트** 한 대가 있는지. |
| 옮겨야 할 것 | 메일 수집 스크립트, OCR 컨테이너(`ocr-pipeline`), (선택) `import-ocr`까지 **PC가 아닌 나스/상시 호스트**에서 돌리기. |

PC용 vs NAS용 env 분리: `SETUP-NAVER-OCR.md` § PC/NAS 환경 분리.

---

## 7. 로컬 Windows에서 OCR 시 (참고)

- `pdf2image` / 페이지 수 확인에 **Poppler**가 PATH에 있어야 함. 없으면 일부 PDF에서 `Unable to get page count` 등 오류 가능.
- **Docker 이미지**(`ocr-pipeline/Dockerfile`)에는 Poppler 등이 포함되는 구성이 일반적 — **운영은 Docker 쪽 권장**.

---

## 8. 관련 경로 (레포 기준)

| 역할 | 경로 |
|------|------|
| PDF 입력 | `ocr-pipeline/input/` (하위 `검사결과_PDF` 등) |
| 엑셀 출력 | `ocr-pipeline/output/results.xlsx` |
| OCR 로그 | `ocr-pipeline/output/ocr_pipeline.log` |

---

*마지막 정리: 2026-03-26*
