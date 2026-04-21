# 검사기관별 PDF 묶음·파서 규칙

운영에서 관찰한 **한 농장·한 접수**를 PDF 몇 개로 나누는지에 따라 OCR·파서 가정이 달라집니다.  
코드상 파서 선택은 [`ocr-pipeline/app/parsers/__init__.py`](../ocr-pipeline/app/parsers/__init__.py)의 `get_parser(filename)` — **파일명 키워드**로 전북대 vs 그 외(옵티팜 계열)만 구분합니다.

---

## 요약 표

| 구분 | PDF 묶음 방식 | 대표 파일명·본문 단서 | 파서 클래스 | 파싱 시 유의 |
|------|----------------|------------------------|--------------|--------------|
| **도드람** (합본이 많음) | **한 PDF에 항원·항체·기타 결과를 함께** 넣는 경우가 많음 | `(혈청)`/`(항원)` 구분 없이 한 파일; 또는 본문에 복수 검사 표 | `OptifarmParser` (jb5219·전북대 키워드 없을 때) | 한 파일에서 **여러 질병/검사종**을 표로 뽑아야 함. `optifarm.py`의 표 분기·`base.py` regex 보완이 합본을 전제로 동작 |
| **옵티팜** | **항원용 PDF + 혈청(항체)용 PDF** 등으로 **검사종류별 파일 분리** | `YYYYMMDD_(혈청) 26-xxxxx 농장.pdf`, `…(항원)…` — 끝 패턴 [`_MAIL_STYLE_TAIL`](../ocr-pipeline/app/parsers/optifarm.py) | `OptifarmParser` | 파일명의 **검사종류**가 `row['검사종류']`로 들어가 **한 파일 = 주로 한 축(항원 또는 혈청)** |
| **전북대** | **검사(또는 검사종)마다 PDF를 분리** | `…_jb5219_PRRS ELISA.pdf`, `…_jb5219_PRRS PCR.pdf`, 네스트 구형 패턴 등 | `JbnuParser` | 파일명에 **검사종류**가 박혀 있고, 문서도 **단일 검사 보고서** 형태가 많음 |

---

## 코드 매핑

1. **전북대**: 파일명에 `jb5219`, `네스트`, `전북대` 중 하나 → `JbnuParser.detect` True.
2. **그 외 전부**: 기본 `OptifarmParser` (도드람·옵티팜·기타 수의전달 PDF 등 **이름만으로는 기관 구분 안 함**).

즉 **“도드람 vs 옵티팜”은 파일명만으로 분기하지 않고**, 같은 `OptifarmParser` 안에서 **PDF 안 레이아웃·표 헤더**로 질병·검사종을 채웁니다.

---

## 운영·개발 워크플로

1. **새 샘플이 쌓이면** 아래 스크립트로 `input` 폴더 파일명 분포를 본 뒤, 이 문서 표의 **단서** 열을 보강합니다.  
   ```bash
   python ocr-pipeline/tools/analyze_input_pdf_names.py
   ```
   (프로젝트 루트에서 실행. `ocr-pipeline/input` 및 하위 `**/*.pdf` 스캔.)  
   출력의 **Optifarm 경로 — 패턴 없음** 건수는 파일명에 `(혈청)`/`(항원)`이 없는 비전북대 PDF로, **도드람식 합본**·메일 접두 긴 파일명 등이 섞일 수 있어 본문·표 파싱을 함께 봐야 한다.

2. **파서 수정 시**  
   - 합본(도드람형): `optifarm.py` 표 추출·`parse_report`·`base.py` 혈청/항원 추론을 같이 검토.  
   - 분리본(옵티팜형): 파일명 `(혈청)`/`(항원)`과 `검사종류` 일치 여부.  
   - 전북대: `jbnu.py` 파일명 타깃·테이블 페이지.

3. **이 문서와 동기화**  
   규칙을 코드 상수로도 두면 주석/문서 불일치를 줄일 수 있습니다 — [`ocr-pipeline/app/parsers/lab_source_profiles.py`](../ocr-pipeline/app/parsers/lab_source_profiles.py).

---

## 관련 코드

| 파일 | 역할 |
|------|------|
| `ocr-pipeline/app/parsers/__init__.py` | `get_parser` 우선순위 |
| `ocr-pipeline/app/parsers/jbnu.py` | 전북대 · 파일당 검사 단위 |
| `ocr-pipeline/app/parsers/optifarm.py` | 옵티팜/비전북대 · 합본 표·혈청 PRRS 표 등 |
| `ocr-pipeline/app/parsers/base.py` | 공통 메타·OCR 보완 |

---

## 변경 이력

- 2026-04-12: 초안 — 도드람(합본)·옵티팜(항원/항체 분리)·전북대(파일 분리) 운영 정의, 분석 스크립트·`lab_source_profiles.py` 추가.
