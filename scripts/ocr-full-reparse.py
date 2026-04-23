#!/usr/bin/env python3
"""
전체 PDF 재파싱 (기존 결과 무시, 전북대 등 오류 수정된 parser 적용)

input/검사결과_PDF 내 모든 PDF를 OCR로 새로 파싱하고, DB에 반영.
--replace 시 기존 레코드도 새 결과로 덮어씀.

사용법:
  # 환경변수 (.env.local 또는 export)
  # OCR_INPUT_PATH: input 폴더 (기본 ocr-pipeline/input)
  # OCR_OUTPUT_PATH: output 폴더
  # OCR_CMD, OCR_WORK_DIR: Docker 실행
  # DASHBOARD_DIR: 프로젝트 경로

  python scripts/ocr-full-reparse.py              # OCR 전체 실행 → import
  python3 scripts/ocr-full-reparse.py --replace    # 기존 DB 레코드도 새 결과로 업데이트
  python3 scripts/ocr-full-reparse.py --dry-run    # 시뮬레이션만

  NAS: OCR_CMD 등은 `set -a; . ./env.nas; set +a` 후 실행. Linux에서는 import 단계가
  Docker(node:20)로 실행된다(호스트에 npx 불필요).
"""
import os
import sys
from pathlib import Path

_script_dir = Path(__file__).resolve().parent
_env_path = _script_dir.parent / ".env.local"
if _env_path.exists():
    try:
        from dotenv import load_dotenv
        load_dotenv(_env_path)
    except ImportError:
        pass

# 프로젝트 내 ocr-pipeline 경로 (env 미설정 시 사용)
_PROJECT_OCR_INPUT = str(_script_dir.parent / "ocr-pipeline" / "input")
_PROJECT_OCR_OUTPUT = str(_script_dir.parent / "ocr-pipeline" / "output")
_PROJECT_OCR_WORK = str(_script_dir.parent / "ocr-pipeline")

OCR_INPUT_PATH = os.environ.get("OCR_INPUT_PATH", _PROJECT_OCR_INPUT).strip()
OCR_OUTPUT_PATH = os.environ.get("OCR_OUTPUT_PATH", _PROJECT_OCR_OUTPUT).strip()
OCR_CMD = os.environ.get("OCR_CMD", "").strip()
OCR_WORK_DIR = os.environ.get("OCR_WORK_DIR", _PROJECT_OCR_WORK).strip()
DASHBOARD_DIR = os.environ.get("DASHBOARD_DIR", str(_script_dir.parent)).strip()


def main():
    dry_run = "--dry-run" in sys.argv
    replace = "--replace" in sys.argv

    if dry_run:
        print("[--dry-run] 시뮬레이션만")

    # PDF 개수 확인 (환경변수 경로에 없으면 프로젝트 경로 fallback)
    inp = OCR_INPUT_PATH
    out = OCR_OUTPUT_PATH
    work = OCR_WORK_DIR
    ocr_cmd = OCR_CMD
    input_path = Path(inp)
    pdf_count = len(list(input_path.rglob("*.pdf"))) if input_path.exists() else 0
    if pdf_count == 0 and inp != _PROJECT_OCR_INPUT:
        input_path = Path(_PROJECT_OCR_INPUT)
        pdf_count = len(list(input_path.rglob("*.pdf"))) if input_path.exists() else 0
        if pdf_count > 0:
            inp = _PROJECT_OCR_INPUT
            out = _PROJECT_OCR_OUTPUT
            work = _PROJECT_OCR_WORK
            compose = Path(work) / "docker-compose.yml"
            if compose.exists():
                ocr_cmd = f'docker compose -f "{compose}" run --rm ocr-pipeline'
            print(f"\n  (환경변수 경로에 PDF 없음 → 프로젝트 ocr-pipeline 사용)")
    print(f"\n[1/2] OCR 입력: {inp}")
    print(f"  PDF {pdf_count}개")

    if pdf_count == 0:
        print("처리할 PDF 없음")
        print(f"  확인: {_PROJECT_OCR_INPUT}/검사결과_PDF/ 에 PDF 존재 여부")
        return

    # .process_only.txt 제거 → OCR이 전체 처리
    process_only = Path(inp) / ".process_only.txt"
    if process_only.exists():
        if dry_run:
            print(f"  [삭제예정] .process_only.txt")
        else:
            process_only.unlink()
            print(f"  .process_only.txt 제거 (전체 파싱 모드)")

    # OCR 실행 (UNC 경로는 cwd 지원 안 함 → 프로젝트 로컬 경로 사용)
    print("\n[2/2] OCR 실행")
    if not ocr_cmd:
        print("  OCR_CMD 미설정. 예: export OCR_CMD='docker compose run --rm ocr-pipeline'")
        if not dry_run:
            sys.exit(1)
    elif dry_run:
        print(f"  [실행예정] {ocr_cmd}")
    else:
        import subprocess
        run_cwd = work
        if os.name == "nt" and (str(work).startswith("\\\\") or str(work).startswith("//")):
            run_cwd = str(Path(os.getcwd()) / "ocr-pipeline")
            if not Path(run_cwd).exists():
                run_cwd = os.getcwd()
            print(f"  (UNC 경로 대신 cwd: {run_cwd})")
        try:
            subprocess.run(ocr_cmd, shell=True, check=True, cwd=run_cwd)
        except subprocess.CalledProcessError as e:
            print(f"  OCR 실패: {e}", file=sys.stderr)
            sys.exit(1)

    # import
    xlsx_path = None
    for name in ("results.xlsx", "result.xlsx"):
        p = Path(out) / name
        if p.exists():
            xlsx_path = str(p)
            break

    if not xlsx_path:
        print(f"\n  results.xlsx 없음: {out}/")
        if not dry_run:
            sys.exit(1)
    else:
        dash = DASHBOARD_DIR or str(_script_dir.parent)
        cwd = dash
        if os.name == "nt" and (dash.startswith("\\\\") or dash.startswith("//")):
            cwd = os.getcwd()
        if os.name == "nt":
            import_cmd = f'npx tsx scripts/import-ocr-results.ts --file={xlsx_path}'
            if replace:
                import_cmd += " --replace"
        else:
            # NAS 등: 호스트에 Node/npx 없음 → nas-auto-pipeline.py와 동일하게 Docker로 import
            rel_xlsx = os.path.relpath(xlsx_path, cwd).replace("\\", "/")
            cmd_tail = f'npx tsx scripts/import-ocr-results.ts --file=/app/{rel_xlsx}'
            if replace:
                cmd_tail += " --replace"
            cwd_abs = os.path.abspath(cwd)
            import_cmd = (
                f'docker run --rm --env-file env.nas -v "{cwd_abs}":/app -w /app node:20 '
                f'sh -c "npm install --no-save @esbuild/linux-x64 && {cmd_tail}"'
            )
        if dry_run:
            print(f"\n  [실행예정] cd {cwd} && {import_cmd}")
        else:
            import subprocess
            try:
                subprocess.run(import_cmd, shell=True, check=True, cwd=cwd)
                print("\n  import 완료")
            except subprocess.CalledProcessError as e:
                print(f"  import 실패: {e}", file=sys.stderr)
                sys.exit(1)

    print("\n전체 재파싱 완료")


if __name__ == "__main__":
    main()
