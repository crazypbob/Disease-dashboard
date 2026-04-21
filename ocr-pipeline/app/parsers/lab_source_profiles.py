"""
검사기관별 PDF 묶음(bundling) 메타 — docs/OCR-PARSER-LAB-BUNDLING.md 와 동기화.

get_parser()는 파일명으로 jb5219/전북대만 특정하고, 도드람·옵티팜은 구분하지 않는다.
이 모듈은 설명·로깅·분석 스크립트용 상수와, 파일명으로 가능한 한 분류하는 헬퍼를 제공한다.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Literal

# 전북대 파서와 동일 키워드 (JbnuParser.detect)
JBNU_FILENAME_MARKERS: tuple[str, ...] = ('jb5219', '네스트', '전북대')


class PdfBundlePattern(str, Enum):
    """한 접수·한 농장 결과를 PDF 몇 개로 나누는지에 대한 운영 분류."""

    one_file_all_results = 'one_file_all'  # 항원+항체 등 한 파일 (도드람 합본이 많음)
    split_by_ag_ab = 'split_ag_ab'  # 항원 PDF / 혈청 PDF 등 (옵티팜)
    one_file_per_test = 'one_file_per_test'  # 검사·검사종별 파일 (전북대)


@dataclass(frozen=True)
class LabBundleRule:
    lab_id: str
    label_ko: str
    bundle: PdfBundlePattern
    parser_module: str
    filename_hints: str
    notes: str


# 문서 표와 1:1에 가깝게 유지
LAB_BUNDLE_RULES: tuple[LabBundleRule, ...] = (
    LabBundleRule(
        lab_id='dodram',
        label_ko='도드람',
        bundle=PdfBundlePattern.one_file_all_results,
        parser_module='parsers.optifarm.OptifarmParser',
        filename_hints='전북대 키워드 없음; 합본이면 (혈청)/(항원) 없이 한 파일에 복수 표',
        notes='코드에서 별도 DodramParser 없음. Optifarm 경로로 파싱, 합본 표 로직 의존.',
    ),
    LabBundleRule(
        lab_id='optifarm',
        label_ko='옵티팜',
        bundle=PdfBundlePattern.split_by_ag_ab,
        parser_module='parsers.optifarm.OptifarmParser',
        filename_hints='끝부분 (혈청)|(항원)|(세균)|(염기서열분석) + 접수번호 + 농장',
        notes='검사종류가 파일명에 박혀 한 PDF당 주로 항원 또는 혈청 한 축.',
    ),
    LabBundleRule(
        lab_id='jbnu',
        label_ko='전북대',
        bundle=PdfBundlePattern.one_file_per_test,
        parser_module='parsers.jbnu.JbnuParser',
        filename_hints='jb5219, 네스트, 전북대; 파일명에 검사종류(예: PRRS ELISA, PED PCR)',
        notes='검사별 PDF 분리. jbnu.py 테이블·파일명 타깃.',
    ),
)


def is_jbnu_filename(filename: str) -> bool:
    s = (filename or '').lower()
    return any(k in s for k in JBNU_FILENAME_MARKERS)


def classify_parser_route(filename: str) -> Literal['jbnu', 'optifarm']:
    """get_parser()가 선택하는 경로와 동일한 이진 분류."""
    return 'jbnu' if is_jbnu_filename(filename) else 'optifarm'


def tail_kind_hint(filename: str) -> str | None:
    """옵티팜형 파일명 끝 (혈청)|(항원) 등 — 없으면 None."""
    import re

    m = re.search(
        r'\((혈청|항원|세균|염기서열분석)\)\s*(?:\d{2}-\d+)',
        filename or '',
        re.IGNORECASE,
    )
    return m.group(1).strip() if m else None
