"""
베이스 파서 클래스 — 공통 인터페이스 + 공유 결과 파서
모든 검사기관 파서는 이 클래스를 상속합니다.
"""
import re
from abc import ABC, abstractmethod
from datetime import datetime


# ─────────────────────────────────────────
# OCR 텍스트에서 보조 정보 추출 패턴
# ─────────────────────────────────────────
FARM_IN_TEXT_PATTERNS = [
    r'농장정보\s*[：:\s]+\s*([^\n\r(]+)',
    r'농장명\s*[：:\s]+\s*([^\n\r]+)',
    r'의뢰기관\s*[：:\s]+\s*([^\n\r]+)',
    r'의뢰자\s*[：:\s]+\s*([^\n\r]+)',
    r'검체명\s*[：:\s]+\s*([^\n\r]+)',
    r'농장\s*[：:\s]+\s*([^\n\r]+)',
]

DATE_IN_TEXT_PATTERNS = [
    r'접수일자\s*[：:\s]*(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일',
    r'접수일\s*[：:\s]*(\d{4})[-./](\d{1,2})[-./](\d{1,2})',
    r'(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일',
]

# 결과 매칭 공통 패턴
_RESULT_MATCH = r'(양성|음성|검출|Positive|Negative|불검출)'
_FLEXIBLE_BETWEEN = r'[\w\s\-\._:：]*?'


# ─────────────────────────────────────────
# 공통 유틸
# ─────────────────────────────────────────
def _find(pattern, text, group=1, default=''):
    m = re.search(pattern, text, re.IGNORECASE)
    return m.group(group).strip() if m else default


def _extract_farm_from_ocr(text: str) -> str:
    if not text:
        return ''
    for pat in FARM_IN_TEXT_PATTERNS:
        m = re.search(pat, text)
        if m:
            name = m.group(1).strip()
            if name and len(name) <= 30 and not name.startswith('http'):
                return name
    return ''


def _extract_date_from_ocr(text: str) -> str:
    if not text:
        return ''
    for pat in DATE_IN_TEXT_PATTERNS:
        m = re.search(pat, text)
        if m:
            y, mo, d = m.group(1), m.group(2), m.group(3)
            return f'{y}-{mo.zfill(2)}-{d.zfill(2)}'
    return ''


def format_date(date_str: str) -> str:
    """YYYYMMDD → YYYY-MM-DD 변환"""
    try:
        return datetime.strptime(date_str, '%Y%m%d').strftime('%Y-%m-%d')
    except ValueError:
        return date_str


# ─────────────────────────────────────────
# 공유 결과 파서
# ─────────────────────────────────────────
def _find_prrs_result(text: str) -> str:
    """PRRS 항원: 전북대 결과(NA)/결과(EU) 형식 우선, 일반 PRRS 패턴 fallback"""
    m = re.search(r'결과\s*\([NE][AU]\)[^\n]*(양성|검출|음성|불검출)', text, re.I)
    if m:
        return m.group(1).strip()
    m = re.search(rf'PRRS{_FLEXIBLE_BETWEEN}{_RESULT_MATCH}', text, re.I)
    return m.group(1).strip() if m else ''


