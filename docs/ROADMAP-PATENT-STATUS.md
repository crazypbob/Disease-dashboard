# 로드맵 · 특허 · 구현 현황 (단일 진입점)

> 최종 업데이트: 2026-04-10 (배포·OCR: [`DEPLOYMENT-HOSTING.md`](DEPLOYMENT-HOSTING.md); 합의: [`BACKLOG-ALIGNMENT.md`](BACKLOG-ALIGNMENT.md); 항체가 추세: [`TITER-TRACKING-SPEC.md`](TITER-TRACKING-SPEC.md))  
> 법률 문장·청구범위: [`특허명세서_초안.md`](특허명세서_초안.md) — 본 문서는 **제품·코드·운영** 관점 요약이다.

---

## 1. Context

- 취미·프로토타입으로 구축한 **축산 질병 검사결과 대시보드**.
- 1차: NAS 등으로 소수 사용자 무비용 운영. 상용 시 클라우드·정부 서버로 전환 가정.
- 특허: 임시출원 후 기술이전 협상 등을 염두에 두고, **매트릭스·역할 기반 접근·반경 공개·지도 레이어**를 명세와 맞춰 구현 중.

---

## 2. 특허로 보기 좋은 아이디어 (요약)

| 구성 | 설명 | 구현·명세 연계 |
|------|------|----------------|
| 매트릭스 3축 | 농장 × 질병·검사 × 날짜, PRRS Ag/Ab 병합 열 | 완료 — 핵심 실시예 |
| RBAC | 정부(중앙·지방)·공수의·담당 수의·합집합 등 **접근 범위 차등** | 매트릭스: 서버 필터 + UI 6종. 지도: 클라이언트 역할 데모(서버 강제와 아직 불일치 가능) |
| 익명·반경 | 코드 중심 표기, 반경 내 인근 현황 | 지도 UI·가상 양성 데모. **실DB 집계 연동**은 미완 |
| 지도·질병 레이어 | 전국(또는 관할) 농장 + 질병 강조 | 행안부·다비 레이어 완료. **ASF 데모**(가상 30점·클릭 시 동심원)는 시연용; **DB 기반 질병만 강조**는 미완 |
| OCR·파이프라인 | PDF → 구조화 → DB | 동작. 운영은 스케줄 등록 여부에 따름 |

공지 조합에 가까운 것(단독 청구 약함): NAS/Docker·Postgres 스키마·Next.js·Google OAuth 자체.

---

## 3. 정부·상용 전제 (비기능)

1. 검사기관의 결과 공유·제도  
2. 이동제한 등으로 인한 데이터 왜곡 완화  
3. 개인정보·농장 식별 정책(익명 코드·관할 열람 범위)

데이터 수집: **양식 통일(B)** 이 장기 유지보수에 유리, 단기는 **OCR/파싱(A)** 현실적.

---

## 4. 기술 전환 (NAS → 클라우드)

- 현재: 네이버 IMAP → NAS → OCR → results.xlsx → import → Vercel 대시보드  
- 상용: API·스토리지·파싱 서비스·중앙 DB·공공 SSO 등으로 치환 가능(명세에서는 기술 중립 서술 권장).
- **배포·OCR 위치·체크리스트(채택 하이브리드)**: [`DEPLOYMENT-HOSTING.md`](DEPLOYMENT-HOSTING.md).

---

## 5. 구현 상태 (한눈에)

### 5.1 완료에 가까움

