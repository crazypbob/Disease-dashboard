"""
리포트 파서 모듈 - parser.py (호환 shim)
실제 로직은 parsers/ 패키지로 이동.
기존 main.py와의 호환을 위해 parse_report() 인터페이스를 유지합니다.
"""
from parsers import get_parser


def parse_report(text: str, filename: str, pdf_path=None) -> dict:
    """파일명 기반으로 적절한 파서를 선택하여 리포트 파싱"""
    parser = get_parser(filename)
    return parser.parse_report(text, filename, pdf_path=pdf_path)


# parse_filename도 호환용으로 제공
def parse_filename(filename: str) -> dict:
    parser = get_parser(filename)
    return parser.parse_filename(filename)
