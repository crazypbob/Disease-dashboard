# OCR 결과 엑셀 → DB 반영 (운영 표준)

## 결론(운영 표준)

- **운영(대량/실패 복구 포함)은 “호스트에서 스크립트 직접 실행”을 표준**으로 합니다.
- `/api/admin/import-ocr`는 편의 기능이지만, 내부적으로 `spawnSync(..., timeout: 120_000)`이라 **대용량에서 500이 날 수 있어 운영 표준으로 두지 않습니다.**

---

## 1) 로컬/호스트에서 직접 실행(권장)

프로젝트 루트에서 실행합니다.

### 표준 (Windows 포함 — `npx.ps1` 회피)

**`npm run`은 `.cmd`로 실행되어 PowerShell ExecutionPolicy에 걸리지 않는 경우가 많습니다.** 아래를 기본으로 쓰세요.

```bash
npm run import:ocr -- --file="X:/ocr-pipeline/output/results.xlsx" --replace
```

미리보기:

```bash
npm run import:ocr -- --file="X:/ocr-pipeline/output/results.xlsx" --dry-run
```

### 대안: tsx 직접 (npm 없이 Node만 쓸 때)

```bash
.\node_modules\.bin\tsx.cmd scripts\import-ocr-results.ts --file="X:/ocr-pipeline/output/results.xlsx" --replace
```

(`npx tsx ...`는 PowerShell에서 `npx.ps1` 차단이 날 수 있음 → `WINDOWS-EXECUTIONPOLICY.md` 참고.)

### 전북대(vetdxlab) A열 형식(단일 컬럼)일 때

```bash
npm run import:ocr -- --file="X:/ocr-pipeline/output/result.xlsx" --format=single-column --replace
```

---

## 2) 관리자 API(`/api/admin/import-ocr`) 사용 시 주의

- 내부에서 실행되는 내용은 결국 `scripts/import-ocr-results.ts`이며, 제한이 있습니다.
  - **timeout**: 120초
  - 따라서 “엑셀 크기/INSERT가 많을 때”는 실패할 수 있음
- 사용 예:
  - `POST /api/admin/import-ocr`
  - `POST /api/admin/import-ocr?format=single-column`
  - `POST /api/admin/import-ocr?replace=true`

운영에서는 “API 버튼”이 아니라, **NAS/상시 호스트 스케줄(파이프라인)로 import까지 수행**하는 것을 권장합니다.

---

## 3) 결과가 안 보일 때 체크리스트(최소)

- `results.xlsx`는 갱신됐는데 DB가 안 바뀜 → **import가 안 돌았거나 실패**한 케이스가 제일 흔함
- 표준 확인 흐름
  - `--dry-run`으로 파싱이 되는지 먼저 확인
  - 그 다음 `--replace`가 필요한지 판단(기존 레코드가 있는데 값만 달라진 경우)

