#!/usr/bin/env python3
"""
input 폴더(및 하위)의 PDF 파일명을 스캔해 검사기관·묶음 패턴 분석용 통계를 출력합니다.

  프로젝트 루트에서:
    python ocr-pipeline/tools/analyze_input_pdf_names.py
    python ocr-pipeline/tools/analyze_input_pdf_names.py --root=X:/path/to/검사결과_PDF

docs/OCR-PARSER-LAB-BUNDLING.md 보강 시 이 출력을 참고합니다.
"""
from __future__ import annotations

import argparse
from collections import Counter
from pathlib import Path

import sys

# 프로젝트 루트를 path에 넣어 parsers 패키지 로드 (ocr-pipeline/app 기준)
_OCR_APP = Path(__file__).resolve().parents[1] / 'app'
if str(_OCR_APP) not in sys.path:
    sys.path.insert(0, str(_OCR_APP))

from parsers.lab_source_profiles import (  # noqa: E402
    classify_parser_route,
    tail_kind_hint,
)


def find_pdfs(root: Path) -> list[Path]:
    if not root.exists():
        return []
    out: list[Path] = []
    for p in root.rglob('*.pdf'):
        if p.is_file():
            out.append(p)
    return sorted(out)


def main() -> None:
    ap = argparse.ArgumentParser(description='Analyze PDF filenames under input tree')
    ap.add_argument(
        '--root',
        type=str,
        default='',
        help='추가 루트 (없으면 ocr-pipeline/input 만)',
    )
    args = ap.parse_args()

    here = Path(__file__).resolve().parents[1]
    roots = [here / 'input']
    if args.root.strip():
        roots.append(Path(args.root.strip()))

    all_pdfs: list[Path] = []
    for r in roots:
        all_pdfs.extend(find_pdfs(r))
    # 중복 제거 (정규화된 path)
    seen = set()
    unique: list[Path] = []
    for p in all_pdfs:
        k = str(p.resolve())
        if k not in seen:
            seen.add(k)
            unique.append(p)

    route = Counter()
    tail = Counter()
    no_tail = 0
    optifarm_no_tail = 0
    optifarm_with_tail = 0

    for p in unique:
        name = p.name
        route[classify_parser_route(name)] += 1
        h = tail_kind_hint(name)
        r = classify_parser_route(name)
        if h:
            tail[h] += 1
            if r == 'optifarm':
                optifarm_with_tail += 1
        else:
            no_tail += 1
            if r == 'optifarm':
                optifarm_no_tail += 1

    print('=== PDF 파일명 분석 ===')
    print(f'스캔 루트: {[str(r) for r in roots]}')
    print(f'총 PDF: {len(unique)}개\n')

    print('get_parser 경로 (파일명 키워드):')
    for k, v in sorted(route.items()):
        print(f'  {k}: {v}')
    print()

    print('옵티팜형 끝패턴 (혈청|항원|…) 파일명 힌트:')
    for k, v in sorted(tail.items()):
        print(f'  ({k}): {v}')
    print(f'  (패턴 없음): {no_tail}')
    print()
    print('Optifarm 경로만 — 파일명 끝 (혈청)/(항원) 패턴:')
    print(f'  패턴 있음: {optifarm_with_tail} (검사종류별 분리본에 가깝)')
    print(f'  패턴 없음: {optifarm_no_tail} (도드람형 합본·기타 파일명 가능성 — 본문 확인)')
    print()

    if not unique:
        print('PDF가 없습니다. NAS/로컬 검사결과_PDF 경로를 --root 로 지정하세요.')
        return

    print('샘플 (최대 15개):')
    for p in unique[:15]:
        print(f'  [{classify_parser_route(p.name)}] {p.name}')


if __name__ == '__main__':
    main()
