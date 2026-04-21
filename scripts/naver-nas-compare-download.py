#!/usr/bin/env python3
"""
네이버 메일 PDF vs NAS 보유 파일 비교 → 누락분만 다운로드

사용법:
  export NAVER_EMAIL="your@naver.com"
  export NAVER_APP_PASSWORD="xxxx xxxx xxxx xxxx"
  export SAVE_PATH="X:/질병메일링_대시보드/검사결과_PDF"   # 통합 PDF 저장소

  # 전체 메일 비교, 누락분 다운로드 (보유 파일은 스킵)
  python3 naver-nas-compare-download.py

  # 시뮬레이션만 (다운로드 없이 누락 개수만 확인)
  python3 naver-nas-compare-download.py --dry-run

환경변수:
  TARGET_SENDER: 빈 문자열이면 전체 메일. 값이 있으면 해당 발신자만 (쉼표로 복수 가능)
  NAVER_MAILBOX: 기본 INBOX. 다른 폴더 사용 시 지정
  EXISTING_PDF_PATH: 기존 보유 PDF 폴더 (검사결과_PDF 등). 이 경로의 PDF도 '이미 있음'으로 간주
  NAS_COMPARE_SHORT_ATTACHMENT_NAMES_SENDERS: 쉼표로 구분. From 주소에 부분 문자열이 하나라도
    있으면 저장 파일명을 ``YYYYMMDD_제목_발신자_원본.pdf`` 가 아니라 **첨부 원본명만**
    (``YYYY-MM/원본.pdf``) 사용. 전북대 vetdxlab 스크립트와 별개이며, 이 스크립트는
    **모든 발신자**에 동일하게 날짜+제목+발신자 접두사를 붙이는 것이 기본이다.

파일명 정책 (기본):
  ``{월폴더}/{YYYYMMDD}_{제목40자}_{발신자local}_{첨부원본파일명}.pdf``
  옵티팜 등 첨부가 ``(혈청) 26-xxxxx 농장.pdf`` 처럼 짧아도, 위 접두사 때문에 경로가 길어진다.
"""
import imaplib
import email
import os
import re
import sys
import argparse
from datetime import datetime, date
from email.utils import parsedate_to_datetime
from email.header import decode_header
from pathlib import Path

_env = Path(__file__).resolve().parent.parent / ".env.local"
if _env.exists():
    try:
        from dotenv import load_dotenv
        load_dotenv(_env)
    except ImportError:
        pass

EMAIL = os.environ.get("NAVER_EMAIL", "").strip()
PASSWORD = os.environ.get("NAVER_APP_PASSWORD", "").strip()
# 기본: ocr-pipeline/input/검사결과_PDF
_script_dir = os.path.dirname(os.path.abspath(__file__))
_default_save = os.path.normpath(os.path.join(_script_dir, "..", "ocr-pipeline", "input", "검사결과_PDF"))
SAVE_PATH = os.environ.get("SAVE_PATH", _default_save).strip()
# 쉼표로 구분된 발신자 (빈 문자열이면 전체)
TARGET_SENDER_RAW = os.environ.get("TARGET_SENDER", "").strip()
TARGET_SENDERS = [s.strip().lower() for s in TARGET_SENDER_RAW.split(",") if s.strip()]
MAILBOX = os.environ.get("NAVER_MAILBOX", "INBOX").strip()
# 기존 PDF 보유 폴더 — SAVE_PATH와 동일 (ocr-pipeline/input/검사결과_PDF)
_env_existing = os.environ.get("EXISTING_PDF_PATH", "").strip()
EXISTING_PDF_PATH = _env_existing if _env_existing else SAVE_PATH
# 전북대(jbnu.ac.kr): 파일명에 아래 포함 시 제외 — [최종결과] [중간결과] 제외, 나머지 검사만 수신
JBNU_EXCLUDE_PDF = ("최종결과", "중간결과")
# 짧은 첨부명 유지: From 에 부분 문자열 일치 시 prefix 없이 원본 파일명만 (월 폴더 아래)
NAS_COMPARE_SHORT_ATTACHMENT_NAMES_SENDERS = [
    s.strip().lower()
    for s in os.environ.get("NAS_COMPARE_SHORT_ATTACHMENT_NAMES_SENDERS", "").split(",")
    if s.strip()
]

