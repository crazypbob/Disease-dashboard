"""
OCR 엔진 모듈 - ocr.py
PDF → 텍스트 추출 (디지털 PDF는 pdfplumber, 스캔본은 Tesseract 사용)
파서 객체를 받아 파서별 전처리/DPI/페이지 스킵 적용
"""
import pytesseract
import pdfplumber
from pdf2image import convert_from_path
from pathlib import Path
import os
import logging

log = logging.getLogger(__name__)
OCR_LANG = os.getenv('OCR_LANG', 'kor+eng')


def extract_text_from_pdf(pdf_path: Path, parser=None) -> str:
    """
    PDF에서 텍스트 추출.
    1) pdfplumber로 텍스트 레이어 시도 (디지털 PDF, 빠름)
    2) 텍스트가 거의 없으면 Tesseract OCR로 폴백 (스캔본)

    parser가 전달되면:
    - parser.is_multi_page_skip_first(): 2페이지 PDF에서 1장 건너뛰기
    - parser.preprocess_image(): OCR 전 이미지 전처리
    - parser.get_ocr_dpi(): Tesseract DPI 설정
    """
    skip_first = parser.is_multi_page_skip_first() if parser else False

    text = _extract_with_pdfplumber(pdf_path, skip_first)

    # 텍스트가 충분하면 디지털 PDF로 판단
    if len(text.strip()) > 100:
        return text

    # 텍스트가 부족하면 → Tesseract OCR
    dpi = parser.get_ocr_dpi() if parser else 300
    preprocessor = parser.preprocess_image if parser else None
    return _extract_with_tesseract(pdf_path, skip_first, dpi, preprocessor)


def extract_tables_from_pdf(pdf_path: Path, page_indices: list = None) -> list:
    """
    pdfplumber로 PDF의 테이블을 구조적으로 추출.
    각 테이블은 2D list (행 × 열).

    Args:
        pdf_path: PDF 파일 경로
        page_indices: 추출할 페이지 인덱스 목록 (0-based). None이면 전체.

    Returns:
        list of tables, 각 table은 list[list[str]]
    """
    all_tables = []
    try:
        with pdfplumber.open(pdf_path) as pdf:
            pages_to_check = pdf.pages
            if page_indices:
                pages_to_check = [pdf.pages[i] for i in page_indices if i < len(pdf.pages)]

            for page in pages_to_check:
                tables = page.extract_tables() or []
                for table in tables:
                    # None → '' 치환
                    cleaned = []
                    for row in table:
                        cleaned.append([cell.strip() if cell else '' for cell in row])
                    all_tables.append(cleaned)
    except Exception as e:
        log.warning(f"테이블 추출 실패: {pdf_path.name}: {e}")
    return all_tables


def extract_all_pages_text(pdf_path: Path) -> list:
    """
    모든 페이지의 텍스트를 개별 리스트로 반환.
    Returns: ['page1 text', 'page2 text', ...]
    """
    try:
        with pdfplumber.open(pdf_path) as pdf:
            return [page.extract_text() or '' for page in pdf.pages]
    except Exception:
        return []


def _extract_with_pdfplumber(pdf_path: Path, skip_first: bool = False) -> str:
    try:
        with pdfplumber.open(pdf_path) as pdf:
            pages = [page.extract_text() or '' for page in pdf.pages]
            if len(pages) >= 2 and skip_first:
                return pages[1]
            return '\n'.join(pages)
    except Exception:
        return ''


def _extract_with_tesseract(
    pdf_path: Path,
    skip_first: bool = False,
    dpi: int = 300,
    preprocessor=None
) -> str:
    """PDF → 이미지 변환 → (전처리) → Tesseract OCR"""
    images = convert_from_path(str(pdf_path), dpi=dpi)

    if len(images) >= 2 and skip_first:
        img = images[1]
        if preprocessor:
            img = preprocessor(img)
        return pytesseract.image_to_string(img, lang=OCR_LANG)

    texts = []
    for img in images:
        if preprocessor:
            img = preprocessor(img)
        texts.append(pytesseract.image_to_string(img, lang=OCR_LANG))
    return '\n'.join(texts)
