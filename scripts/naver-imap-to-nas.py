#!/usr/bin/env python3
"""
네이버 메일 IMAP → NAS 첨부파일 저장

사용법:
  export NAVER_EMAIL="your@naver.com"
  export NAVER_APP_PASSWORD="xxxx xxxx xxxx xxxx"
  export SAVE_PATH="/volume1/질병검사결과/메일저장"
  python3 naver-imap-to-nas.py
  python3 naver-imap-to-nas.py --verbose-skip   # TARGET_SENDER 스킵 시 stderr에 사유

선택: IMAP_AUDIT_LOG=/path/to/imap-audit.jsonl
  → 저장·실패(선택) 시 JSONL 한 줄씩 append. verify-imap-saves-for-day.py 와 짝.

또는 .env 파일 (프로젝트 루트 scripts/ 에 둘 경우):
  NAVER_EMAIL=...
  NAVER_APP_PASSWORD=...
  SAVE_PATH=/volume1/...
"""
import imaplib
import email
import os
import re
import sys
import argparse
from pathlib import Path
from email.header import decode_header, make_header
import json

_root = Path(__file__).resolve().parent.parent
def _load_env_file(filepath: Path, *, overwrite: bool = False):
    """
    python-dotenv 없이도 동작하도록 env 파일을 직접 파싱한다.
    - overwrite=False면 이미 값이 있는 환경변수는 유지
    """
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
    except Exception:
        return

# 로컬(윈도우) 기본: .env.local
_load_env_file(_root / ".env.local", overwrite=False)
# NAS(리눅스)에서는 env.nas의 자격증명을 써야 하는 경우가 많다.
if os.name != "nt" or os.environ.get("FORCE_ENV_NAS", "").strip() == "1":
    _load_env_file(_root / "env.nas", overwrite=True)

from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

# IMAP date helpers (DD-Mon-YYYY)
_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _imap_date(dt: datetime) -> str:
    return f"{dt.day:02d}-{_MONTHS[dt.month - 1]}-{dt.year}"


def _parse_ymd(s: str) -> datetime:
    return datetime.strptime(s, "%Y-%m-%d")


def _build_search_criteria(unseen_only: bool, since_ymd: str | None, before_ymd: str | None) -> str:
    parts: list[str] = []
    parts.append("UNSEEN" if unseen_only else "ALL")
    if since_ymd:
        parts.append(f"SINCE {_imap_date(_parse_ymd(since_ymd))}")
    if before_ymd:
        parts.append(f"BEFORE {_imap_date(_parse_ymd(before_ymd))}")
    return "(" + " ".join(parts) + ")"


def _get_env():
    email_ = os.environ.get("NAVER_EMAIL", "").strip()
    password_ = os.environ.get("NAVER_APP_PASSWORD", "").strip()
    default_save = str(_root / "ocr-pipeline" / "input" / "검사결과_PDF")
    save_path_ = os.environ.get("SAVE_PATH", default_save).strip()
    target_sender_ = os.environ.get("TARGET_SENDER", "").strip()
    mark_read_ = os.environ.get("MARK_READ", "1") == "1"
    return email_, password_, save_path_, target_sender_, mark_read_


def _imap_seq_str(num) -> str:
    return num.decode("ascii", errors="replace") if isinstance(num, (bytes, bytearray)) else str(num)


def _audit_log_path() -> str | None:
    p = os.environ.get("IMAP_AUDIT_LOG", "").strip()
    return p or None


def _append_imap_audit(rec: dict) -> None:
    """IMAP_AUDIT_LOG 가 있을 때만 JSONL 한 줄 append."""
    p = _audit_log_path()
    if not p:
        return
    try:
        parent = os.path.dirname(os.path.abspath(p))
        if parent:
            os.makedirs(parent, exist_ok=True)
        with open(p, "a", encoding="utf-8") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    except OSError as e:
        print(f"[IMAP_AUDIT_LOG] 쓰기 실패: {e}", file=sys.stderr)


def safe_filename(s: str, max_len: int = 80) -> str:
    s = re.sub(r'[<>:"/\\|?*]', "_", s)
    s = s.strip() or "unknown"
    return s[:max_len]


def decode_mime_header(value: str) -> str:
    """
    RFC2047(=?euc-kr?B?...?=) 같은 인코딩 헤더를 사람이 읽을 수 있는 문자열로 복원.
    """
    if not value:
        return ""
    try:
        return str(make_header(decode_header(value)))
    except Exception:
        return str(value)

