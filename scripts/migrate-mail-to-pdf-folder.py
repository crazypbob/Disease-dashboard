#!/usr/bin/env python3
"""
메일저장 -> 검사결과_PDF 통합 마이그레이션
See docs/FOLDER-CONSOLIDATION.md

Usage:
  python scripts/migrate-mail-to-pdf-folder.py
  python scripts/migrate-mail-to-pdf-folder.py "X:/질병검사결과/메일저장" "X:/질병메일링_대시보드/검사결과_PDF"
"""
import os
import shutil
import sys
from pathlib import Path

# 기본 경로: 환경변수 또는 프로젝트 기준 추정
src_default = os.environ.get("MAIL_SRC", "X:/질병검사결과/메일저장")
dst_default = os.environ.get("PDF_DST", "X:/질병메일링_대시보드/검사결과_PDF")

if len(sys.argv) >= 2:
    src = Path(sys.argv[1])
else:
    src = Path(src_default)
if len(sys.argv) >= 3:
    dst = Path(sys.argv[2])
else:
    dst = Path(dst_default)

if not src.exists():
    print(f"Source not found: {src}")
    print("  Use: python migrate-mail-to-pdf-folder.py \"X:/질병검사결과/메일저장\" \"X:/질병메일링_대시보드/검사결과_PDF\"")
    sys.exit(1)

files = list(src.rglob("*"))
files = [f for f in files if f.is_file()]
print(f"Source: {src} ({len(files)} files)")
print(f"Dest:   {dst}")

count = 0
for f in files:
    rel = f.relative_to(src)
    dest = dst / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    if not dest.exists() or f.stat().st_mtime > dest.stat().st_mtime:
        shutil.copy2(f, dest)
        count += 1
        if count <= 5 or count % 500 == 0:
            print(f"  copy {rel}")
print(f"Done. {count} files copied.")
