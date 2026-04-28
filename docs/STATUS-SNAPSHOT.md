# 상태 스냅샷 (2026-04-05)

## 한 줄

**매트릭스(역할 6종·시·도 집계) + 지도(행안부·다비·ASF 데모 동심원) + NAS→OCR→DB 파이프라인**까지 프로토타입 동작. 남은 핵심은 **운영 스케줄 고정**, **지도·가상 데모를 실DB·서버 RBAC과 맞추기**, PDF 경로 안정화.

## 전체 현황·특허·완료/미완 (상세)

**→ [`ROADMAP-PATENT-STATUS.md`](ROADMAP-PATENT-STATUS.md)** 한 파일에 모았다. 이 스냅샷은 요약만 유지한다.

## 바로 할 일 (3가지)

1. **NAS/상시 PC**에서 `nas-auto-pipeline.py` 등 주기 실행 등록 — [`OPS-AUTOMATION.md`](OPS-AUTOMATION.md) §5  
2. **지도 P5**: 반경·질병 표시와 `test_records` 연동, 지도 역할과 매트릭스 서버 정책 정합 — [`TODO.md`](TODO.md) P5  
3. **임시출원**: 화면 캡처·도면을 현재 UI에 맞게 갱신 — [`ROADMAP-PATENT-STATUS.md`](ROADMAP-PATENT-STATUS.md) §7  

## 변경 이력

- 날짜별 기술 변경: [`CHANGELOG.md`](CHANGELOG.md)  
- 일지: [`../개발일지.md`](../개발일지.md)

## 최근에 반영된 것 (키워드만)

- 매트릭스: `gov_central` 집계·익명 행, `gov_local`, `public_vet`, `vet_assigned`, `vet_union`, `MATRIX_*_EMAILS`  
- 지도: ASF 가상 30점, 클릭 시 500m~10km 5색 원, 우측 거리 구간 코드 목록, 제주 bounds, **주소/지도 클릭 기준점 반경 조회(500m·1·2·3·5km) + 원 라벨 표시**  
- 문서: 본 ROADMAP 신설, 인덱스·TODO·특허 표 정리  

(파이프라인·전북대 파서·ELISA 등 3월 이전 요약은 `CHANGELOG` 과거 블록 참고.)