_NAVER_MARK_RE = re.compile(r"_=_([A-Za-z0-9-]+)_([bB])_")

def _urlsafe_b64decode_relaxed(s: str) -> bytes:
    t = s.strip().replace(" ", "")
    t = re.sub(r"[_+]+$", "", t)
    pad = (-len(t)) % 4
    t = t + ("=" * pad)
    import base64

    return base64.urlsafe_b64decode(t.encode("ascii", errors="ignore"))

def decode_naver_wrapped(s: str) -> str:
    # rename-mime-filenames.py와 같은 방식(간단판)
    if "_=_euc-kr_" not in (s or "").lower():
        return s
    out_parts: list[str] = []
    i = 0
    while True:
        m = _NAVER_MARK_RE.search(s, i)
        if not m:
            out_parts.append(s[i:])
            break
        out_parts.append(s[i : m.start()])
        charset = (m.group(1) or "").lower()
        enc = (m.group(2) or "").upper()
        payload_start = m.end()
        m2 = _NAVER_MARK_RE.search(s, payload_start)
        payload_end = m2.start() if m2 else len(s)
        payload_raw = s[payload_start:payload_end]
        mm_payload = re.match(r"^[A-Za-z0-9_-]+", payload_raw)
        payload = mm_payload.group(0) if mm_payload else ""
        decoded = None
        if enc == "B" and charset in ("euc-kr", "euckr") and len(payload) >= 12:
            try:
                decoded = _urlsafe_b64decode_relaxed(payload).decode("euc-kr", errors="replace")
            except Exception:
                decoded = None
        if decoded is None:
            out_parts.append(s[m.start():payload_end])
        else:
            rest = payload_raw[len(payload) :]
            out_parts.append(decoded + rest)
        i = payload_end
    t = "".join(out_parts)
    t = re.sub(r"\+?_=_euc-kr[^ ]*", "", t, flags=re.IGNORECASE)
    t = t.replace("_=_euc-kr", "")
    return t

def _dbg(run_id: str, hypothesis_id: str, location: str, message: str, data: dict):
    try:
        root = Path(__file__).resolve().parent.parent
        log_path = (root / "debug-ca78f3.log").resolve()
        payload = {
            "sessionId": "ca78f3",
            "runId": run_id,
            "hypothesisId": hypothesis_id,
            "location": location,
            "message": message,
            "data": data,
            "timestamp": int(datetime.utcnow().timestamp() * 1000),
        }
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(payload, ensure_ascii=False) + "\n")
    except Exception:
        pass