- 매트릭스: 사이드바 다중 선택, 질병·날짜·양성만, PDF 링크, Ag/Ab, 관리자(DB 새로고침·폴백 목록)
- **시연 UX**: 상단 `로그인 주최`로 매트릭스/지도/좌측 농장선택이 함께 전환되도록 단순화(공수의 pv 데모 포함)
- 매트릭스 **역할 6종**: `default` | `gov_central` | `gov_local` | `public_vet` | `vet_assigned` | `vet_union` — [`DashboardContent.tsx`](../components/DashboardContent.tsx), [`app/api/records/route.ts`](../app/api/records/route.ts), [`lib/matrix-region-filters.ts`](../lib/matrix-region-filters.ts), [`lib/matrix-viewer-auth.ts`](../lib/matrix-viewer-auth.ts)(`MATRIX_*_EMAILS` 화이트리스트, 비어 있으면 데모 전체 허용)
- **정부·중앙 집계**: 시·도 × 월 × 질병 건수/양성 — [`SidoAggregateMatrix.tsx`](../components/SidoAggregateMatrix.tsx); **익명 농장 행** 옵션(`govView=farms`)
- **정부·지방**: 관할 시·도 선택 + 주소 기반 스코프
- 지도: 정부·수의사·공수의·농장주, 행안부+다비, 반경·인근 목록·CSV, geo dedupe
- **정부+ASF**: 전국 **가상 발생 지점 30곳**(시드), **클릭 시** 500m·1·3·5·10km **5색 동심원** 동시 표시, 우측 **~20% 패널**에 거리 구간별 **농장 코드/축산일련번호** 목록 — [`FarmMapPanel.tsx`](../components/FarmMapPanel.tsx), [`lib/map-asf-rings.ts`](../lib/map-asf-rings.ts)
- 지도 **제주 포함** 맞춤: `KOREA_VIEW_BOUNDS` 확장, ASF 시 제주 기준점을 fit에 포함, `minZoom` 완화

### 5.2 부분 / 데모

- 지도 반경 내 **주황 가상 양성**: 시드 기반, **실DB 아님**
- 지도 역할: UI만 — **매트릭스와 동일한 서버 RBAC**와 아직 1:1 아님
- 질병 버튼(PRRS/PED/FMD/ASF): 반경 데모·ASF 전국 데모에 사용; **DB 양성 농장만 지도 강조**는 미연동
- **MH/MHR 분리**: Optipharm 항원에서 *Mycoplasma hyorhinis*는 `MH`가 아닌 `MHR`로 분리(오표시 방지). DB backfill은 운영 단계에서 적용.

### 5.3 미구현 · 후순위

- 항체가(S/P 등) **추세·비교(1~3농장)** — 설계 문서 [`TITER-TRACKING-SPEC.md`](TITER-TRACKING-SPEC.md): **농장당 xlsx + 도/시군/면 폴더**, **앱은 DB만 조회**; DB 표본/롱 테이블·Import·API·UI는 [`TODO.md`](TODO.md) P6
- **vet_union** 매트릭스에서 담당 vs 관할 **행 그룹 시각적 분리** — **다음 매트릭스 UI 작업 1순위**([`BACKLOG-ALIGNMENT.md`](BACKLOG-ALIGNMENT.md) §4)
- **gov_local** 시·군·구 **그룹 헤더**(현재는 시·도 필터 + 기존 그룹 구조) — vet_union 이후
- 공수의 **시·군·구 단위** 배정(현재 경기/충청 도 단위 데모)
- `nas-auto-pipeline.py` **실제 스케줄 등록**은 환경별 수동 — 운영 합의는 [`BACKLOG-ALIGNMENT.md`](BACKLOG-ALIGNMENT.md) §1

---

## 6. 청구항 초안 (기술 요약만)

1. 매트릭스 통합 표시(농장·질병·날짜)  
2. 역할별 접근 범위 차등  
3. 반경·익명 공개  
4. 지도 + 질병 레이어(전국·관할)  
5. 수집·파싱·DB·표시 파이프라인  

상세 문장: [`특허명세서_초안.md`](특허명세서_초안.md) 「청구범위」.

---

## 7. 임시출원·도면 체크리스트

