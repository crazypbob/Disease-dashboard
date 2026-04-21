"""
PDF 배치 OCR 파이프라인 - main.py
PDF 파일을 Tesseract OCR로 텍스트 추출하고 파싱하여 Excel로 저장
"""
import os
import sys
import logging
from pathlib import Path
from tqdm import tqdm
import pandas as pd

from ocr import extract_text_from_pdf
from parsers import get_parser

# 환경에 따른 루트 디렉토리 설정 (Docker 내부이면 /app 이 루트)
_APP_DIR = Path(__file__).resolve().parent
# 도커 내부(/app/main.py)면 parent가 / 이므로 _APP_DIR 자체가 루트 역할 수행
if str(_APP_DIR) == '/app':
    _ROOT = Path('/app')
else:
    _ROOT = _APP_DIR.parent

INPUT_DIR  = Path(os.getenv('OCR_INPUT_PATH', str(_ROOT / 'input')))
OUTPUT_DIR = Path(os.getenv('OCR_OUTPUT_PATH', str(_ROOT / 'output')))
OUTPUT_FORMAT = os.getenv('OUTPUT_FORMAT', 'excel')  # excel 또는 csv

# 로그를 남길 출력 폴더 생성 보장
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(str(OUTPUT_DIR / 'ocr_pipeline.log'), encoding='utf-8')
    ]
)
log = logging.getLogger(__name__)


def run():
    pdf_files = sorted(list(INPUT_DIR.rglob('*.pdf')))
    if not pdf_files:
        log.warning(f"입력 폴더에 PDF가 없습니다: {INPUT_DIR}")
        return

    out_path = OUTPUT_DIR / ('results.xlsx' if OUTPUT_FORMAT == 'excel' else 'result.csv')
    
    # 기존 처리된 파일 목록 로드
    processed_names = set()
    existing_df = None
    existing_errors = None

    if out_path.exists():
        try:
            if OUTPUT_FORMAT == 'excel':
                existing_df = pd.read_excel(out_path, sheet_name='결과')
                try:
                    existing_errors = pd.read_excel(out_path, sheet_name='오류목록')
                except ValueError:
                    existing_errors = None
            else:
                existing_df = pd.read_csv(out_path)
                
            if '파일명' in existing_df.columns:
                processed_names = set(existing_df['파일명'].dropna().astype(str))
                log.info(f"기존 결과에서 {len(processed_names)}개 기록 로드됨 (건너뜀)")
        except Exception as e:
            log.warning(f"기존 결과 로드 오류 (무시하고 새로 작성): {e}")

    # 처리 대상 필터링 (parser.py의 short_filename 로직과 동일하게 맞춤)
    new_pdfs = []
    for p in pdf_files:
        short_name = (p.name[:50] + '...') if len(p.name) > 50 else p.name
        if short_name not in processed_names:
            new_pdfs.append(p)

    if not new_pdfs:
        log.info("모든 PDF가 이미 처리되었습니다. 새로 변환할 파일이 없습니다.")
        return

    log.info(f"총 {len(pdf_files)}개 중 새로 추가된 {len(new_pdfs)}개 PDF 처리 시작")
    results = []
    titer_rows = []
    errors  = []

    for pdf_path in tqdm(new_pdfs, desc="OCR 처리 중"):
        try:
            parser = get_parser(pdf_path.name)
            text = extract_text_from_pdf(pdf_path, parser)
            row  = parser.parse_report(text, pdf_path.name, pdf_path=pdf_path)
            results.append(row)

            # ─────────────────────────────────────────
            # 항체가(표본) 추출: 같은 폴더를 훑되, 파일별로 '항체가 PDF'면 별도 시트에 누적
            # - 기관별 파서가 extract_titer_rows()를 제공하면 그 결과를 누적한다.
            # ─────────────────────────────────────────
            try:
                if hasattr(parser, 'extract_titer_rows'):
                    for r in parser.extract_titer_rows(row, pdf_path.name, pdf_path=pdf_path) or []:
                        titer_rows.append(r)
            except Exception as te:
                # 항체가 추출 실패는 전체 OCR 실패로 취급하지 않음(오류목록에만 남김)
                errors.append({'파일명': pdf_path.name, '오류': f'[titer-extract] {str(te)}'})

            log.info(f"[OK] [{parser.__class__.__name__}] {pdf_path.name}")
        except Exception as e:
            log.error(f"[ERR] {pdf_path.name}: {e}")
            errors.append({'파일명': pdf_path.name, '오류': str(e)})

    # 새로운 결과 합치기
    new_df = pd.DataFrame(results)
    if existing_df is not None and not existing_df.empty:
        df = pd.concat([existing_df, new_df], ignore_index=True)
    else:
        df = new_df

    new_errors_df = pd.DataFrame(errors)
    if existing_errors is not None and not existing_errors.empty:
        errors_df = pd.concat([existing_errors, new_errors_df], ignore_index=True)
    else:
        errors_df = new_errors_df

    # 결과 저장
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    if OUTPUT_FORMAT == 'excel':
        with pd.ExcelWriter(out_path, engine='openpyxl') as writer:
            df.to_excel(writer, sheet_name='결과', index=False)
            if titer_rows:
                pd.DataFrame(titer_rows).to_excel(writer, sheet_name='항체가', index=False)
            if not errors_df.empty:
                errors_df.to_excel(writer, sheet_name='오류목록', index=False)
    else:
        df.to_csv(out_path, index=False, encoding='utf-8-sig')

    log.info(f"완료! 결과 파일: {out_path}")
    log.info(f"성공: {len(results)}개 / 실패: {len(errors)}개")


if __name__ == '__main__':
    run()