def main():
    parser = argparse.ArgumentParser(description="네이버 메일 IMAP → NAS 첨부 저장 (UNSEEN 기본)")
    parser.add_argument("--all", action="store_true", help="UNSEEN 대신 ALL(읽음/안읽음 무관)로 처리")
    parser.add_argument("--since", type=str, default="", help="YYYY-MM-DD (포함) 이후만")
    parser.add_argument("--before", type=str, default="", help="YYYY-MM-DD (미포함) 이전만")
    parser.add_argument(
        "--verbose-skip",
        action="store_true",
        help="TARGET_SENDER에 걸려 스킵된 메일을 stderr에 한 줄씩 출력",
    )
    args = parser.parse_args()

    run_id = "pre-fix"
    EMAIL, PASSWORD, SAVE_PATH, TARGET_SENDER, MARK_READ = _get_env()
    _dbg(
        run_id,
        "H4",
        "scripts/naver-imap-to-nas.py:env",
        "env-presence",
        {
            "os": os.name,
            "has_EMAIL": bool(EMAIL),
            "has_PASSWORD": bool(PASSWORD),
            "SAVE_PATH": SAVE_PATH,
            "TARGET_SENDER_set": bool(TARGET_SENDER),
            "MARK_READ": MARK_READ,
        },
    )

    if not EMAIL or not PASSWORD:
        print("NAVER_EMAIL, NAVER_APP_PASSWORD 환경변수를 설정하세요.", file=sys.stderr)
        sys.exit(1)

    abs_save = os.path.abspath(SAVE_PATH)
    print(f"[naver-imap] SAVE_PATH (절대경로): {abs_save}")
    print(
        "[naver-imap] 저장 규칙: SAVE_PATH/<메일 Date의 YYYY-MM>/"
        "<YYYYMMDD>_<제목앞40자>_<발신앞30자>_<원본첨부파일명>.pdf"
    )
    print(
        "[naver-imap] 참고: Synology/클라이언트의 '위생도평가/26/상반기' 같은 경로는 "
        "이 스크립트가 만들지 않습니다. OCR은 nas-auto-pipeline이 SAVE_PATH 전체를 os.walk 합니다."
    )
    al = _audit_log_path()
    if al:
        print(f"[naver-imap] IMAP_AUDIT_LOG (쓰기): {os.path.abspath(al)}")

    try:
        mail = imaplib.IMAP4_SSL("imap.naver.com", 993)
        mail.login(EMAIL, PASSWORD)
        mail.select("INBOX")
    except Exception as e:
        print(f"IMAP 로그인 실패: {e}", file=sys.stderr)
        sys.exit(1)

    # 기본은 UNSEEN. 기간이 필요하면 IMAP 서버단에서 같이 거른다.
    since_ymd = args.since.strip() or None
    before_ymd = args.before.strip() or None
    unseen_only = not args.all
    criteria = _build_search_criteria(unseen_only, since_ymd, before_ymd)
    print(
        f"[naver-imap] IMAP 검색: {criteria} | UNSEEN_only={unseen_only} | MARK_READ={MARK_READ}"
    )
    if TARGET_SENDER:
        print(f"[naver-imap] TARGET_SENDER 필터 활성: {TARGET_SENDER!r} (발신 주소에 부분 문자열 포함 시만 저장)")
    status, messages = mail.search(None, criteria)
    if status != "OK":
        print("메일 검색 실패", file=sys.stderr)
        mail.logout()
        sys.exit(1)

    nums = messages[0].split()
    if not nums:
        print(
            "[naver-imap] 검색 결과 메일 0건. "
            "UNSEEN이면 이미 읽음 처리된 메일은 제외됩니다 → python scripts/naver-imap-to-nas.py --all "
            "또는 --since=YYYY-MM-DD 로 재시도."
        )
    saved_count = 0
    target_lower = TARGET_SENDER.lower() if TARGET_SENDER else ""

    for num in nums:
        try:
            status, data = mail.fetch(num, "(RFC822)")
            if status != "OK" or not data:
                continue
            raw = data[0][1]
            msg = email.message_from_bytes(raw)

            if target_lower:
                from_val = msg.get("From") or ""
                from_addr = str(from_val) if from_val else ""
                if target_lower not in from_addr.lower():
                    if args.verbose_skip:
                        subj_head = decode_mime_header(str(msg.get("Subject") or ""))[:100]
                        print(
                            f"[스킵] TARGET_SENDER 불일치 From={from_addr[:120]!r} Subject={subj_head!r}",
                            file=sys.stderr,
                        )
                    continue

            date_header = msg.get("Date") or ""
            try:
                dt = parsedate_to_datetime(date_header)
            except Exception:
                dt = datetime.now()
            month_folder = f"{dt.year}-{dt.month:02d}"  # YYYY-MM (2026-03)
            base_path = os.path.join(SAVE_PATH, month_folder)
            os.makedirs(base_path, exist_ok=True)

            run_id = "pre-fix"
            subject_raw = str(msg.get("Subject") or "제목없음")
            subject_decoded = decode_mime_header(subject_raw)
            subject_unwrapped = decode_naver_wrapped(subject_decoded)
            subject = safe_filename(subject_unwrapped)
            _dbg(
                run_id,
                "H4",
                "scripts/naver-imap-to-nas.py:subject",
                "subject-decode",
                {
                    "subject_raw_head": subject_raw[:80],
                    "decoded_head": subject_decoded[:80],
                    "unwrapped_head": subject_unwrapped[:80],
                    "final_subject_head": subject[:80],
                    "has_naver_wrap": ("_=_euc-kr_" in subject_raw.lower()) or ("_=_euc-kr_" in subject_decoded.lower()),
                    "final_len": len(subject),
                },
            )
            from_val = msg.get("From") or ""
            from_addr = str(from_val) if from_val else ""
            from_short = from_addr.split("@")[0] if "@" in from_addr else "unknown"
            from_short = safe_filename(from_short, 30)
            prefix = dt.strftime("%Y%m%d") + "_" + subject[:40] + "_" + from_short

            has_attachment = False
            for part in msg.walk():
                if part.get_content_maintype() == "multipart":
                    continue
                filename = part.get_filename()
                if filename:
                    filename_raw = filename
                    filename_decoded = decode_mime_header(filename_raw)
                    filename_unwrapped = decode_naver_wrapped(filename_decoded)
                    filename = safe_filename(filename_unwrapped)
                    _dbg(
                        run_id,
                        "H4",
                        "scripts/naver-imap-to-nas.py:filename",
                        "filename-decode",
                        {
                            "raw": str(filename_raw)[:80],
                            "decoded": str(filename_decoded)[:80],
                            "unwrapped": str(filename_unwrapped)[:80],
                            "final": str(filename)[:80],
                            "final_len": len(str(filename)),
                        },
                    )
                    if not filename:
                        continue
                    filepath = os.path.join(base_path, f"{prefix}_{filename}")
                    n = 1
                    while os.path.exists(filepath):
                        stem, ext = os.path.splitext(filename)
                        filepath = os.path.join(base_path, f"{prefix}_{stem}_{n}{ext}")
                        n += 1
                    try:
                        payload = part.get_payload(decode=True)
                        if payload:
                            with open(filepath, "wb") as f:
                                f.write(payload)
                            saved_count += 1
                            has_attachment = True
                            print(f"저장: {os.path.abspath(filepath)}")
                            abspath = os.path.abspath(filepath)
                            rel = os.path.relpath(abspath, os.path.abspath(SAVE_PATH))
                            fnl = filename.lower() if filename else ""
                            k = "pdf" if fnl.endswith(".pdf") else "file"
                            _append_imap_audit(
                                {
                                    "ts_iso": datetime.now(timezone.utc).isoformat(),
                                    "imap_seq": _imap_seq_str(num),
                                    "month_folder": month_folder,
                                    "file_prefix": prefix,
                                    "rel_path": rel.replace("\\", "/"),
                                    "bytes": len(payload),
                                    "kind": k,
                                    "subject_head": (subject_decoded or "")[:100],
                                    "from_head": (from_addr or "")[:100],
                                }
                            )
                    except Exception as e:
                        print(f"저장 실패 {filepath}: {e}", file=sys.stderr)
                        _append_imap_audit(
                            {
                                "ts_iso": datetime.now(timezone.utc).isoformat(),
                                "imap_seq": _imap_seq_str(num),
                                "month_folder": month_folder,
                                "file_prefix": prefix,
                                "error": f"save_attachment: {e}"[:500],
                            }
                        )

            # 첨부 없으면 .eml로 본문 저장
            if not has_attachment:
                eml_path = os.path.join(base_path, f"{prefix}.eml")
                try:
                    with open(eml_path, "wb") as f:
                        f.write(raw)
                    raw_b = raw if isinstance(raw, (bytes, bytearray)) else bytes(raw)
                    saved_count += 1
                    print(f"저장(eml): {os.path.abspath(eml_path)}")
                    abse = os.path.abspath(eml_path)
                    rel = os.path.relpath(abse, os.path.abspath(SAVE_PATH))
                    _append_imap_audit(
                        {
                            "ts_iso": datetime.now(timezone.utc).isoformat(),
                            "imap_seq": _imap_seq_str(num),
                            "month_folder": month_folder,
                            "file_prefix": prefix,
                            "rel_path": rel.replace("\\", "/"),
                            "bytes": len(raw_b),
                            "kind": "eml",
                            "subject_head": (subject_decoded or "")[:100],
                            "from_head": (from_addr or "")[:100],
                        }
                    )
                except Exception as e:
                    print(f"eml 저장 실패: {e}", file=sys.stderr)
                    _append_imap_audit(
                        {
                            "ts_iso": datetime.now(timezone.utc).isoformat(),
                            "imap_seq": _imap_seq_str(num),
                            "month_folder": month_folder,
                            "file_prefix": prefix,
                            "error": f"save_eml: {e}"[:500],
                        }
                    )

            if MARK_READ:
                mail.store(num, "+FLAGS", "\\Seen")

        except Exception as e:
            print(f"메일 처리 오류 {num}: {e}", file=sys.stderr)

    mail.logout()
    print(f"완료: {saved_count}개 저장")


if __name__ == "__main__":
    main()
