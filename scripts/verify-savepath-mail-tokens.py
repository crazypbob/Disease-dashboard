#!/usr/bin/env python3
"""
메일 첨부 파일명(접수번호·농장코드) 기준으로 SAVE_PATH 이하 PDF 존재 여부를 한 번에 점검.

  python scripts/verify-savepath-mail-tokens.py
  python scripts/verify-savepath-mail-tokens.py --set db3023-2026-04

`naver-imap-to-nas.py`는 원본명 앞에 날짜·제목·발신 접두어를 붙이므로,
검색은 `find-pdfs-under-savepath.py`와 동일하게 **파일명 부분 문자열(토큰)** 으로 한다.

환경: .env.local 의 SAVE_PATH (find-pdfs와 동일)
"""
from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path

_root = Path(__file__).resolve().parent.parent


def _load_env_local() -> None:
    p = _root / ".env.local"
    if not p.exists():
        return
    try:
        with open(p, "r", encoding="utf-8") as f:
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
                if k in os.environ and os.environ.get(k, ""):
                    continue
                os.environ[k] = v
    except OSError:
        return


_load_env_local()

SETS: dict[str, list[tuple[str, ...]]] = {
    "db3023-2026-04": [
        ("26-04129", "DB3023"),
        ("26-04130", "DB3023"),
    ],
}


def run_find(contains: tuple[str, ...]) -> tuple[int, str]:
    script = _root / "scripts" / "find-pdfs-under-savepath.py"
    args = [sys.executable, str(script)] + [c for t in contains for c in ("--contains", t)]
    p = subprocess.run(
        args,
        cwd=str(_root),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    out = (p.stdout or "") + (p.stderr or "")
    return p.returncode, out


def _safe_print(s: str) -> None:
    """Windows 콘솔(cp949)에서 유니코드 경로 출력 시 UnicodeEncodeError 방지."""
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass
    enc = getattr(sys.stdout, "encoding", None) or "utf-8"
    try:
        print(s)
    except UnicodeEncodeError:
        print(s.encode(enc, errors="replace").decode(enc, errors="replace"))


def main() -> None:
    import argparse

    ap = argparse.ArgumentParser(description="SAVE_PATH 메일 첨부 토큰 일괄 검증")
    ap.add_argument(
        "--set",
        default="db3023-2026-04",
        help=f"사전 정의 토큰 모음: {', '.join(sorted(SETS))}",
    )
    args = ap.parse_args()
    key = (args.set or "").strip()
    if key not in SETS:
        print(f"알 수 없는 --set: {key}", file=sys.stderr)
        sys.exit(2)

    _safe_print("--- SAVE_PATH 메일 첨부명(접수·농장코드) 검증 ---\n")
    any_fail = False
    for tokens in SETS[key]:
        code, out = run_find(tokens)
        label = " + ".join(tokens)
        _safe_print(f"[{label}]")
        _safe_print((out or "").rstrip() or "(출력 없음)")
        if code != 0:
            any_fail = True
        _safe_print("")

    if any_fail:
        _safe_print(
            "누락이 있으면(위 exit 코드 또는 [일치] 0개):\n"
            "  · 이미 읽은 메일만 제외됐을 수 있음 → "
            "python scripts/naver-imap-to-nas.py --all --since=2026-04-21\n"
            "  · TARGET_SENDER 필터 → .env.local 확인 후 --verbose-skip\n"
            "  · Z:\\ 등 IMAP이 만들지 않는 다른 트리 → docs/SETUP-NAVER-OCR.md \"2.0\" 절\n"
            "  · Google Drive → 웹 Drive에서 2026-04·DB3023 검색(동기와 별개)\n"
        )
        sys.exit(1)
    _safe_print("전부 [일치] 1개 이상입니다.")


if __name__ == "__main__":
    main()
