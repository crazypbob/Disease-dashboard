#!/usr/bin/env python3
"""
네이버 IMAP 저장 과정에서 파일명이 RFC2047/유사 인코딩(_=_euc-kr_B_..._=_ 등)으로 깨져 저장된 경우,
사람이 읽을 수 있도록 파일명을 디코딩하여 리네임한다.

사용:
  python scripts/rename-mime-filenames.py --month=2026-04 --dry-run
  python scripts/rename-mime-filenames.py --month=2026-04

옵션:
  --root=...   (기본: .env.local의 SAVE_PATH 또는 ocr-pipeline/input/검사결과_PDF)
  --month=YYYY-MM
  --all-months
  --dry-run
"""

from __future__ import annotations

import argparse
import base64
import os
import re
from pathlib import Path
from email.header import decode_header, make_header


def _load_env_local() -> None:
    env_path = Path(__file__).resolve().parent.parent / ".env.local"
    if not env_path.exists():
        return
    try:
        from dotenv import load_dotenv  # type: ignore

        load_dotenv(env_path)
    except Exception:
        # python-dotenv 미설치 환경도 있으므로 무시
        return


def safe_filename(name: str, max_len: int = 160) -> str:
    # Windows 금지 문자 치환
    name = re.sub(r'[<>:"/\\|?*]', "_", name)
    name = name.replace("\0", "_")
    name = re.sub(r"\s+", " ", name).strip()
    if not name:
        name = "unknown"
    return name[:max_len]


def decode_rfc2047(s: str) -> str:
    if not s:
        return ""
    try:
        return str(make_header(decode_header(s)))
    except Exception:
        return s


_NAVER_MARK_RE = re.compile(r"_=_([A-Za-z0-9-]+)_([bB])_")


def _urlsafe_b64decode_relaxed(s: str) -> bytes:
    """
    파일명에 섞인 base64url 조각을 최대한 관대하게 디코딩.
    - 공백 제거
    - 끝부분의 '_' 같은 구분자 흔적 제거
    """
    t = s.strip().replace(" ", "")
    # 흔한 구분자/잔여물 제거
    t = re.sub(r"[_+]+$", "", t)
    pad = (-len(t)) % 4
    t = t + ("=" * pad)
    return base64.urlsafe_b64decode(t.encode("ascii", errors="ignore"))


def decode_naver_wrapped(s: str) -> str:
    """
    네이버 저장 파일명에서 종종 보이는 형태를 처리한다.
    예:
      ... _=_euc-kr_B_<payload>_+_=_euc-kr_b_<payload>_= ...

    특징:
    - 종결자(_=_)가 누락/변형되는 경우가 있어, 다음 마커가 나오기 전까지를 payload로 본다.
    """
    if "_=_euc-kr_" not in s.lower():
        return s

    out_parts: list[str] = []
    i = 0
    lower = s.lower()
    while True:
        m = _NAVER_MARK_RE.search(s, i)
        if not m:
            out_parts.append(s[i:])
            break
        start = m.start()
        out_parts.append(s[i:start])
        charset = (m.group(1) or "").lower()
        enc = (m.group(2) or "").upper()
        payload_start = m.end()

        # 다음 마커까지 payload로 본다(종결자가 없을 수 있음)
        m2 = _NAVER_MARK_RE.search(s, payload_start)
        payload_end = m2.start() if m2 else len(s)
        payload_raw = s[payload_start:payload_end]
        # payload는 base64url 문자로만 구성된 prefix만 취한다(중간에 공백/괄호 등이 섞이면 그 지점에서 종료)
        mm_payload = re.match(r"^[A-Za-z0-9_-]+", payload_raw)
        payload = mm_payload.group(0) if mm_payload else ""

        decoded = None
        if enc == "B" and charset in ("euc-kr", "euckr"):
            try:
                if len(payload) >= 12:
                    raw = _urlsafe_b64decode_relaxed(payload)
                    decoded = raw.decode("euc-kr", errors="replace")
            except Exception:
                decoded = None

        if decoded is None:
            # 디코딩 실패 시 원문 보존
            out_parts.append(s[m.start():payload_end])
        else:
            # base64 payload 뒤에 남은 문자열은 그대로 둔다
            rest = payload_raw[len(payload) :]
            out_parts.append(decoded + rest)

        i = payload_end

    return "".join(out_parts)


