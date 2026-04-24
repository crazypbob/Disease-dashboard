# 질병메일링 대시보드

검사결과 PDF 파싱 → 대시보드 매트릭스 표시. 기존 GAS 대체.

## 스택

Next.js 16.2, NextAuth v4, Neon PostgreSQL, Vercel

## 파이프라인

네이버 메일 → NAS 저장 → OCR → results.xlsx → DB → 매트릭스

## 시작

1. `.env.local` 설정 — `SETUP.md` 참고
2. `npm run db:init`
3. `npm run dev` — http://localhost:3005

## 문서

- **`00-READ-ME-FIRST.md`** — 작업 시 첫 읽기
- **`docs/ADMIN-AUTH-DRIVE-NAVER.md`** — 운영 런북(관리자/로그인/승인/Drive/네이버)
- **`docs/ROADMAP-PATENT-STATUS.md`** — 특허·로드맵·완료/미완 요약
- **`docs/DEPLOYMENT-HOSTING.md`** — 웹 호스팅·Docker OCR 위치·배포 전 체크리스트
- **`docs/00-DOCS-INDEX.md`** — 전체 문서 인덱스