def parse_antigen(text: str) -> dict:
    prrs = _find_prrs_result(text) or _find(rf'PRRS{_FLEXIBLE_BETWEEN}{_RESULT_MATCH}', text)
    return {
        'PRRS_결과':   prrs,
        'PED_결과':    _find(rf'PED(?![V]){_FLEXIBLE_BETWEEN}{_RESULT_MATCH}', text),
        'PEDV_결과':   _find(rf'PEDV{_FLEXIBLE_BETWEEN}{_RESULT_MATCH}', text),
        'TGE_결과':    _find(rf'TGE{_FLEXIBLE_BETWEEN}{_RESULT_MATCH}', text),
        # HPS(Haemophilus parasuis, 글래서씨병): "HPS 항원 검사 결과서" 등
        'HPS_결과':    _find(
            rf'(?:\bHPS\b|Haemophilus\s*parasuis|H\.?\s*parasuis){_FLEXIBLE_BETWEEN}{_RESULT_MATCH}',
            text,
        ),
        # 호흡기(옵티팜 등): MH/APP PCR
        # - MH: Mycoplasma hyopneumoniae (표기: MH, Mycoplasma hyopneumoniae, M. hyopneumoniae)
        # - MHR: Mycoplasma hyorhinis (표기: MHR, Mycoplasma hyorhinis, M. hyorhinis)
        # - APP: Actinobacillus pleuropneumoniae (표기: APP, Actinobacillus pleuropneumoniae)
        'MH_결과':     _find(rf'(?:\bMH\b|Mycoplasma\s*hyopneumoniae|M\.?\s*hyopneumoniae){_FLEXIBLE_BETWEEN}{_RESULT_MATCH}', text),
        'MHR_결과':    _find(rf'(?:\bMHR\b|Mycoplasma\s*hyorhinis|M\.?\s*hyorhinis){_FLEXIBLE_BETWEEN}{_RESULT_MATCH}', text),
        'APP_결과':    _find(rf'(?:\bAPP\b|Actinobacillus\s*pleuropneumoniae|A\.?\s*pleuropneumoniae){_FLEXIBLE_BETWEEN}{_RESULT_MATCH}', text),
        '비고':        _find(r'비고[：:]\s*([^\n]+)', text),
    }


def _normalize_prrs_elisa_cell(val: str) -> str:
    """
    도드람 등 통보서: 측정값 + 판정 열 '(+)' / '(-)' / '(?)' → 한글 판정으로 통일 (import·표시 일관).
    숫자만 있으면 그대로 둠(S/P 임계 판정은 import 단계).
    """
    if not val:
        return val
    s = val.strip()
    m = re.search(r'(-?\d+\.?\d*)\s*\(\s*([+?-])\s*\)', s)
    if m:
        judge = m.group(2)
        if judge == '-':
            return '음성'
        if judge == '+':
            return '양성'
        if judge == '?':
            return '의심'
    return s


def strip_serum_criteria_footer(text: str) -> str:
    """
    혈청서 하단 '양성판정기준 … S/P ratio 0.4 이상' 등 참조 문구가
    OCR 순서상 본표 S/P보다 먼저 나오면 parse_serum()이 첫 실수(0.4)를
    PRRS 항체로 잡는 오류가 난다. '양성판정기준' 이후는 잘라낸다.
    """
    if not text or '양성판정기준' not in text:
        return text
    return text.split('양성판정기준', 1)[0]


def parse_serum(text: str) -> dict:
    # 한글 헤더(검사항목 등)가 PRRS와 S/P 사이에 있을 수 있음 — ASCII만 허용하면 매칭 실패
    prrs_raw = _find(r'PRRS[\s\S]{0,800}?(-?\d+\.?\d*(?:\s*\([^)]+\))?)', text)
    prrs = _normalize_prrs_elisa_cell(prrs_raw) if prrs_raw else prrs_raw
    return {
        'PRRS_항체':   prrs,
        'PCV2_항체':   _find(r'PCV2[a-zA-Z\s\d\_-]*?([\d.]+)', text),
        'APP_항체':    _find(r'APP[a-zA-Z\s\d\_-]*?([\d.]+)', text),
        'Myco_항체':   _find(r'Myco[a-zA-Z\s\d\_-]*?([\d.]+)', text),
        '비고':        _find(r'비고[：:]\s*([^\n]+)', text),
    }


def parse_bacteria(text: str) -> dict:
    return {
        '세균수':      _find(r'세균수[^\n]*?([\d,]+)', text),
        '대장균수':    _find(r'대장균[^\n]*?([\d,]+)', text),
        '검출균':      _find(r'검출[^\n]*?[：:]\s*([^\n]+)', text),
        '비고':        _find(r'비고[：:]\s*([^\n]+)', text),
    }


