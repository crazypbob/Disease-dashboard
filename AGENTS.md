# 작업 시작 시 첫 읽기

**이 프로젝트에서 작업을 시작할 때는 반드시 아래 순서로 읽어주세요.**

1. **`00-READ-ME-FIRST.md`** — 읽기 순서, 전환 목표 요약
2. **`PROJECT-CONTEXT.md`** — 프로젝트 개요, 파이프라인, 주요 경로, 스크립트, 환경변수
3. **`docs/CHANGELOG.md`** — 최근 변경사항 (특히 OCR 파서 수정 내역)  
4. **`docs/ROADMAP-PATENT-STATUS.md`** (필요 시) — 특허·로드맵·구현 현황 단일 요약

**작업 PC가 둘 이상**(예: 집 데스크톱 vs 외부 노트북)이면, Cursor 규칙 **`.cursor/rules/work-environment-machines.mdc`** — 경로·포트·실행 중인 서버를 한 환경에만 맞추지 말 것.

**NAS에 SSH(bash)로 명령을 안내**할 때는 Cursor 규칙 **`.cursor/rules/nas-ssh-path-first.mdc`** — `X:\` 같은 Windows 경로를 그대로 쓰지 말고, **맨 앞에** `find`/`ls` 등으로 실제 경로를 잡는 블록을 둘 것.

---

## OCR 파이프라인 파서 규칙

`ocr-pipeline/app/parser.py` 수정 시 반드시 확인:

### 전북대(jb5219) 파일명 패턴 — 두 가지 형식이 공존함

| 형식 | 파일명 예시 |
|------|-----------|
| **신규 (2025~)** | `20250305_2006대월(한지현) 최종 결과 보고서_jb5219_PRRS ELISA.pdf` |
| **구형 (네스트)** | `20240903_24-1138_PED_PCR_놀뫼농장_동물진료법인네스트.pdf` |

- 감지 조건: `jb5219` 또는 `네스트` 또는 `전북대` — PCR/ELISA 키워드만으로 감지하지 말 것
- 농장명 형식: `2006대월`, `3001조산` (4자리 숫자코드 + 농장명) → `getFarmCode()`에서 DB코드 자동 변환
- 검사종류 매핑: `JBNU_TEST_TYPE_MAP` 참조 (세균 배양, 항생제내성 등 포함)
- 상세: `docs/CHANGELOG.md` → "전북대 파서 전면 수정" 섹션

### 농장 코드 매핑

- `lib/farms.ts` — DB코드 ↔ 농장명 원본 DB
- `lib/mail-pipeline/farm-mapping.ts` — `getFarmCode()`: 농장명/코드 alias → DB코드
  - `'2006대월'` → `DB2006`, `'조산'` → `DB3001` 등 substring 검색 포함
  - 4자리 숫자만 있는 경우(`'2006'`)도 alias로 등록됨

---

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
