#!/usr/bin/env python3
"""
3/23부터: 메일 → NAS → OCR input → 파싱 → DB 자동 파이프라인

NAS 작업 스케줄러에서 5~10분마다 실행.

사용법:
  export SAVE_PATH="X:/질병메일링_대시보드/검사결과_PDF"
  export OCR_INPUT_PATH="X:/ocr-pipeline/input"
  export OCR_OUTPUT_PATH="X:/ocr-pipeline/output"
  export OCR_CMD="docker compose -f X:/ocr-pipeline/docker-compose.yml run --rm ocr-pipeline"
  export DASHBOARD_DIR="X:/질병메일링_대시보드/disease-dashboard"

  python3 nas-auto-pipeline.py

  # OCR input에 이미 PDF가 있을 때 (이전 OCR 실패 후 재시도)
  python3 nas-auto-pipeline.py --ocr-input-only

동작:
  1. naver-vetdxlab-download.py --unseen (전북대 신규 메일 vetdxlab 링크 PDF → NAS)
  2. naver-imap-to-nas.py 실행 (신규 메일 첨부 → NAS 메일저장)
  3. 메일저장에서 PDF 검색, 아직 처리 안 한 것만 OCR input으로 복사 (기본 3/23 이후, --all-dates 시 전체)
  4. OCR 실행 (OCR_CMD)
  5. results.xlsx → DB import (npx tsx import-ocr-results.ts)
  6. import 성공 시 Google Drive 동기화 (sync-pdfs-to-drive.ts, SKIP_DRIVE_SYNC=1 이면 생략)
  7. OCR input 비우기 (다음 run에 신규만 파싱)
"""
import os
import re
import shutil
import subprocess
import sys
import atexit
from pathlib import Path
from datetime import datetime, date, timezone
import json

