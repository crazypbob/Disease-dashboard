#!/usr/bin/env python3
"""
PDF 폴더 ↔ DB 비교 → DB에 없는 PDF만 OCR input 복사 → OCR → DB import → input 비우기 → results.xlsx 복사

.processed_pdfs.txt 대신 DB의 pdf_file_id와 비교하여 누락분만 처리.
환경변수는 .env.local 에 넣어두면 자동 로드됨.

사용법:
  export SAVE_PATH="X:/질병메일링_대시보드/검사결과_PDF"
  export PDF_BASE_PATH="X:/질병메일링_대시보드/검사결과_PDF"
  export OCR_INPUT_PATH="X:/ocr-pipeline/input"
  export OCR_OUTPUT_PATH="X:/ocr-pipeline/output"
  export OCR_CMD="docker compose -f X:/ocr-pipeline/docker-compose.yml run --rm ocr-pipeline"
  export OCR_WORK_DIR="X:/ocr-pipeline"
  export DASHBOARD_DIR="X:/질병메일링_대시보드/disease-dashboard"

  python scripts/pdf-db-compare-ocr-pipeline.py
  python scripts/pdf-db-compare-ocr-pipeline.py --dry-run
  python scripts/pdf-db-compare-ocr-pipeline.py --all-dates   # 3/23 이전 포함
"""
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

# .env.local 로드 (프로젝트 루트)
_script_dir = Path(__file__).resolve().parent
_env_path = _script_dir.parent / ".env.local"
if _env_path.exists():
    try:
        from dotenv import load_dotenv
        load_dotenv(_env_path)
    except ImportError:
        pass

CUTOFF_DATE_STR = "20260323"
CUTOFF_INT = int(CUTOFF_DATE_STR)

_DEFAULT_SAVE = str(_script_dir.parent / "ocr-pipeline" / "input" / "검사결과_PDF")
SAVE_PATH = os.environ.get("SAVE_PATH", _DEFAULT_SAVE).strip()
PDF_BASE_PATH = os.environ.get("PDF_BASE_PATH", SAVE_PATH).strip()
OCR_INPUT_PATH = os.environ.get("OCR_INPUT_PATH", str(_script_dir.parent / "ocr-pipeline" / "input")).strip()
OCR_OUTPUT_PATH = os.environ.get("OCR_OUTPUT_PATH", str(_script_dir.parent / "ocr-pipeline" / "output")).strip()
OCR_CMD = os.environ.get("OCR_CMD", "").strip()
OCR_WORK_DIR = os.environ.get("OCR_WORK_DIR", ".").strip()
DASHBOARD_DIR = os.environ.get("DASHBOARD_DIR", "").strip()

SCRIPT_DIR = Path(__file__).resolve().parent
DASHBOARD_ROOT = SCRIPT_DIR.parent
LIST_DB_IDS = SCRIPT_DIR / "list-db-pdf-ids.ts"

def _norm(p: str) -> str:
    return str(p or "").replace("\\", "/").rstrip("/").lower()

def _is_project_local_ocr_input(p: str) -> bool:
    try:
        project_local = (SCRIPT_DIR.parent / "ocr-pipeline" / "input").resolve()
        target = Path(p).resolve()
        return _norm(str(target)) == _norm(str(project_local))
    except Exception:
        project_local = _norm(str(SCRIPT_DIR.parent / "ocr-pipeline" / "input"))
        return _norm(p) == project_local


def parse_date_from_filename(name: str) -> int | None:
    m = re.match(r"(\d{8})", name)
    return int(m.group(1)) if m else None


def normalize_path_for_match(p: str) -> str:
    """경로 정규화: 26년/3월/x.pdf → 2026-03/x.pdf, \\ → /"""
    s = p.replace("\\", "/").strip()
    # NN년/N월/... → YYYY-MM/...
    m = re.match(r"(\d{2})년/(\d{1,2})월/(.+)", s)
    if m:
        y, mon, rest = m.group(1), m.group(2), m.group(3)
        year = 2000 + int(y) if int(y) < 50 else 1900 + int(y)
        s = f"{year}-{int(mon):02d}/{rest}"
    return s.lower()


def get_db_pdf_ids() -> set[str]:
    """DB에 등록된 pdf_file_id 집합 (정규화된 경로)"""
    if not (DASHBOARD_ROOT / "lib" / "db.ts").exists():
        print("  lib/db.ts 없음, DB 조회 스킵", file=sys.stderr)
        return set()
    try:
        script_path = str(LIST_DB_IDS.resolve())
        cmd = f'npx tsx "{script_path}"'
        out = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            shell=True,
            cwd=str(DASHBOARD_ROOT),
            timeout=30,
        )
        if out.returncode != 0:
            err = (out.stderr or "").strip()
            if err:
                print(f"  DB 조회 실패: {err[:200]}", file=sys.stderr)
            return set()
        stdout = (out.stdout or "").strip()
        ids = {normalize_path_for_match(ln) for ln in stdout.splitlines() if ln.strip()}
        return ids
    except Exception as e:
        print(f"  DB 조회 오류: {e}", file=sys.stderr)
        return set()


