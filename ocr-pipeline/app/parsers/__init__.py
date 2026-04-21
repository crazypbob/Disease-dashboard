"""
파서 팩토리 — 파일명 기반으로 적절한 파서 인스턴스 반환
향후 새 검사기관 추가 시 _PARSERS 리스트에 클래스만 추가하면 됨

검사기관별로 PDF를 한 파일에 몰아 넣는지·항원/혈청으로 나누는지·검사마다 파일을 나누는지는
운영 규칙으로 docs/OCR-PARSER-LAB-BUNDLING.md · parsers/lab_source_profiles.py 참고.
(도드람 합본 / 옵티팜 항원·항체 분리 / 전북대 검사별 분리)
"""
from .base import BaseParser
from .jbnu import JbnuParser
from .optifarm import OptifarmParser

# 우선순위 순서: 전북대 먼저 체크 (키워드 매칭), 나머지는 옵티팜
_PARSERS = [JbnuParser, OptifarmParser]


def get_parser(filename: str) -> BaseParser:
    """파일명으로 적절한 파서를 선택하여 반환"""
    for cls in _PARSERS:
        if cls.detect(filename):
            return cls()
    return OptifarmParser()