_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _imap_date(d: date) -> str:
    # IMAP date format: DD-Mon-YYYY
    return f"{d.day:02d}-{_MONTHS[d.month - 1]}-{d.year}"


def _parse_ymd(s: str) -> date:
    return datetime.strptime(s, "%Y-%m-%d").date()


def _build_search_criteria(since_ymd: str | None, before_ymd: str | None) -> str:
    # compare 스크립트는 ALL 기반 (읽음 여부 무관)
    parts: list[str] = ["ALL"]
    if since_ymd:
        parts.append(f"SINCE {_imap_date(_parse_ymd(since_ymd))}")
    if before_ymd:
        parts.append(f"BEFORE {_imap_date(_parse_ymd(before_ymd))}")
    return "(" + " ".join(parts) + ")"


def safe_filename(s: str, max_len: int = 80) -> str:
    s = re.sub(r'[<>:"/\\|?*]', "_", s)
    s = s.strip() or "unknown"
    return s[:max_len]


def get_attachment_filename(part) -> str | None:
    """첨부파일명 추출 (RFC 2047/2231 인코딩 지원)"""
    name = part.get_filename()
    if name:
        if "=?" in str(name):
            try:
                decoded = decode_header(name)
                parts = []
                for b, enc in decoded:
                    if isinstance(b, bytes):
                        parts.append(b.decode(enc or "utf-8", errors="replace"))
                    else:
                        parts.append(str(b))
                return "".join(parts) if parts else name
            except Exception:
                pass
        return name
    # Content-Type name= 또는 Content-Disposition filename= 파라미터 시도
    for header in ("Content-Disposition", "Content-Type"):
        raw = part.get(header, "")
        if not raw:
            continue
        for param in ("filename", "filename*", "name"):
            m = re.search(rf'{param}\s*=\s*["\']?([^"\';\s]+)["\']?', raw, re.I)
            if m:
                val = m.group(1).strip()
                if "=?" in val:
                    try:
                        dec = decode_header(val)
                        return "".join(
                            b.decode(c or "utf-8", errors="replace") if isinstance(b, bytes) else str(b)
                            for b, c in dec
                        )
                    except Exception:
                        pass
                return val
    return None


def build_existing_index(existing_path: str) -> set[str]:
    """기존 PDF 폴더(검사결과_PDF 등)에서 파일명/식별자 수집 — 매칭용"""
    if not existing_path or not os.path.isdir(existing_path):
        return set()
    ids = set()
    for root, _dirs, files in os.walk(existing_path):
        for f in files:
            if not f.lower().endswith(".pdf"):
                continue
            base, _ = os.path.splitext(f)
            ids.add(base.lower())
            # 접수번호 패턴 (26-01234, 25-12345 등) 추출
            for m in re.finditer(r"\d{2,4}-\d{4,}", base):
                ids.add(m.group(0).lower())
    return ids


def would_exist_on_nas(
    base_path: str,
    prefix: str,
    filename: str,
    existing_index: set[str] | None = None,
    *,
    skip_check: bool = False,
    short_attachment_name: bool = False,
) -> bool:
    """해당 파일이 NAS에 이미 있으면 True (SAVE_PATH + EXISTING_PDF_PATH)"""
    if skip_check:
        return False
    # 1) SAVE_PATH (naver-imap 형식) 확인
    if short_attachment_name:
        main_path = os.path.join(base_path, filename)
        if os.path.exists(main_path):
            return True
        stem, ext = os.path.splitext(filename)
        for n in range(1, 20):
            variant = os.path.join(base_path, f"{stem}_{n}{ext}")
            if os.path.exists(variant):
                return True
    else:
        main_path = os.path.join(base_path, f"{prefix}_{filename}")
        if os.path.exists(main_path):
            return True
        stem, ext = os.path.splitext(filename)
        for n in range(1, 20):
            variant = os.path.join(base_path, f"{prefix}_{stem}_{n}{ext}")
            if os.path.exists(variant):
                return True
    # 2) EXISTING_PDF_PATH (검사결과_PDF 등) 인덱스 확인
    # 과도한 매칭 방지: 접수번호(26-01234) 또는 파일명 전체 일치만 인정
    if existing_index:
        base_lower = stem.lower()
        if base_lower in existing_index:
            return True
        for m in re.finditer(r"\d{2,4}-\d{4,}", stem):
            if m.group(0).lower() in existing_index:
                return True
        # 1001성진, 3001조산 등 농장코드+이름으로 된 파일명: 해당 조합이 정확히 있을 때만
        farm_match = re.search(r"(\d{4})(성진|관인|남도|조산)", base_lower)
        if farm_match and farm_match.group(0) in existing_index:
            return True
    return False


