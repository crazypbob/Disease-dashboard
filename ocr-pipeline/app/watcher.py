"""
파일 감시 모듈 - watcher.py
watchdog 라이브러리로 /app/input/ 폴더를 감시하여
새 PDF 파일 감지 시 자동으로 OCR + 파싱 + results.xlsx 저장
"""
import os
import sys
import time
import logging
from pathlib import Path
from threading import Timer
import hashlib

from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

from ocr import extract_text_from_pdf
from parsers import get_parser

import pandas as pd
import psycopg

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(str((Path(__file__).resolve().parent.parent / 'output' / 'ocr_pipeline.log')), encoding='utf-8')
    ]
)
log = logging.getLogger(__name__)

_ROOT = Path(__file__).resolve().parent.parent
INPUT_DIR  = Path(os.getenv('OCR_INPUT_PATH', str(_ROOT / 'input')))
OUTPUT_DIR = Path(os.getenv('OCR_OUTPUT_PATH', str(_ROOT / 'output')))
OUTPUT_PATH = OUTPUT_DIR / 'results.xlsx'

# 파일 쓰기 완료 대기 시간 (초)
STABILIZE_DELAY = 3.0


def _get_database_url() -> str:
    url = os.getenv('DATABASE_URL', '').strip()
    if not url:
        raise RuntimeError('DATABASE_URL is required for DB dedupe mode')
    return url


def _compute_pdf_file_id(pdf_path: Path) -> str:
    """
    pdfFileId: parsed_files.id에 저장될 안정적인 키
    - 파일 내용 기반 sha256(권장): 파일명이 바뀌어도 동일 파일이면 동일 키
    """
    h = hashlib.sha256()
    with open(pdf_path, 'rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return 'sha256:' + h.hexdigest()


def _db_has_parsed(pdf_file_id: str) -> bool:
    db_url = _get_database_url()
    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM parsed_files WHERE id = %s LIMIT 1", (pdf_file_id,))
            return cur.fetchone() is not None


def _db_mark_parsed(pdf_file_id: str) -> None:
    db_url = _get_database_url()
    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO parsed_files (id) VALUES (%s) ON CONFLICT (id) DO NOTHING",
                (pdf_file_id,),
            )
        conn.commit()


class PDFHandler(FileSystemEventHandler):
    """PDF 파일 생성/이동 감지 핸들러"""

    def __init__(self):
        super().__init__()
        self._timers = {}  # 파일별 디바운스 타이머

    def on_created(self, event):
        self._schedule(event.src_path)

    def on_moved(self, event):
        self._schedule(event.dest_path)

    def _schedule(self, filepath):
        """파일 쓰기 완료 대기 후 처리 (디바운스)"""
        path = Path(filepath)
        if path.suffix.lower() != '.pdf':
            return

        key = str(path)
        # 기존 타이머 취소 (파일이 아직 쓰기 중일 수 있음)
        if key in self._timers:
            self._timers[key].cancel()

        timer = Timer(STABILIZE_DELAY, self._process, args=[path])
        self._timers[key] = timer
        timer.start()

    def _process(self, pdf_path: Path):
        """단일 PDF 파일 처리: OCR → 파싱 → results.xlsx에 append"""
        key = str(pdf_path)
        self._timers.pop(key, None)

        if not pdf_path.exists():
            return

        # DB 기준으로 이미 처리된 파일인지 확인 (idempotent)
        try:
            pdf_file_id = _compute_pdf_file_id(pdf_path)
            if _db_has_parsed(pdf_file_id):
                log.info(f"[SKIP] DB에 이미 처리됨: {pdf_path.name} ({pdf_file_id})")
                return
        except Exception as e:
            log.error(f"[ERR] DB 중복 확인 실패: {pdf_path.name}: {e}")
            # DB 확인이 불가하면 안전하게 처리하지 않고 스킵 (중복/오염 방지)
            return

        log.info(f"[NEW] 새 PDF 감지: {pdf_path.name}")

        try:
            parser = get_parser(pdf_path.name)
            text = extract_text_from_pdf(pdf_path, parser)
            row = parser.parse_report(text, pdf_path.name, pdf_path=pdf_path)

            self._append_to_excel(row)
            _db_mark_parsed(pdf_file_id)
            log.info(f"[OK] [{parser.__class__.__name__}] {pdf_path.name}")

        except Exception as e:
            log.error(f"[ERR] {pdf_path.name}: {e}")
            self._append_error(pdf_path.name, str(e))

    def _append_to_excel(self, row: dict):
        """results.xlsx에 새 행 추가"""
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

        existing_df = None
        existing_errors = None

        if OUTPUT_PATH.exists():
            try:
                existing_df = pd.read_excel(OUTPUT_PATH, sheet_name='결과')
                try:
                    existing_errors = pd.read_excel(OUTPUT_PATH, sheet_name='오류목록')
                except ValueError:
                    pass
            except Exception:
                pass

        new_row = pd.DataFrame([row])
        if existing_df is not None and not existing_df.empty:
            df = pd.concat([existing_df, new_row], ignore_index=True)
        else:
            df = new_row

        with pd.ExcelWriter(OUTPUT_PATH, engine='openpyxl') as writer:
            df.to_excel(writer, sheet_name='결과', index=False)
            if existing_errors is not None and not existing_errors.empty:
                existing_errors.to_excel(writer, sheet_name='오류목록', index=False)

    def _append_error(self, filename: str, error: str):
        """오류 기록 추가"""
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

        existing_df = None
        existing_errors = None

        if OUTPUT_PATH.exists():
            try:
                existing_df = pd.read_excel(OUTPUT_PATH, sheet_name='결과')
                try:
                    existing_errors = pd.read_excel(OUTPUT_PATH, sheet_name='오류목록')
                except ValueError:
                    pass
            except Exception:
                pass

        new_error = pd.DataFrame([{'파일명': filename, '오류': error}])
        if existing_errors is not None and not existing_errors.empty:
            errors_df = pd.concat([existing_errors, new_error], ignore_index=True)
        else:
            errors_df = new_error

        with pd.ExcelWriter(OUTPUT_PATH, engine='openpyxl') as writer:
            if existing_df is not None and not existing_df.empty:
                existing_df.to_excel(writer, sheet_name='결과', index=False)
            else:
                pd.DataFrame().to_excel(writer, sheet_name='결과', index=False)
            errors_df.to_excel(writer, sheet_name='오류목록', index=False)


def main():
    log.info(f"파일 감시 모드 시작: {INPUT_DIR}")
    log.info("PDF 파일이 추가되면 자동으로 OCR + 파싱합니다.")

    # 기존 미처리 파일 먼저 배치 처리
    log.info("기존 미처리 파일 확인 중...")
    from main import run as batch_run
    batch_run()

    # watchdog 감시 시작
    handler = PDFHandler()
    observer = Observer()
    observer.schedule(handler, str(INPUT_DIR), recursive=True)
    observer.start()

    log.info(f"감시 중... (Ctrl+C로 종료)")

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
        log.info("파일 감시 종료")

    observer.join()


if __name__ == '__main__':
    main()