- [x] 청구항 초안·선행기술조사 문서 존재 (`특허명세서_초안.md`, `선행기술조사_보고서.md`)
- [ ] 도면1·4 mermaid 정리·삽입
- [ ] 화면 캡처 갱신(매트릭스 역할 6종, 지도 ASF 동심원·우측 패널 등)
- [ ] 명세서 본문과 구현 표 최종 동기화
- [ ] KIPRIS 서식

**일정 합의**: 도면·캡처는 **코드 릴리스와 분리**, 임시출원 준비 시 일괄 진행. 촬영 대상·우선순위는 [`BACKLOG-ALIGNMENT.md`](BACKLOG-ALIGNMENT.md) §5.

---

## 8. 로드맵 (단계)

| 단계 | 내용 |
|------|------|
| 현재 | 대시보드·파이프라인 프로토타입, 역할·집계·지도 데모 확장 |
| 다음 | 운영 스케줄 고정, 지도·실DB·RBAC 정합, PDF 키 안정화, 항체가 추세(P6) 등 [`TODO.md`](TODO.md) |
| 이후 | 임시출원 → 협상 → 정식출원/확장 |

---

## 9. 역할별 매트릭스 (설계 메모, 구현 대비)

| 역할 | 행·스코프 | 비고 |
|------|-----------|------|
| 정부·중앙 | 시·도 집계 표 **또는** 익명 농장 행 | 집계·익명 행 **구현됨** |
| 정부·지방 | 관할 시·도 내 농장 | **구현됨**. 시·군·구 그룹 헤더는 미구현 |
| 공수의 | 경기/충청 주소·행안부 `sido` 근사 | **구현됨**(도 단위). 시·군·구는 상용 과제 |
| 담당 수의 | `MATRIX_VET_ASSIGNED_NAME` 등 | **구현됨** |
| 수의+공수의 | 합집합 API | **구현됨**. UI 이중 그룹은 미구현 |
| 기본 | 사이드바·등록/고객 농장 | **구현됨** |

---

## 10. 추천 다음 작업 (제품)

상세 합의·우선순위: [`BACKLOG-ALIGNMENT.md`](BACKLOG-ALIGNMENT.md).

1. 지도 역할을 **세션·서버 정책**과 동기화(매트릭스 `MATRIX_*`와 동일 철학) — **중기**; 단기는 데모 토글 유지.  
2. 가상 양성·ASF 레이어 **단기 데모 유지**; **실데이터 연동**은 `test_records` 집계 API 설계 후.  
3. **`vet_union` 행 그룹 시각 분리**를 먼저, 이어 `gov_local`·공수의 시군구.  
4. 특허 도면·캡처는 **임시출원 창구**에서 일괄 갱신(§5·§7).  
5. **항체가 추세**(농장주·담당 수의, DB 정본): [`TITER-TRACKING-SPEC.md`](TITER-TRACKING-SPEC.md) 및 P6.

---

## 11. 관련 문서

| 파일 | 용도 |
|------|------|
| [`TITER-TRACKING-SPEC.md`](TITER-TRACKING-SPEC.md) | 항체가 추세 저장·표시·구현 단계(엑셀 수집 / DB 조회) |
| [`BACKLOG-ALIGNMENT.md`](BACKLOG-ALIGNMENT.md) | 운영·지도·RBAC·매트릭스·특허 일정 합의 기록 |
| [`STATUS-SNAPSHOT.md`](STATUS-SNAPSHOT.md) | 짧은 스냅샷 |
| [`TODO.md`](TODO.md) | 체크리스트·우선순위 |
| [`CHANGELOG.md`](CHANGELOG.md) | 날짜별 변경 |
| [`../개발일지.md`](../개발일지.md) | 일별 Why/Next |
| [`특허명세서_초안.md`](특허명세서_초안.md) | 출원용 명세 |
| [`선행기술조사_보고서.md`](선행기술조사_보고서.md) | 선행기술 |

> 개인 PC 등 저장소 밖에 두었던 통합 초안(md)은 **본 문서로 흡수**했다. 외부 복사본은 삭제하거나 본 경로만 링크하면 된다.