def main():
    parser = argparse.ArgumentParser(description="네이버 메일 PDF vs NAS 비교, 누락분 다운로드")
    parser.add_argument("--dry-run", action="store_true", help="다운로드 없이 누락 개수만 확인")
    parser.add_argument("--pdf-only", action="store_true", default=True, help="PDF만 대상 (기본)")
    parser.add_argument("--no-pdf-only", action="store_false", dest="pdf_only", help="PDF 외 첨부도 포함")
    parser.add_argument("--debug", action="store_true", help="첫 5개 메일 첨부 구조 출력 (PDF 0건일 때 진단용)")
    parser.add_argument("--no-existing-check", action="store_true", help="검사결과_PDF 확인 스킵 (모두 '누락'으로 처리, 누락 강제 다운로드용)")
    parser.add_argument("--since", type=str, default="", help="YYYY-MM-DD (포함) 이후 메일만")
    parser.add_argument("--before", type=str, default="", help="YYYY-MM-DD (미포함) 이전 메일만")
    args = parser.parse_args()

    if not EMAIL or not PASSWORD:
        print("NAVER_EMAIL, NAVER_APP_PASSWORD 환경변수를 설정하세요.", file=sys.stderr)
        sys.exit(1)

    try:
        mail = imaplib.IMAP4_SSL("imap.naver.com", 993)
        mail.login(EMAIL, PASSWORD)
        mail.select(MAILBOX)
    except Exception as e:
        print(f"IMAP 로그인 실패: {e}", file=sys.stderr)
        sys.exit(1)

    since_ymd = args.since.strip() or None
    before_ymd = args.before.strip() or None
    if since_ymd:
        print(f"  [--since={since_ymd}] 지정 날짜(포함) 이후만", file=sys.stderr)
    if before_ymd:
        print(f"  [--before={before_ymd}] 지정 날짜(미포함) 이전만", file=sys.stderr)

    # 전체 메일 검색 (서버단 날짜 필터 적용) — 발신자 필터는 루프에서 적용
    criteria = _build_search_criteria(since_ymd, before_ymd)
    status, messages = mail.search(None, criteria)
    if status != "OK":
        print("메일 검색 실패", file=sys.stderr)
        mail.logout()
        sys.exit(1)

    existing_index = None if args.no_existing_check else (build_existing_index(EXISTING_PDF_PATH) if EXISTING_PDF_PATH else None)
    if existing_index:
        print(f"  기존 PDF 폴더 반영: {EXISTING_PDF_PATH} ({len(existing_index)}개 식별자)", file=sys.stderr)
    elif args.no_existing_check:
        print("  [--no-existing-check] 기존 폴더 확인 스킵, 매칭되는 모든 PDF를 다운로드 대상으로 처리", file=sys.stderr)

    nums = messages[0].split()
    total_emails = len(nums)
    total_pdfs = 0
    already_on_nas = 0
    newly_downloaded = 0
    skipped_sender = 0
    debug_count = 0
    debug_jbnu_attach = 0
    jbnu_excluded = 0  # 전북대 [최종/중간결과] 제외 건수

    def is_pdf(name: str) -> bool:
        return name.lower().endswith(".pdf") if name else False

    for i, num in enumerate(nums):
        if (i + 1) % 50 == 0:
            print(f"  진행: {i+1}/{total_emails} 메일...", file=sys.stderr)
        try:
            status, data = mail.fetch(num, "(RFC822)")
            if status != "OK" or not data:
                continue
            raw = data[0][1]
            msg = email.message_from_bytes(raw)

            from_val = msg.get("From") or ""
            from_addr = str(from_val).lower() if from_val else ""
            if TARGET_SENDERS and not any(s in from_addr for s in TARGET_SENDERS):
                skipped_sender += 1
                continue

            if args.debug and debug_count < 5:
                debug_count += 1
                print(f"\n  [DEBUG 메일 {debug_count}] From={msg.get('From','')[:60]} Subject={str(msg.get('Subject',''))[:50]}", file=sys.stderr)

            date_header = msg.get("Date") or ""
            try:
                dt = parsedate_to_datetime(date_header)
            except Exception:
                dt = datetime.now()
            month_folder = f"{dt.year}-{dt.month:02d}"  # YYYY-MM (2026-03)
            base_path = os.path.join(SAVE_PATH, month_folder)
            os.makedirs(base_path, exist_ok=True)

            subject = safe_filename(str(msg.get("Subject") or "제목없음"))
            from_short = from_addr.split("@")[0] if "@" in from_addr else "unknown"
            from_short = safe_filename(from_short, 30)
            prefix = dt.strftime("%Y%m%d") + "_" + subject[:40] + "_" + from_short
            use_short_attachment = bool(NAS_COMPARE_SHORT_ATTACHMENT_NAMES_SENDERS) and any(
                s in from_addr for s in NAS_COMPARE_SHORT_ATTACHMENT_NAMES_SENDERS
            )

            for part in msg.walk():
                if part.get_content_maintype() == "multipart":
                    continue
                filename = get_attachment_filename(part)
                if args.debug and debug_jbnu_attach < 10 and "jbnu" in from_addr:
                    debug_jbnu_attach += 1
                    ct = part.get_content_type()
                    raw_fn = part.get_filename()
                    print(f"  [DEBUG 전북대 첨부 #{debug_jbnu_attach}] Content-Type={ct} raw={raw_fn!r} decoded={filename!r} is_pdf={is_pdf(filename or '') if filename else False}", file=sys.stderr)
                if not filename:
                    continue
                filename = safe_filename(filename)
                if not filename:
                    continue
                if args.pdf_only and not is_pdf(filename):
                    continue
                # 전북대 메일: [최종결과] [중간결과] 제외, 나머지 검사 PDF만 수신
                if "jbnu.ac.kr" in from_addr and any(ex in filename for ex in JBNU_EXCLUDE_PDF):
                    jbnu_excluded += 1
                    continue
                total_pdfs += 1

                if would_exist_on_nas(
                    base_path,
                    prefix,
                    filename,
                    existing_index,
                    skip_check=args.no_existing_check,
                    short_attachment_name=use_short_attachment,
                ):
                    already_on_nas += 1
                    continue

                if args.dry_run:
                    newly_downloaded += 1
                    disp = filename if use_short_attachment else f"{prefix}_{filename}"
                    print(f"  [누락] {disp}")
                    continue

                if use_short_attachment:
                    filepath = os.path.join(base_path, filename)
                    n = 1
                    while os.path.exists(filepath):
                        stem, ext = os.path.splitext(filename)
                        filepath = os.path.join(base_path, f"{stem}_{n}{ext}")
                        n += 1
                else:
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
                        newly_downloaded += 1
                        print(f"  저장: {os.path.basename(filepath)}")
                except Exception as e:
                    print(f"  저장 실패 {filename}: {e}", file=sys.stderr)

        except Exception as e:
            print(f"  메일 처리 오류 {num}: {e}", file=sys.stderr)

    mail.logout()

    print()
    print("=== 비교 결과 ===")
    print(f"  검사한 메일: {total_emails}건" + (f" (발신자 필터로 스킵: {skipped_sender}건)" if skipped_sender else ""))
    if jbnu_excluded:
        print(f"  전북대 [최종/중간결과] 제외: {jbnu_excluded}건")
    print(f"  PDF 첨부: {total_pdfs}건")
    print(f"  NAS에 이미 있음: {already_on_nas}건")
    print(f"  누락 → {'다운로드함' if not args.dry_run else '다운로드 대상'}: {newly_downloaded}건")
    if args.dry_run and newly_downloaded > 0:
        print()
        print("실제 다운로드하려면 --dry-run 없이 실행하세요.")
    if total_pdfs == 0 and total_emails > 0:
        print()
        print("※ PDF 0건인 경우: --debug 옵션으로 첨부 구조 확인, 또는 TARGET_SENDER 비우고 전체 메일 대상 실행")


if __name__ == "__main__":
    main()