def decode_filename(name: str) -> str:
    # 1) RFC2047 (=?euc-kr?B?...?=) 대응
    s = decode_rfc2047(name)
    # 2) 네이버 래핑 토큰 대응
    s = decode_naver_wrapped(s)
    # 3) 깨진 마커 잔여물 정리(두 번째 조각이 깨진 경우가 많음)
    s = re.sub(r"\+?_=_euc-kr[^ ]*", "", s, flags=re.IGNORECASE)
    s = s.replace("_=_euc-kr", "")
    return safe_filename(s)


def rename_in_folder(folder: Path, dry_run: bool) -> tuple[int, int]:
    renamed = 0
    skipped = 0

    for p in sorted(folder.glob("*.pdf")):
        old = p.name
        if "=?".lower() not in old.lower() and "_=_euc-kr_" not in old.lower():
            skipped += 1
            continue

        new_name = decode_filename(old)
        # 의미 있는 디코딩만 리네임(한글/영문이 전혀 없거나, 대체문자(�)가 있으면 스킵)
        if ("�" in new_name) or (re.search(r"[A-Za-z가-힣]", new_name) is None):
            skipped += 1
            continue
        if new_name == old:
            skipped += 1
            continue

        target = p.with_name(new_name)
        # 충돌 회피: _1, _2...
        n = 1
        while target.exists():
            stem = target.stem
            ext = target.suffix
            target = p.with_name(f"{stem}_{n}{ext}")
            n += 1

        if dry_run:
            # Windows 콘솔(cp949)에서 출력 불가 문자가 섞일 수 있어 안전 출력으로 폴백
            line = f"[dry-run] {old}  ->  {target.name}"
            try:
                print(line)
            except UnicodeEncodeError:
                print(line.encode("utf-8", errors="backslashreplace").decode("ascii", errors="ignore"))
            renamed += 1
            continue

        p.rename(target)
        line = f"renamed: {old}  ->  {target.name}"
        try:
            print(line)
        except UnicodeEncodeError:
            print(line.encode("utf-8", errors="backslashreplace").decode("ascii", errors="ignore"))
        renamed += 1

    return renamed, skipped


def main() -> None:
    _load_env_local()
    default_root = os.environ.get("SAVE_PATH", "").strip()
    if not default_root:
        default_root = str(Path(__file__).resolve().parent.parent / "ocr-pipeline" / "input" / "검사결과_PDF")

    ap = argparse.ArgumentParser()
    ap.add_argument("--root", type=str, default=default_root)
    ap.add_argument("--month", type=str, default="")
    ap.add_argument("--all-months", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    root = Path(args.root)
    if not root.exists():
        raise SystemExit(f"root not found: {root}")

    months: list[Path] = []
    if args.all_months:
        months = [p for p in root.iterdir() if p.is_dir() and re.match(r"^\d{4}-\d{2}$", p.name)]
        months.sort(key=lambda x: x.name)
    else:
        if not args.month:
            raise SystemExit("--month=YYYY-MM 또는 --all-months 필요")
        months = [root / args.month]

    total_renamed = 0
    total_skipped = 0
    for m in months:
        if not m.exists():
            print(f"skip missing: {m}")
            continue
        print(f"\n== folder: {m} ==")
        r, s = rename_in_folder(m, args.dry_run)
        total_renamed += r
        total_skipped += s

    print(f"\nDONE. renamed={total_renamed}, skipped={total_skipped}, dry_run={args.dry_run}")


if __name__ == "__main__":
    main()

