# ⚠️ AI 에이전트 작업 시 필수 — 가장 먼저 읽을 파일

> **폴더를 X: 드라이브로 옮겨도 이 문서 구조는 동일합니다.**  
> 프로젝트 루트의 `00-READ-ME-FIRST.md`를 항상 먼저 읽으세요.

---

## 읽기 순서

| 순서 | 파일 | 내용 |
|------|------|------|
| **1** | `PROJECT-CONTEXT.md` | 프로젝트 개요, 파이프라인, 주요 경로, 스크립트, 환경변수 |
| **1.5** | `docs/ADMIN-AUTH-DRIVE-NAVER.md` | **운영 런북**(관리자/로그인/승인/Drive/네이버) |
| **2** | `개발일지.md` | **매일 작업 시작 전/종료 후** 진행상황(Why/Next) 업데이트 |
| **3** | `최신명령어.md` | **오늘 기준으로 유효한 명령만** 유지 (운영/재처리) |
| **4** | `docs/COMMANDS.md` | 입력 가능한 모든 명령어 모음 (레거시 포함, 정리 대상) |
| **5** | `docs/CHANGELOG.md` | 드랍·변경 사항 요약 |
| **6** | `docs/ROADMAP-PATENT-STATUS.md` | 특허·로드맵·구현 현황 단일 요약 |
| **7** | `docs/00-DOCS-INDEX.md` | 전체 문서 인덱스 |
| **8** | `docs/TITER-TRACKING-SPEC.md` | 항체가 추세(P6): 농장당 xlsx·폴더 규칙·**DB 조회 정본**·구현 단계 |

---

## 매일 작업 정리 루틴 (필수)

- **작업 시작 전**: `개발일지.md`에서 전날 “추적/다음 할 일” 확인 → 오늘 목표 세팅
- **작업 종료 후**:
  - `개발일지.md`에 **Today(What/Why)** + **Next** 업데이트
  - `최신명령어.md`에 **오늘 기준으로 유효한 명령만** 남기고 불필요한 명령 삭제

---

## 현재 전환 목표

| 구분 | 내용 |
|------|------|
| **기존** | Google Drive 중심, Gmail→Drive→수동 OCR→DB |
| **목표** | **X: 드라이브(NAS)** 중심, 네이버→NAS→파싱→DB→매트릭스 **실시간 자동** |

→ 상세: `docs/PIPELINE.md`

---

## Cursor 규칙 (Next.js)

- Next.js 버전 차이 주의. `node_modules/next/dist/docs/` 참고.
- Breaking changes·deprecation 확인 후 코드 작성.