# .env 파일 로드 시스템 (python-dotenv 모듈 의존성 제거)
_script_dir = Path(__file__).resolve().parent
def _load_env_file(filepath, *, overwrite: bool = False):
    if not filepath.exists(): return
    import os, re
    with open(filepath, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'): continue
            m = re.match(r'^([A-Za-z0-9_]+)=(.+)$', line)
            if m:
                k, v = m.group(1).strip(), m.group(2).strip()
                if (v.startswith('"') and v.endswith('"')) or (v.startswith("'") and v.endswith("'")):
                    v = v[1:-1]
                # 컨테이너/호스트가 환경변수를 주입한 경우(예: docker compose environment)는 그 값을 우선한다.
                if (not overwrite) and (k in os.environ) and (os.environ.get(k, "") != ""):
                    continue
                os.environ[k] = v

try:
    _load_env_file(_script_dir.parent / ".env.local", overwrite=False)
    # NAS/상시 호스트에서만 env.nas를 적용한다.
    # - Windows(로컬 개발 PC)에서는 env.nas(/volume1/...)가 로컬 경로(X:/...)를 덮어써서 오작동할 수 있음.
    # - 리눅스(NAS)에서는 env.nas가 정답 경로이므로 .env.local보다 우선(override) 적용한다.
    if os.name != "nt" or os.environ.get("FORCE_ENV_NAS", "").strip() == "1":
        _load_env_file(_script_dir.parent / "env.nas", overwrite=True)
except Exception:
    pass

# 2026-03-23부터 자동 처리
CUTOFF_DATE_STR = "20260323"
CUTOFF_INT = int(CUTOFF_DATE_STR)

_DEFAULT_SAVE = str(_script_dir.parent / "ocr-pipeline" / "input" / "검사결과_PDF")
_DEFAULT_OCR_INPUT = str(_script_dir.parent / "ocr-pipeline" / "input")
_DEFAULT_OCR_OUTPUT = str(_script_dir.parent / "ocr-pipeline" / "output")
SAVE_PATH = os.environ.get("SAVE_PATH", _DEFAULT_SAVE).strip()
OCR_INPUT_PATH = os.environ.get("OCR_INPUT_PATH", _DEFAULT_OCR_INPUT).strip()
OCR_OUTPUT_PATH = os.environ.get("OCR_OUTPUT_PATH", _DEFAULT_OCR_OUTPUT).strip()
OCR_CMD = os.environ.get("OCR_CMD", "").strip()
DASHBOARD_DIR = os.environ.get("DASHBOARD_DIR", "").strip()

SCRIPT_DIR = Path(__file__).resolve().parent
PROCESSED_LOG = str(SCRIPT_DIR / ".processed_pdfs.txt")
LOCK_FILE = str(SCRIPT_DIR / ".nas-auto-pipeline.lock")
NAVER_IMAP = SCRIPT_DIR / "naver-imap-to-nas.py"
NAVER_COMPARE = SCRIPT_DIR / "naver-nas-compare-download.py"
NAVER_VETDXLAB = SCRIPT_DIR / "naver-vetdxlab-download.py"

DEBUG_LOG_PATH = str((_script_dir.parent / "debug-ca78f3.log").resolve())

def _dbg(run_id: str, hypothesis_id: str, location: str, message: str, data: dict):
    """
    Debug-mode NDJSON logger (no secrets).
    Writes to repo root debug-ca78f3.log so Windows/NAS share the same file.
    """
    try:
        payload = {
            "sessionId": "ca78f3",
            "runId": run_id,
            "hypothesisId": hypothesis_id,
            "location": location,
            "message": message,
            "data": data,
            "timestamp": int(datetime.now(timezone.utc).timestamp() * 1000),
        }
        with open(DEBUG_LOG_PATH, "a", encoding="utf-8") as f:
            f.write(json.dumps(payload, ensure_ascii=False) + "\n")
    except Exception:
        pass


def acquire_lock(dry_run: bool) -> bool:
    """
    5분 주기 스케줄러에서 겹쳐 실행되는 것을 방지한다.
    - 정상 실행: lock 파일을 생성(원자적)하고 종료 시 삭제.
    - dry-run: lock을 잡지 않고 정보만 출력.
    """
    if dry_run:
        print("[lock] --dry-run: lock 생략")
        return True
    try:
        # 원자적 생성: 이미 있으면 FileExistsError
        fd = os.open(LOCK_FILE, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(f"pid={os.getpid()}\n")
            f.write(f"created_at={datetime.now(timezone.utc).isoformat()}\n")
        print("[lock] acquired")
        return True
    except FileExistsError:
        # 스테일(stale) 락 처리:
        # - Windows(PC)와 NAS(리눅스) 환경이 섞여 있어 PID만으로는 신뢰할 수 없다.
        # - 대신 lock 파일의 mtime 기준으로 TTL을 둔다(기본 30분).
        ttl_min = int(os.environ.get("PIPELINE_LOCK_TTL_MINUTES", "30") or "30")
        try:
            st = os.stat(LOCK_FILE)
            age_sec = max(0.0, (datetime.now(timezone.utc).timestamp() - st.st_mtime))
            age_min = age_sec / 60.0
            if age_min > ttl_min:
                try:
                    os.remove(LOCK_FILE)
                    print(f"[lock] stale lock removed (age={age_min:.1f}min > ttl={ttl_min}min): {LOCK_FILE}", file=sys.stderr)
                    return acquire_lock(dry_run=False)
                except Exception as e:
                    print(f"[lock] stale lock remove failed: {e}", file=sys.stderr)
        except Exception:
            pass

        print(f"[lock] already running, skip ({LOCK_FILE})", file=sys.stderr)
        return False
    except Exception as e:
        print(f"[lock] failed: {e}", file=sys.stderr)
        return False


def release_lock(dry_run: bool) -> None:
    if dry_run:
        return
    try:
        if os.path.exists(LOCK_FILE):
            os.remove(LOCK_FILE)
            print("[lock] released")
    except Exception:
        # 락 해제 실패는 다음 스케줄에 영향이 크므로 stderr로만 남기고 종료는 방해하지 않는다.
        print(f"[lock] release failed ({LOCK_FILE})", file=sys.stderr)

def _norm(p: str) -> str:
    return str(p or "").replace("\\", "/").rstrip("/").lower()

def _is_project_local_ocr_input(p: str) -> bool:
    """프로젝트 로컬 ocr-pipeline/input 인지 확인 (PC용 안전장치)"""
    try:
        project_local = (_script_dir.parent / "ocr-pipeline" / "input").resolve()
        target = Path(p).resolve()
        return _norm(str(target)) == _norm(str(project_local))
    except Exception:
        project_local = _norm(str(_script_dir.parent / "ocr-pipeline" / "input"))
        return _norm(p) == project_local


def parse_date_from_filename(name: str) -> int | None:
    """파일명에서 YYYYMMDD 추출 (앞 8자리)"""
    m = re.match(r"(\d{8})", name)
    if m:
        return int(m.group(1))
    return None


def _find_nas_rel_for_basename(save_path: str, basename: str) -> str | None:
    if not save_path or not basename or not os.path.isdir(save_path):
        return None
    for root, _dirs, files in os.walk(save_path):
        if basename in files:
            return os.path.relpath(os.path.join(root, basename), save_path).replace("\\", "/")
    return None


def nas_pdf_rels_for_drive_sync(save_path: str, ocr_input_path: str) -> list[str]:
    if not os.path.isdir(ocr_input_path) or not os.path.isdir(save_path):
        return []
    out: list[str] = []
    for fname in os.listdir(ocr_input_path):
        if not fname.lower().endswith(".pdf"):
            continue
        rel = _find_nas_rel_for_basename(save_path, fname)
        if rel and rel not in out:
            out.append(rel)
    return out


def run_drive_pdf_sync(*, save_path: str, ocr_input_path: str, cwd_dashboard: str, dry_run: bool) -> None:
    """import 성공 직후: NAS PDF → Drive 업로드 + DB pdf_file_id 갱신."""
    if dry_run:
        print("\n[4b/5] Google Drive PDF 동기화 (--dry-run: 생략)")
        return
    if os.environ.get("SKIP_DRIVE_SYNC", "").strip() == "1":
        print("\n[4b/5] Google Drive PDF 동기화 스킵 (SKIP_DRIVE_SYNC=1)")
        return
    rels = nas_pdf_rels_for_drive_sync(save_path, ocr_input_path)
    if not rels:
        return
    print(f"\n[4b/5] Google Drive PDF 동기화 ({len(rels)}개)")
    rels_file = str(SCRIPT_DIR / ".drive_sync_rels.tmp")
    try:
        with open(rels_file, "w", encoding="utf-8") as f:
            for r in rels:
                f.write(r.replace("\\", "/") + "\n")
        cwd = cwd_dashboard
        if os.name == "nt":
            sync_cmd = (
                f'npx tsx scripts/sync-pdfs-to-drive.ts '
                f'--base="{save_path}" --rels-file="{rels_file}"'
            )
            subprocess.run(sync_cmd, shell=True, check=True, cwd=cwd)
        else:
            dash_abs = os.path.abspath(cwd)
            save_abs = os.path.abspath(save_path)
            rels_rf = os.path.relpath(rels_file, dash_abs).replace("\\", "/")
            sep = os.sep
            if save_abs.startswith(dash_abs + sep) or os.path.normcase(save_abs) == os.path.normcase(dash_abs):
                rel_from_dash = os.path.relpath(save_abs, dash_abs).replace("\\", "/")
                base_docker = f"/app/{rel_from_dash}"
                extra_vol = ""
            else:
                base_docker = "/nas_pdf"
                extra_vol = f' -v "{save_abs}":/nas_pdf:ro'
            inner = (
                f"npx tsx scripts/sync-pdfs-to-drive.ts "
                f"--base={base_docker} --rels-file=/app/{rels_rf}"
            )
            sync_cmd = (
                f'docker run --rm --env-file env.nas -v "{dash_abs}":/app -w /app{extra_vol} '
                f'node:20 sh -c "npm install --no-save @esbuild/linux-x64 && {inner}"'
            )
            subprocess.run(sync_cmd, shell=True, check=True, cwd=cwd)
        print("  Drive 동기화 완료")
    finally:
        try:
            if os.path.exists(rels_file):
                os.remove(rels_file)
        except OSError:
            pass


def _parse_ymd(s: str) -> date:
    return datetime.strptime(s, "%Y-%m-%d").date()


def _ymd_int(d: date) -> int:
    return d.year * 10000 + d.month * 100 + d.day


def _arg_value(prefix: str) -> str | None:
    for a in sys.argv:
        if a.startswith(prefix):
            return a.split("=", 1)[1].strip() or None
    return None


def load_processed() -> set[str]:
    if not os.path.exists(PROCESSED_LOG):
        return set()
    with open(PROCESSED_LOG, "r", encoding="utf-8") as f:
        return {ln.strip() for ln in f if ln.strip()}


def save_processed(path: str):
    with open(PROCESSED_LOG, "a", encoding="utf-8") as f:
        f.write(path + "\n")


def main():
    dry_run = "--dry-run" in sys.argv
    skip_imap = "--skip-imap" in sys.argv
    skip_ocr = "--skip-ocr" in sys.argv
    all_dates = "--all-dates" in sys.argv  # 3/23 이전(누락분)도 포함
    ocr_input_only = "--ocr-input-only" in sys.argv  # 복사 스킵, input 폴더 PDF만 OCR
    require_project_local = "--require-project-local" in sys.argv
    reprocess_all = "--reprocess-all" in sys.argv  # processed 로그/ocr input 초기화 후 전체 재처리
    ignore_processed = "--ignore-processed" in sys.argv  # processed 로그를 무시하고 복사를 강제 (기간 재처리용)
    force_unlock = "--force-unlock" in sys.argv  # lock이 남아있어도 강제로 해제 후 실행(운영자용)
    replace_import = "--replace" in sys.argv or "--replace-import" in sys.argv  # import 시 기존 덮어쓰기
    since_ymd = _arg_value("--since=")  # 기간 지정 재처리 (읽음/안읽음 무관 ALL 스크립트와 같이 사용)
    before_ymd = _arg_value("--before=")
    since_int = _ymd_int(_parse_ymd(since_ymd)) if since_ymd else None
    before_int = _ymd_int(_parse_ymd(before_ymd)) if before_ymd else None

    run_id = "pre-fix"
    _dbg(
        run_id,
        "H1",
        "scripts/nas-auto-pipeline.py:main:init",
        "paths-and-flags",
        {
            "os": os.name,
            "SAVE_PATH": SAVE_PATH,
            "OCR_INPUT_PATH": OCR_INPUT_PATH,
            "OCR_OUTPUT_PATH": OCR_OUTPUT_PATH,
            "ocr_input_only": ocr_input_only,
            "ignore_processed": ignore_processed,
            "since": since_ymd,
            "before": before_ymd,
        },
    )

    if dry_run:
        print("[--dry-run] 실제 실행 없이 단계별 확인")
    if ocr_input_only:
        print("[--ocr-input-only] 복사 생략, OCR input 폴더 내용만 OCR → import")
    if require_project_local:
        print("[--require-project-local] OCR_INPUT_PATH가 프로젝트 로컬이 아니면 중단")
    if reprocess_all:
        print("[--reprocess-all] processed 로그/ocr input 초기화 후 전체 재처리")
    if ignore_processed:
        print("[--ignore-processed] processed 로그를 무시하고 기간 내 PDF 복사를 강제합니다.")
    if force_unlock:
        print("[--force-unlock] 기존 lock 파일을 강제로 해제하고 실행합니다.")
    if replace_import:
        print("[--replace] DB import 시 기존 레코드 덮어쓰기")
    if since_ymd:
        print(f"[--since={since_ymd}] 지정 날짜(포함) 이후만")
    if before_ymd:
        print(f"[--before={before_ymd}] 지정 날짜(미포함) 이전만")

    force_all_mail = os.environ.get("FORCE_ALL_MAIL", "").strip() == "1"
    if force_all_mail:
        print("[FORCE_ALL_MAIL=1] 읽음/안읽음 무관(ALL) 기준으로 누락분을 강제로 가져옵니다.")

    # 운영 중 lock이 남아 다음 실행이 막히는 경우가 있어, 운영자 옵션으로 강제 해제 지원
    if force_unlock and (not dry_run):
        try:
            if os.path.exists(LOCK_FILE):
                os.remove(LOCK_FILE)
                print("[lock] force-unlock: removed")
        except Exception as e:
            print(f"[lock] force-unlock failed: {e}", file=sys.stderr)

    if not acquire_lock(dry_run):
        return

    # lock 해제는 atexit로 보장 (try/finally로 전체를 감싸면 들여쓰기 유지가 부담)
    atexit.register(lambda: release_lock(dry_run))

    print("\n[경로] SAVE_PATH:", SAVE_PATH)
    print("[경로] OCR_INPUT_PATH:", OCR_INPUT_PATH)
    print("[경로] OCR_OUTPUT_PATH:", OCR_OUTPUT_PATH)
    if OCR_WORK_DIR := os.environ.get("OCR_WORK_DIR", "").strip():
        print("[경로] OCR_WORK_DIR:", OCR_WORK_DIR)
    if OCR_CMD:
        print("[명령] OCR_CMD:", OCR_CMD)
    if DASHBOARD_DIR:
        print("[경로] DASHBOARD_DIR:", DASHBOARD_DIR)

    if require_project_local and not _is_project_local_ocr_input(OCR_INPUT_PATH):
        print(f"  OCR_INPUT_PATH가 프로젝트 로컬이 아닙니다: {OCR_INPUT_PATH}", file=sys.stderr)
        print("  (PC에서 NAS docker 볼륨 경로로 복사되는 사고 방지용)", file=sys.stderr)
        sys.exit(2)

    # 1a. 전북대 vetdxlab 링크 PDF
    # - 기본: --unseen (신규만)
    # - 기간 지정: --since/--before가 있으면 ALL+기간으로 일괄 다운로드 (읽음/안읽음 무관)
    if not ocr_input_only and not skip_imap and NAVER_VETDXLAB.exists():
        print("\n[1a/5] 전북대 vetdxlab 링크 PDF")
        try:
            args = [sys.executable, str(NAVER_VETDXLAB)]
            if since_ymd or before_ymd:
                if since_ymd:
                    args.append(f"--since={since_ymd}")
                if before_ymd:
                    args.append(f"--before={before_ymd}")
            else:
                args.append("--unseen")
            if dry_run:
                args.append("--dry-run")
            subprocess.run(args, check=True, cwd=str(SCRIPT_DIR.parent))
        except subprocess.CalledProcessError as e:
            print(f"  vetdxlab 다운로드 실패: {e}", file=sys.stderr)
            if not dry_run:
                sys.exit(1)
    else:
        print("\n[1a/5] vetdxlab 링크 PDF (스킵)")

    # 1b. 네이버 첨부 → NAS
    if not ocr_input_only and not skip_imap and (NAVER_IMAP.exists() or NAVER_COMPARE.exists()):
        print("\n[1b/5] 네이버 메일 → NAS 저장")
        if dry_run:
            if force_all_mail and NAVER_COMPARE.exists():
                print(f"  [실행예정] {sys.executable} {NAVER_COMPARE} --since=... --before=...")
            else:
                print(f"  [실행예정] {sys.executable} {NAVER_IMAP}")
        else:
            try:
                if force_all_mail and NAVER_COMPARE.exists():
                    # ALL 기반 + 기존 NAS 보유 파일과 비교하여 "누락분만" 다운로드 (중복 저장 최소화)
                    args = [sys.executable, str(NAVER_COMPARE)]
                    if since_ymd:
                        args += ["--since", since_ymd] if False else [f"--since={since_ymd}"]
                    if before_ymd:
                        args += ["--before", before_ymd] if False else [f"--before={before_ymd}"]
                    if dry_run:
                        args.append("--dry-run")
                    subprocess.run(args, check=True, cwd=str(SCRIPT_DIR.parent))
                else:
                    args = [sys.executable, str(NAVER_IMAP)]
                    if force_all_mail:
                        args.append("--all")
                    if since_ymd:
                        args.append(f"--since={since_ymd}")
                    if before_ymd:
                        args.append(f"--before={before_ymd}")
                    subprocess.run(args, check=True, cwd=str(SCRIPT_DIR.parent))
            except subprocess.CalledProcessError as e:
                print(f"  네이버 다운로드 실패: {e}", file=sys.stderr)
                sys.exit(1)
    else:
        print("\n[1b/5] 네이버 → NAS (스킵)")

    # 2. 신규 PDF만 OCR input으로 복사 (처리한 건 .processed_pdfs.txt에 기록 → OCR은 신규만)
    date_note = "전체" if all_dates else "2026-03-23 이후"
    if since_ymd or before_ymd:
        date_note = f"{since_ymd or '...'} ~ {before_ymd or '...'}"
    print(f"\n[2/5] 신규 PDF → OCR input 복사 ({date_note})")
    copied_dest_paths: list[str] = []
    if ocr_input_only:
        n = 0
        if os.path.isdir(OCR_INPUT_PATH):
            n = len([f for f in os.listdir(OCR_INPUT_PATH) if f.lower().endswith('.pdf')])
        print(f"  (--ocr-input-only: 복사 생략, input 폴더 PDF {n}개)")
    elif not os.path.isdir(SAVE_PATH):
        print(f"  SAVE_PATH 없음: {SAVE_PATH}")
    else:
        if reprocess_all:
            if dry_run:
                print(f"  [초기화예정] {PROCESSED_LOG} 삭제 + OCR input PDF 삭제")
            else:
                # processed 로그 초기화
                try:
                    if os.path.exists(PROCESSED_LOG):
                        os.remove(PROCESSED_LOG)
                        print("  processed 로그 초기화")
                except OSError:
                    pass
                # OCR input 내 기존 PDF 초기화 (완전 재처리 목적)
                try:
                    if os.path.isdir(OCR_INPUT_PATH):
                        removed = 0
                        for f in os.listdir(OCR_INPUT_PATH):
                            if f.lower().endswith(".pdf"):
                                try:
                                    os.remove(os.path.join(OCR_INPUT_PATH, f))
                                    removed += 1
                                except OSError:
                                    pass
                        if removed:
                            print(f"  OCR input 초기화: {removed}개 PDF 제거")
                except OSError:
                    pass

                # OCR output의 기존 results.xlsx가 있으면 OCR이 "이미 처리됨"으로 전부 스킵할 수 있음
                # 완전 재처리에서는 output 결과 파일도 제거해서 OCR을 강제 재생성한다.
                try:
                    removed_out = 0
                    for name in ("results.xlsx", "result.xlsx", "ocr_pipeline.log"):
                        p = os.path.join(OCR_OUTPUT_PATH, name)
                        if os.path.exists(p) and os.path.isfile(p):
                            try:
                                os.remove(p)
                                removed_out += 1
                            except OSError:
                                pass
                    if removed_out:
                        print(f"  OCR output 초기화: {removed_out}개 파일 제거")
                except OSError:
                    pass

        processed = set() if ignore_processed else load_processed()
        _dbg(
            run_id,
            "H1",
            "scripts/nas-auto-pipeline.py:copy:begin",
            "processed-loaded",
            {"ignore_processed": ignore_processed, "processed_count": len(processed)},
        )
        for root, _dirs, files in os.walk(SAVE_PATH):
            for f in files:
                if not f.lower().endswith(".pdf"):
                    continue
                date_val = parse_date_from_filename(f)
                if date_val is None:
                    continue
                if since_int is not None and date_val < since_int:
                    continue
                if before_int is not None and date_val >= before_int:
                    continue
                if (since_int is None and before_int is None) and (not all_dates) and date_val < CUTOFF_INT:
                    continue
                full = os.path.join(root, f)
                rel = os.path.relpath(full, SAVE_PATH)
                if (not reprocess_all) and (rel in processed):
                    continue
                dest = os.path.join(OCR_INPUT_PATH, f)
                if os.path.exists(dest) and (not reprocess_all):
                    save_processed(rel)
                    continue
                if dry_run:
                    print(f"  [복사예정] {rel} → input/")
                    copied_dest_paths.append(dest)
                else:
                    os.makedirs(OCR_INPUT_PATH, exist_ok=True)
                    # NAS에서 간헐적으로 copy2의 copystat(utime) 단계에서 dst가 사라져 FileNotFoundError가 나는 케이스가 있었다.
                    # (다른 프로세스가 input 폴더를 정리/교체하거나, 파일시스템 타이밍 이슈)
                    # 본문 내용이 복사되기만 하면 OCR은 수행 가능하므로, 메타데이터 복사는 best-effort로 처리한다.
                    try:
                        shutil.copy2(full, dest)
                    except FileNotFoundError:
                        shutil.copyfile(full, dest)
                    # processed 로그는 "복사 성공" 시점에 남기지만, 기간 재처리에서는 기존 로그를 유지한 채로 복사만 강제한다.
                    save_processed(rel)
                    copied_dest_paths.append(dest)
                    print(f"  복사: {f}")
        print(f"  → {len(copied_dest_paths)}개 (신규만)")
        sample = [os.path.basename(p) for p in copied_dest_paths[:10]]
        _dbg(
            run_id,
            "H1",
            "scripts/nas-auto-pipeline.py:copy:end",
            "copied-to-ocr-input-root",
            {"copied_count": len(copied_dest_paths), "sample_names": sample},
        )

    # input에 PDF가 없으면 OCR·import 스킵 (신규 없음)
    existing_pdfs = []
    if os.path.isdir(OCR_INPUT_PATH):
        existing_pdfs = [f for f in os.listdir(OCR_INPUT_PATH) if f.lower().endswith(".pdf")]
    else:
        print(f"  OCR_INPUT_PATH 없음: {OCR_INPUT_PATH}")
    if not copied_dest_paths and not existing_pdfs:
        print("\n[3/5] OCR 실행 - 스킵 (신규 PDF 없음)")
        print(f"  (OCR input: {OCR_INPUT_PATH} - PDF {len(existing_pdfs)}개)")
        print("[4/5] DB import - 스킵")
        print("\n파이프라인 완료 (처리할 파일 없음)")
        return
    if existing_pdfs and not copied_dest_paths:
        print(f"  → input에 PDF {len(existing_pdfs)}개 있음 (OCR 대기)")

    # 3. OCR 실행
    print("\n[3/5] OCR 실행")
    if not OCR_CMD:
        print("  OCR_CMD 미설정. 예: export OCR_CMD='docker compose run --rm ocr-pipeline'")
    elif skip_ocr:
        print("  --skip-ocr: 스킵")
    elif dry_run:
        print(f"  [실행예정] {OCR_CMD}")
    else:
        try:
            # OCR_CMD는 docker compose 등이므로 shell로 실행 (cwd는 OCR 폴더 기준)
            ocr_cwd = os.environ.get("OCR_WORK_DIR", ".")
            subprocess.run(OCR_CMD, shell=True, check=True, cwd=ocr_cwd)
        except subprocess.CalledProcessError as e:
            print(f"  OCR 실패: {e}", file=sys.stderr)
            sys.exit(1)

    # 4. results.xlsx → DB (또는 result.xlsx 호환)
    print("\n[4/5] results.xlsx → DB import")
    xlsx_path = None
    for name in ("results.xlsx", "result.xlsx"):
        p = os.path.join(OCR_OUTPUT_PATH, name)
        if os.path.exists(p):
            xlsx_path = p
            break
        p = os.path.join(SCRIPT_DIR.parent, "scripts", name)
        if os.path.exists(p):
            xlsx_path = p
            break
    if not xlsx_path:
        print(f"  results.xlsx 없음: {OCR_OUTPUT_PATH}/ 또는 scripts/")
    else:
        dash = DASHBOARD_DIR or str(SCRIPT_DIR.parent)
        # Windows: UNC 경로는 cwd로 사용 불가 → 실행 디렉터리(os.getcwd()) 사용
        cwd = dash
        if os.name == "nt" and (dash.startswith("\\\\") or dash.startswith("//")):
            cwd = os.getcwd()
            print(f"  (UNC 경로 대신 cwd 사용: {cwd})")
        
        # 윈도우는 그대로, NAS(리눅스)는 호스트에 Node가 없음을 감안해 Docker 컨테이너로 실행
        if os.name == "nt":
            import_cmd = f'npx tsx scripts/import-ocr-results.ts --file={xlsx_path}'
            if replace_import or reprocess_all:
                import_cmd += " --replace"
        else:
            rel_xlsx = os.path.relpath(xlsx_path, cwd).replace('\\', '/')
            # 윈도우(호스트)에서 설치된 node_modules가 리눅스 도커와 충돌(esbuild 플랫폼 에러)하는 문제를 해결하기 위해,
            # 실행 전 임시로 리눅스용 esbuild 모듈을 npm으로 추가 설치 후 실행
            cmd_tail = f'npx tsx scripts/import-ocr-results.ts --file=/app/{rel_xlsx}'
            if replace_import or reprocess_all:
                cmd_tail += " --replace"
            import_cmd = f'docker run --rm --env-file env.nas -v "{cwd}":/app -w /app node:20 sh -c "npm install --no-save @esbuild/linux-x64 && {cmd_tail}"'
            
        if dry_run:
            print(f"  [실행예정] cd {cwd} && {import_cmd}")
        else:
            try:
                subprocess.run(import_cmd, shell=True, check=True, cwd=cwd)
                print("  import 완료")
                run_drive_pdf_sync(
                    save_path=SAVE_PATH,
                    ocr_input_path=OCR_INPUT_PATH,
                    cwd_dashboard=cwd,
                    dry_run=False,
                )
                # OCR input 비우기 (이번에 복사한 신규분만 삭제)
                if not skip_ocr and os.path.isdir(OCR_INPUT_PATH):
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
                    _dbg(
                        run_id,
                        "H2",
                        "scripts/nas-auto-pipeline.py:import:cleanup",
                        "cleanup-after-import",
                        {"removed_pdf_count": removed},
                    )
            except subprocess.CalledProcessError as e:
                print(f"  import 실패: {e}", file=sys.stderr)
                _dbg(
                    run_id,
                    "H2",
                    "scripts/nas-auto-pipeline.py:import:error",
                    "import-failed-no-cleanup",
                    {"error": str(e)},
                )
                sys.exit(1)

    print("\n파이프라인 완료")


if __name__ == "__main__":
    main()
