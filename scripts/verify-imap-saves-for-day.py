#!/usr/bin/env python3
"""
save_path 내 파일 prefix(메일 Date 헤더 기반 YYYYMMDD)로 특정 **달력일**에 저장된 첨부를 점검.
선택: IMAP_AUDIT_LOG JSONL 집계, IMAP INBOX `ON` 검색과 대조(참고).

  python scripts/verify-imap-saves-for-day.py --date=2026-04-23
  python scripts/verify-imap-saves-for-day.py --date=2026-04-23 --imap-compare

- `--date`는 **저장 파일명 prefix의 날짜(YYYYMMDD)와 맞출 것** = naver-imap-to-nas.py 가 쓰는
  `메일 Date` 헤더의 연·월·일(로컬/UTC 혼용 가능)과 일치하는 경우가 많음. 수신일과 다를 수 있음.
- IMAP `ON dd-mmm-yyyy`는 **서버가 해석하는 수신/날짜**이며, 파일 prefix와 1:1이 아닐 수 있음.
"""
from __future__ import annotations

import argparse
import imaplib
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path

_root = Path(__file__).resolve().parent.parent


def _load_env_file(filepath: Path, *, overwrite: bool = False) -> None:
    if not filepath.exists():
        return
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            for line in f:
                t = line.strip()
                if not t or t.startswith("#"):
                    continue
                m = re.match(r"^([A-Za-z0-9_]+)=(.+)$", t)
                if not m:
                    continue
                k, v = m.group(1).strip(), m.group(2).strip()
                if (v.startswith('"') and v.endswith('"')) or (v.startswith("'") and v.endswith("'")):
                    v = v[1:-1]
                if (not overwrite) and (k in os.environ) and (os.environ.get(k, "")):
                    continue
                os.environ[k] = v
    except OSError:
        return


_load_env_file(_root / ".env.local", overwrite=False)
if os.name != "nt" or os.environ.get("FORCE_ENV_NAS", "").strip() == "1":
    _load_env_file(_root / "env.nas", overwrite=True)

_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _on_clause(ymd: str) -> str:
    d = datetime.strptime(ymd, "%Y-%m-%d")
    m = _MONTHS[d.month - 1]
    return f"ON {d.day:02d}-{m}-{d.year}"


def _prefix(ymd: str) -> str:
    d = datetime.strptime(ymd, "%Y-%m-%d")
    return f"{d.year:04d}{d.month:02d}{d.day:02d}_"


def scan_save_path(save_path: str, ymd: str) -> list[str]:
    pfx = _prefix(ymd)
    d = datetime.strptime(ymd, "%Y-%m-%d")
    month_folder = f"{d.year}-{d.month:02d}"
    base = os.path.join(os.path.abspath(save_path), month_folder)
    if not os.path.isdir(base):
        return []
    out: list[str] = []
    for fn in os.listdir(base):
        if not os.path.isfile(os.path.join(base, fn)):
            continue
        if fn.startswith(pfx):
            out.append(f"{month_folder}/{fn}".replace("\\", "/"))
    out.sort()
    return out


def scan_audit_jsonl(audit_path: str, ymd: str) -> tuple[int, int]:
    """(prefix 일치 한 줄 수, error 필드가 있는 줄 수)"""
    pfx = _prefix(ymd)
    if not os.path.isfile(audit_path):
        return 0, 0
    ok = 0
    err = 0
    with open(audit_path, "r", encoding="utf-8", errors="replace") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                o = json.loads(line)
            except json.JSONDecodeError:
                continue
            if o.get("error"):
                efp = o.get("file_prefix") or ""
                if str(efp).startswith(pfx):
                    err += 1
                continue
            fp = o.get("file_prefix") or ""
            if str(fp).startswith(pfx):
                ok += 1
    return ok, err


def imap_inbox_count_on(ymd: str) -> int | None:
    email_ = os.environ.get("NAVER_EMAIL", "").strip()
    password_ = os.environ.get("NAVER_APP_PASSWORD", "").strip()
    if not email_ or not password_:
        print("IMAP 대조: NAVER_EMAIL, NAVER_APP_PASSWORD 없음 (건너뜀)", file=sys.stderr)
        return None
    crit = f"({_on_clause(ymd)})"
    try:
        mail = imaplib.IMAP4_SSL("imap.naver.com", 993)
        mail.login(email_, password_)
        mail.select("INBOX")
        status, messages = mail.search(None, crit)
        mail.logout()
    except Exception as e:
        print(f"IMAP ON 검색 실패: {e}", file=sys.stderr)
        return None
    if status != "OK" or not messages or not messages[0]:
        return 0
    return len(messages[0].split())


def main() -> int:
    ap = argparse.ArgumentParser(
        description="SAVE_PATH(및 옵션 감사 로그)에서 특정 날짜 prefix 저장 파일 점검"
    )
    ap.add_argument("--date", type=str, required=True, help="YYYY-MM-DD (저장 file_prefix의 달력일에 맞출 것)")
    ap.add_argument(
        "--imap-compare",
        action="store_true",
        help="IMAP INBOX ON <날짜> 메시지 수와 참고 출력(첨부 수와는 다를 수 있음)",
    )
    args = ap.parse_args()

    ymd = args.date.strip()
    datetime.strptime(ymd, "%Y-%m-%d")  # validate

    default_save = str(_root / "ocr-pipeline" / "input" / "검사결과_PDF")
    save_path = os.environ.get("SAVE_PATH", default_save).strip()
    abs_save = os.path.abspath(save_path)
    print(f"[SAVE_PATH] {abs_save}")
    print(f"[검사일] {ymd}  파일명 prefix: {_prefix(ymd)!r} (메일 Date 헤더 기준)")

    rels = scan_save_path(save_path, ymd)
    print(f"\n[디스크] {ymd!r} prefix 일치 파일: {len(rels)}개")
    for r in rels[:50]:
        print(f"  {r}")
    if len(rels) > 50:
        print(f"  … 외 {len(rels) - 50}개")

    audit = os.environ.get("IMAP_AUDIT_LOG", "").strip()
    if audit:
        ap_abs = os.path.abspath(audit)
        print(f"\n[IMAP_AUDIT_LOG] {ap_abs}")
        ok, err = scan_audit_jsonl(ap_abs, ymd)
        print(f"  prefix 일치 성공 기록(줄): {ok}  (error 기록: {err})")
        if len(rels) != ok and ok > 0:
            print("  참고: 디스크 개수와 감사 줄 수는 중복/에러/수동 복사로 달라질 수 있음.", file=sys.stderr)
    else:
        print("\n[IMAP_AUDIT_LOG] (미설정) naver-imap 저장 시 .env에 경로를 두면 JSONL로 집계 가능.")

    if args.imap_compare:
        n = imap_inbox_count_on(ymd)
        if n is not None:
            print(f"\n[IMAP INBOX] {_on_clause(ymd)} 메시지 수(참고): {n}")
            print("  (첨부 0·다부·.eml만 저장·TARGET_SENDER 제외는 파일 수와 불일치할 수 있음)")

    return 0 if rels or not audit else 0


if __name__ == "__main__":
    raise SystemExit(main())
