#!/usr/bin/env python3
"""
SAVE_PATH 이하에서 파일명에 지정 문자열이 포함된 PDF를 재귀 검색한다.
(접수번호·농장코드 등으로 “저장됐는지” 확인할 때 사용)

  python scripts/find-pdfs-under-savepath.py --contains 26-04129 --contains DB3023

환경: .env.local / (비윈도우 또는 FORCE_ENV_NAS=1 시) env.nas 의 SAVE_PATH
"""
from __future__ import annotations

import argparse
import os
import re
import sys
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
                if (not overwrite) and (k in os.environ) and (os.environ.get(k, "") != ""):
                    continue
                os.environ[k] = v
    except OSError:
        return


_load_env_file(_root / ".env.local", overwrite=False)
if os.name != "nt" or os.environ.get("FORCE_ENV_NAS", "").strip() == "1":
    _load_env_file(_root / "env.nas", overwrite=True)


def main() -> None:
    p = argparse.ArgumentParser(description="SAVE_PATH 아래 PDF 파일명 부분 문자열 검색")
    p.add_argument(
        "--contains",
        action="append",
        default=[],
        metavar="TOKEN",
        help="파일명에 포함되어야 할 문자열 (대소문자 무시). 여러 번 지정 가능.",
    )
    args = p.parse_args()
    tokens = [t.strip() for t in (args.contains or []) if t and str(t).strip()]
    if not tokens:
        print("사용법: python scripts/find-pdfs-under-savepath.py --contains 26-04129 --contains DB3023", file=sys.stderr)
        sys.exit(2)

    default_save = str(_root / "ocr-pipeline" / "input" / "검사결과_PDF")
    save_path = os.environ.get("SAVE_PATH", default_save).strip()
    abs_root = os.path.abspath(save_path)

    print(f"[SAVE_PATH] {abs_root}")
    if not os.path.isdir(abs_root):
        print(f"오류: 디렉터리가 없습니다: {abs_root}", file=sys.stderr)
        sys.exit(1)

    lowered = [t.lower() for t in tokens]
    matches: list[str] = []
    for dirpath, _dirs, files in os.walk(abs_root):
        for fn in files:
            if not fn.lower().endswith(".pdf"):
                continue
            nlow = fn.lower()
            if all(tok in nlow for tok in lowered):
                full = os.path.join(dirpath, fn)
                rel = os.path.relpath(full, abs_root)
                matches.append(rel.replace("\\", "/"))

    matches.sort()
    print(f"[일치] {len(matches)}개 (토큰: {', '.join(tokens)})")
    for rel in matches:
        print(f"  {rel}")
    if not matches:
        sys.exit(1)


if __name__ == "__main__":
    main()