def parse_sequence(text: str) -> dict:
    return {
        '분석결과':    _find(r'분석[결과]?[：:]\s*([^\n]+)', text),
        '유전형':      _find(r'유전형[：:]\s*([^\n]+)', text),
        '상동성':      _find(r'상동성[：:]\s*([\d.]+%?)', text),
        '비고':        _find(r'비고[：:]\s*([^\n]+)', text),
    }


RESULT_PARSERS = {
    '항원': parse_antigen,
    '혈청': parse_serum,
    '세균': parse_bacteria,
    '염기': parse_sequence,
}


# ─────────────────────────────────────────
# 베이스 파서 클래스
# ─────────────────────────────────────────
class BaseParser(ABC):

    @classmethod
    @abstractmethod
    def detect(cls, filename: str) -> bool:
        """이 파서가 해당 파일을 처리할 수 있는지 판단"""
        ...

    @abstractmethod
    def parse_filename(self, filename: str) -> dict:
        """파일명에서 메타데이터 추출: {날짜, 검사종류, 접수번호, 농장명}"""
        ...

    def preprocess_image(self, image):
        """OCR 전 이미지 전처리. 기본: 변경 없음. 서브클래스에서 오버라이드."""
        return image

    def get_ocr_dpi(self) -> int:
        """Tesseract OCR DPI. 기본 300."""
        return 300

    def is_multi_page_skip_first(self) -> bool:
        """2페이지 이상 PDF에서 1페이지를 건너뛸지 여부. 기본 False."""
        return False

    def parse_report(self, text: str, filename: str, pdf_path=None) -> dict:
        """
        공통 파싱 흐름: 파일명 메타 → OCR 보완 → 결과 추출
        pdf_path: PDF 파일 경로 (테이블 추출 등 추가 처리용, 서브클래스에서 사용)
        """
        combined_text = filename + "\n" + text

        meta = self.parse_filename(filename)
        검사종류 = meta.get('검사종류', '')

        # OCR 텍스트에서 누락된 메타 보완
        if not meta.get('날짜') and text:
            date_from_text = _extract_date_from_ocr(text)
            if date_from_text:
                meta['날짜'] = date_from_text

        if not meta.get('농장명') and text:
            farm = _extract_farm_from_ocr(text)
            if farm:
                meta['농장명'] = farm

        if not 검사종류 and text:
            # 파일명에 검사종류가 없을 때: 본문에 PRRS ELISA + 염기서열분석이 같이 있으면 염기(유전자) 우선
            if re.search(
                r'염기서열|염기서\s*열분석|유전자\s*분석|서열\s*분석|q?PCR\s*염기',
                text,
                re.I,
            ):
                검사종류 = '염기서열분석'
            # "Mycoplasma type 항원 검사", "HPS 항원 검사 결과서" 등 PRRS가 없어도 항원으로 분류돼야 한다.
            elif re.search(r'PRRSV?\s*항원|항원\s*검사', text, re.I):
                검사종류 = '항원'
            elif re.search(r'PRRSV?\s*항체|혈청\s*검사\s*결과', text, re.I):
                검사종류 = '혈청'
            elif re.search(r'세균', text):
                검사종류 = '세균'
            if 검사종류:
                meta['검사종류'] = 검사종류

        # 검사종류에 맞는 결과 파서 실행
        parser_fn = None
        for key, fn in RESULT_PARSERS.items():
            if key in 검사종류:
                parser_fn = fn
                break

        detail = parser_fn(combined_text) if parser_fn else {'추출결과_오류': combined_text[:100]}

        # 긴 파일명 엑셀 출력 시 간략화
        short_filename = (filename[:50] + '...') if len(filename) > 50 else filename

        return {
            '파일명':   short_filename,
            **meta,
            'OCR_미리보기': text[:100].replace('\n', ' ') if text else combined_text[:100].replace('\n', ' '),
            **detail,
        }

    def extract_titer_rows(self, parsed_row: dict, filename: str, pdf_path=None) -> list:
        """
        항체가 표본(10~50두) 레코드를 추출.
        반환 형태는 ocr-pipeline/app/main.py의 titer_rows와 동일한 dict 리스트.
        기본 구현은 빈 배열이며, 기관별 파서에서 오버라이드.
        """
        return []