def main():
    dry_run = "--dry-run" in sys.argv
    all_dates = "--all-dates" in sys.argv
    require_project_local = "--require-project-local" in sys.argv

    if dry_run:
        print("[--dry-run] 시뮬레이션만")
    if require_project_local:
        print("[--require-project-local] OCR_INPUT_PATH가 프로젝트 로컬이 아니면 중단")

    print("\n[경로] SAVE_PATH:", SAVE_PATH)
    print("[경로] PDF_BASE_PATH:", PDF_BASE_PATH)
    print("[경로] OCR_INPUT_PATH:", OCR_INPUT_PATH)
    print("[경로] OCR_OUTPUT_PATH:", OCR_OUTPUT_PATH)
    print("[경로] OCR_WORK_DIR:", OCR_WORK_DIR)
    if OCR_CMD:
        print("[명령] OCR_CMD:", OCR_CMD)
    if DASHBOARD_DIR:
        print("[경로] DASHBOARD_DIR:", DASHBOARD_DIR)

    if require_project_local and not _is_project_local_ocr_input(OCR_INPUT_PATH):
        print(f"  OCR_INPUT_PATH가 프로젝트 로컬이 아닙니다: {OCR_INPUT_PATH}", file=sys.stderr)
        print("  (PC에서 NAS docker 볼륨 경로로 복사되는 사고 방지용)", file=sys.stderr)
        sys.exit(2)

    # 1. DB에 등록된 pdf 경로 수집
    print("\n[1/6] DB pdf_file_id 조회")
    db_ids = get_db_pdf_ids()
    print(f"  DB 등록 PDF: {len(db_ids)}개")

    # 2. PDF 폴더에서 DB에 없는 파일만 수집
    print("\n[2/6] PDF 폴더 ↔ DB 비교 (누락분 수집)")
    to_copy: list[tuple[str, str]] = []  # (full_path, rel_path)
    if not os.path.isdir(SAVE_PATH):
        print(f"  SAVE_PATH 없음: {SAVE_PATH}")
    else:
        for root, _dirs, files in os.walk(SAVE_PATH):
            for f in files:
                if not f.lower().endswith(".pdf"):
                    continue
                date_val = parse_date_from_filename(f)
                if date_val is None:
                    continue
                if not all_dates and date_val < CUTOFF_INT:
                    continue
                full = os.path.join(root, f)
                rel = os.path.relpath(full, SAVE_PATH).replace("\\", "/")
                norm = normalize_path_for_match(rel)
                if norm in db_ids:
                    continue
                to_copy.append((full, rel))
        print(f"  DB 미등록 PDF: {len(to_copy)}개")

    if not to_copy:
        print("\n처리할 PDF 없음 (모두 DB 등록됨)")
        return

    # 3. OCR input으로 복사
    print("\n[3/6] OCR input으로 복사")
    os.makedirs(OCR_INPUT_PATH, exist_ok=True)
    copied = 0
    for full, rel in to_copy:
        fname = os.path.basename(full)
        dest = os.path.join(OCR_INPUT_PATH, fname)
        if dry_run:
            print(f"  [복사예정] {rel}")
            copied += 1
        else:
            try:
                shutil.copy2(full, dest)
                copied += 1
                if copied <= 5 or copied % 500 == 0:
                    print(f"  복사: {fname[:60]}...")
            except OSError as e:
                print(f"  복사 실패 {full}: {e}", file=sys.stderr)
    print(f"  → {copied}개 복사")

    # 4. OCR 실행
    print("\n[4/6] OCR 실행")
    if not OCR_CMD:
        print("  OCR_CMD 미설정")
        if not dry_run:
            sys.exit(1)
    elif dry_run:
        print(f"  [실행예정] {OCR_CMD}")
    else:
        try:
            subprocess.run(OCR_CMD, shell=True, check=True, cwd=OCR_WORK_DIR)
        except subprocess.CalledProcessError as e:
            print(f"  OCR 실패: {e}", file=sys.stderr)
            sys.exit(1)

    # 5. results.xlsx → DB import
    print("\n[5/6] results.xlsx → DB import")
    xlsx_path = None
    for name in ("results.xlsx", "result.xlsx"):
        p = os.path.join(OCR_OUTPUT_PATH, name)
        if os.path.exists(p):
            xlsx_path = p
            break
    if not xlsx_path:
        print(f"  results.xlsx 없음: {OCR_OUTPUT_PATH}/")
        if not dry_run:
            sys.exit(1)
    else:
        dash = DASHBOARD_DIR or str(DASHBOARD_ROOT)
        cwd = dash
        if os.name == "nt" and (dash.startswith("\\\\") or dash.startswith("//")):
            cwd = os.getcwd()
        import_cmd = f"npx tsx scripts/import-ocr-results.ts --file={xlsx_path}"
        if dry_run:
            print(f"  [실행예정] {import_cmd}")
        else:
            try:
                subprocess.run(import_cmd, shell=True, check=True, cwd=cwd)
                print("  import 완료")
            except subprocess.CalledProcessError as e:
                print(f"  import 실패: {e}", file=sys.stderr)
                sys.exit(1)

    # 6. input 폴더 비우기 + results.xlsx → scripts 복사
    print("\n[6/6] input 비우기, results.xlsx 복사")
    if not dry_run and os.path.isdir(OCR_INPUT_PATH):
        removed = 0
        for f in os.listdir(OCR_INPUT_PATH):
            if f.lower().endswith(".pdf"):
                try:
                    os.remove(os.path.join(OCR_INPUT_PATH, f))
                    removed += 1
                except OSError:
                    pass
        if removed:
            print(f"  input 정리: {removed}개 PDF 제거")

    dst_xlsx = SCRIPT_DIR / "results.xlsx"
    if xlsx_path and os.path.exists(xlsx_path):
        if dry_run:
            print(f"  [복사예정] {xlsx_path} → {dst_xlsx}")
        else:
            shutil.copy2(xlsx_path, dst_xlsx)
            print(f"  results.xlsx → scripts/results.xlsx")

    print("\n파이프라인 완료")


if __name__ == "__main__":
    main()
