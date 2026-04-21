#!/usr/bin/env python3
"""
전북대 메일 본문의 vetdxlab.com PDF 링크 → 다운로드

메일에 첨부가 아닌 vetdxlab.com 링크가 있고, 클릭 시 로그인 없이 PDF가 열림.
본문 HTML에서 링크 추출 후 [최종결과] [중간결과] 제외한 검사 PDF만 다운로드.

사용법:
  export NAVER_EMAIL="your@naver.com"
  export NAVER_APP_PASSWORD="xxxx xxxx xxxx xxxx"
  export SAVE_PATH="X:/질병검사결과/메일저장"

  python scripts/naver-vetdxlab-download.py
  python scripts/naver-vetdxlab-download.py --dry-run

  # 신규(UNSEEN) 메일만 처리 (파이프라인용, naver-imap 전에 실행)
  python scripts/naver-vetdxlab-download.py --unseen

  # 최대 N건만 다운로드 (테스트용, 진행 상황 출력)
  python scripts/naver-vetdxlab-download.py --limit=5

  # URL 1개 디버그 (vetdxlab 링크 붙여넣기)
  python scripts/naver-vetdxlab-download.py --debug-url="https://..."

  # 손상/비정상 PDF 파일 삭제 (29KB HTML 등)
  python scripts/naver-vetdxlab-download.py --remove-invalid
"""
import email
import imaplib
from pathlib import Path
_env = Path(__file__).resolve().parent.parent / ".env.local"
if _env.exists():
    try:
        from dotenv import load_dotenv
        load_dotenv(_env)
    except ImportError:
        pass

import os
import re
import sys
import time
import urllib.request
from datetime import datetime, date
from email.header import decode_header
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse, parse_qs, unquote

EMAIL = os.environ.get("NAVER_EMAIL", "").strip()
PASSWORD = os.environ.get("NAVER_APP_PASSWORD", "").strip()
# 기본: ocr-pipeline/input/검사결과_PDF
_naver_script_dir = Path(__file__).resolve().parent
_DEFAULT_SAVE = str(_naver_script_dir.parent / "ocr-pipeline" / "input" / "검사결과_PDF")
SAVE_PATH = os.environ.get("SAVE_PATH", _DEFAULT_SAVE).strip()
# vetdxlab은 전북대 메일용. 비어있으면 jbnu 기본값
TARGET_SENDER_RAW = os.environ.get("TARGET_SENDER", "jb5219@jbnu.ac.kr").strip()
TARGET_SENDER_RAW = TARGET_SENDER_RAW or "jb5219@jbnu.ac.kr"
TARGET_SENDERS = [s.strip().lower() for s in TARGET_SENDER_RAW.split(",") if s.strip()]
MAILBOX = os.environ.get("NAVER_MAILBOX", "INBOX").strip()
VETDXLAB_DOMAIN = "vetdxlab.com"
JBNU_EXCLUDE = ("최종결과", "중간결과")
# 링크 텍스트가 아래 포함 시 제외 (홈페이지 링크, Excel 등)
LINK_TEXT_EXCLUDE = ("홈페이지 바로가기", ".xlsx", ".xls", ".xlsm", ".csv")

_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _imap_date(d: date) -> str:
    # IMAP date format: DD-Mon-YYYY (e.g. 26-Mar-2026)
    return f"{d.day:02d}-{_MONTHS[d.month - 1]}-{d.year}"


def _parse_ymd(s: str) -> date:
    return datetime.strptime(s, "%Y-%m-%d").date()


def _build_search_criteria(unseen_only: bool, since_ymd: str | None, before_ymd: str | None) -> str:
    parts: list[str] = []
    parts.append("UNSEEN" if unseen_only else "ALL")
    if since_ymd:
        parts.append(f"SINCE {_imap_date(_parse_ymd(since_ymd))}")
    if before_ymd:
        parts.append(f"BEFORE {_imap_date(_parse_ymd(before_ymd))}")
    return "(" + " ".join(parts) + ")"


def safe_filename(s: str, max_len: int = 80) -> str:
    s = re.sub(r'[<>:"/\\|?*\[\]]', "_", s)
    s = s.strip() or "unknown"
    return s[:max_len]


class LinkExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links: list[tuple[str, str]] = []
        self._current_href: str | None = None
        self._current_text: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            href = next((v for k, v in attrs if k == "href"), "")
            if href and VETDXLAB_DOMAIN in href:
                self._current_href = href
                self._current_text = []
            else:
                self._current_href = None

    def handle_data(self, data):
        if self._current_href is not None:
            self._current_text.append(data)

    def handle_endtag(self, tag):
        if tag == "a" and self._current_href:
            text = "".join(self._current_text).strip()
            if not any(ex in text for ex in JBNU_EXCLUDE):
                if any(ex in text for ex in LINK_TEXT_EXCLUDE):
                    self._current_href = None
                    return
                if self._current_href.startswith("http"):
                    self.links.append((self._current_href, text or "pdf"))
            self._current_href = None


def extract_vetdxlab_links(html: str) -> list[tuple[str, str]]:
    parser = LinkExtractor()
    try:
        parser.feed(html)
    except Exception:
        return []
    # 같은 메일 내 URL 중복 제거 (같은 PDF가 여러 곳에 링크된 경우)
    seen: dict[str, str] = {}
    for url, text in parser.links:
        if url not in seen or len(text) > len(seen.get(url, "")):
            seen[url] = text
    return list(seen.items())


def get_html_body(msg) -> str:
    html = ""
    if msg.is_multipart():
        for part in msg.walk():
            ct = part.get_content_type()
            if ct == "text/html":
                payload = part.get_payload(decode=True)
                if payload:
                    html = payload.decode("utf-8", errors="replace")
                break
    else:
        if msg.get_content_type() == "text/html":
            payload = msg.get_payload(decode=True)
            if payload:
                html = payload.decode("utf-8", errors="replace")
    return html


def _extract_pdf_url_from_viewer(url: str, html: str) -> str | None:
    """PDF.js 뷰어 URL/HTML에서 실제 PDF URL 추출."""
    parsed = urlparse(url)
    base = f"{parsed.scheme}://{parsed.netloc}"

    # 1) 요청 URL의 ?file= 파라미터 (PDF.js 표준)
    qs = parse_qs(parsed.query)
    for key in ("file", "pdf", "document", "src"):
        if key in qs:
            raw = qs[key][0]
            candidate = unquote(raw)
            if not candidate.startswith("http"):
                candidate = urljoin(base, candidate)
            if "vetdxlab" in candidate or ".pdf" in candidate.lower() or "/getPdf" in candidate or "/pdf" in candidate.lower():
                return candidate

    # 2) HTML에서 PDF/API URL 패턴 검색
    patterns = [
        r'file=([^"&\s]+)',
        r'["\'](https?://[^"\']+\.pdf(?:\?[^"\']*)?)["\']',
        r'pdfUrl\s*[:=]\s*["\']([^"\']+)["\']',
        r'getDocument\s*\(\s*["\']([^"\']+)["\']',
        r'url\s*[:=]\s*["\']([^"\']+)["\']',
        r'(https?://[^"\'<>\s]+/getPdf[^"\'<>\s]*)',
        r'(https?://[^"\'<>\s]+/viewPdf[^"\'<>\s]*)',
        r'(https?://[^"\'<>\s]+/pdf/[^"\'<>\s]+)',
        r'(https?://[^"\'<>\s]+/report[^"\'<>\s]+)',
    ]
    for pat in patterns:
        for m in re.finditer(pat, html, re.I):
            c = unquote(m.group(1).strip())
            if "{" in c or "}" in c or len(c) < 10:
                continue
            if not c.startswith("http"):
                c = urljoin(base, c)
            if "vetdxlab" in c or ".pdf" in c.lower() or "getPdf" in c or "viewPdf" in c:
                return c
    return None


def _is_valid_pdf_content(data: bytes) -> tuple[bool, str | None]:
    """바이트가 유효한 PDF인지 검증. (유효여부, 실패사유) 반환."""
    if len(data) < 200:
        return False, f"너무 짧음 ({len(data)} bytes)"
    if not data.lstrip().startswith(b"%PDF"):
        return False, "PDF 시그니처 없음"
    # HTML이 PDF로 위장한 경우 (일부 서버가 Content-Type: application/pdf로 HTML 반환)
    head = data[:8000].lower()
    if b"<!doctype" in head or b"<html" in head or b"<script" in head or b"charset=" in head:
        return False, "HTML 응답 감지"
    # PDF는 %%EOF 로 끝나야 함 (표준 구조)
    if b"%%EOF" not in data and b"%%eof" not in data:
        return False, "%%EOF 없음 (손상/비정상 PDF)"
    return True, None


def _fetch_url(url: str, timeout: int, headers: dict) -> tuple[bytes, str | None]:
    """URL GET. (바디, 에러메시지) 반환."""
    try:
        try:
            import requests
            r = requests.get(url, headers=headers, timeout=timeout, stream=True)
            r.raise_for_status()
            return r.content, None
        except ImportError:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read(), None
    except Exception as e:
        return b"", str(e)


def download_pdf(url: str, filepath: str, timeout: int = 60) -> tuple[bool, str | None]:
    """다운로드 시도. (성공여부, 실패시 사유) 반환. HTML 응답 시 내부 PDF URL 추출 시도."""
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/pdf,text/html,*/*;q=0.9",
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
        "Referer": "https://www.vetdxlab.com/",
    }
    urls_to_try: list[str] = [url]

    for attempt in range(3):
        for try_url in urls_to_try:
            try:
                data, err = _fetch_url(try_url, timeout, headers)
                if err:
                    if attempt >= 2:
                        return False, err
                    continue
                if len(data) < 100:
                    continue
                ok, err = _is_valid_pdf_content(data)
                if ok:
                    with open(filepath, "wb") as f:
                        f.write(data)
                    return True, None
                if data.lstrip().startswith(b"%PDF") and err:
                    continue  # PDF처럼 보이지만 검증 실패 → 추출 URL 재시도
                # HTML 응답 → PDF URL 추출 시도 (첫 시도에만)
                if try_url == url and (b"<!DOCTYPE" in data or b"<html" in data.lower()):
                    html = data.decode("utf-8", errors="replace")
                    pdf_url = _extract_pdf_url_from_viewer(url, html)
                    if pdf_url and pdf_url not in urls_to_try:
                        urls_to_try.append(pdf_url)
            except Exception as e:
                if attempt >= 2 and try_url == url:
                    return False, str(e)
                continue
        if attempt < 2:
            time.sleep(2)

    # Playwright 폴백: 브라우저로 로드 후 PDF 응답 캡처
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            ctx = browser.new_context()
            pdf_data: list[bytes] = []

            def handle_response(resp):
                if resp.url and "application/pdf" in (resp.headers.get("content-type") or ""):
                    try:
                        body = resp.body()
                        if body and _is_valid_pdf_content(body)[0]:
                            pdf_data.append(body)
                    except Exception:
                        pass

            ctx.on("response", handle_response)
            page = ctx.new_page()
            page.goto(url, wait_until="networkidle", timeout=timeout * 1000)
            page.wait_for_timeout(2000)  # PDF fetch 대기
            browser.close()

            if pdf_data:
                with open(filepath, "wb") as f:
                    f.write(pdf_data[0])
                return True, None
    except ImportError:
        pass
    except Exception as e:
        return False, f"Playwright 실패: {e}"

    return False, "PDF URL을 찾지 못함 (HTML 뷰어만 응답)"


def _run_debug_url(url: str) -> None:
    """단일 URL 디버그: 응답 유형·추출 URL·다운로드 시도."""
    import tempfile
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/pdf,text/html,*/*;q=0.9",
        "Referer": "https://www.vetdxlab.com/",
    }
    print(f"[DEBUG] URL: {url}\n")
    data, err = _fetch_url(url, 30, headers)
    if err:
        print(f"  fetch 실패: {err}")
        return
    print(f"  응답 크기: {len(data)} bytes")
    ok, err = _is_valid_pdf_content(data)
    if ok:
        print("  → PDF 직접 응답 (검증 통과)")
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
            f.write(data)
            print(f"  저장: {f.name}")
        return
    if data.lstrip().startswith(b"%PDF"):
        print(f"  → PDF처럼 보이지만 검증 실패: {err}")
    if b"<!DOCTYPE" in data or b"<html" in data.lower():
        html = data.decode("utf-8", errors="replace")
        print("  → HTML 응답 (뷰어 페이지)")
        pdf_url = _extract_pdf_url_from_viewer(url, html)
        if pdf_url:
            print(f"  추출 PDF URL: {pdf_url}")
        else:
            print("  추출된 PDF URL 없음")
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tf:
            ok, err2 = download_pdf(url, tf.name)
            if ok:
                print(f"  → PDF 저장: {tf.name}")
            else:
                print(f"  → 다운로드 실패: {err2}")
                if pdf_url and "찾지 못함" in (err2 or ""):
                    ok2, err3 = download_pdf(pdf_url, tf.name)
                    if ok2:
                        print(f"  → 추출 URL로 저장: {tf.name}")
                    else:
                        print(f"  → 추출 URL도 실패: {err3}")
    else:
        print("  → 알 수 없는 응답:", data[:100])


def is_valid_pdf(filepath: str) -> bool:
    """파일이 실제 PDF인지 검증 (%PDF, %%EOF, HTML 아님)"""
    try:
        with open(filepath, "rb") as f:
            data = f.read()
        return _is_valid_pdf_content(data)[0]
    except Exception:
        return False


def _run_remove_invalid(dry_run: bool = False) -> None:
    """SAVE_PATH 내 손상된 PDF 삭제 (또는 dry_run 시 목록만 출력)."""
    if not os.path.isdir(SAVE_PATH):
        print(f"폴더 없음: {SAVE_PATH}")
        return
    removed = 0
    for root, _dirs, files in os.walk(SAVE_PATH, topdown=False):
        for name in files:
            if not name.lower().endswith(".pdf"):
                continue
            path = os.path.join(root, name)
            if not is_valid_pdf(path):
                sz = os.path.getsize(path)
                print(f"  {'삭제 예정:' if dry_run else '삭제:'} {path} ({sz} bytes)")
                if not dry_run:
                    os.remove(path)
                removed += 1
    print(f"손상 PDF {removed}건" + (" (--dry-run, 실제 삭제 안 함)" if dry_run else " 삭제 완료"))


def main():
    debug_url = None
    for a in sys.argv:
        if a.startswith("--debug-url="):
            debug_url = a.split("=", 1)[1].strip().strip('"')
            break
    if debug_url:
        _run_debug_url(debug_url)
        return

    if "--remove-invalid" in sys.argv:
        dry_remove = "--dry-run" in sys.argv
        print(f"[--remove-invalid] {SAVE_PATH} 내 손상 PDF {'목록' if dry_remove else '삭제'}")
        _run_remove_invalid(dry_run=dry_remove)
        return

    dry_run = "--dry-run" in sys.argv
    unseen_only = "--unseen" in sys.argv
    force_redownload = "--force" in sys.argv  # 기존 파일 덮어쓰기 (잘못된 PDF 재다운로드)
    since_ymd = None
    before_ymd = None
    limit = 0
    for a in sys.argv:
        if a.startswith("--limit="):
            try:
                limit = int(a.split("=", 1)[1])
            except ValueError:
                pass
            break
        if a.startswith("--since="):
            since_ymd = a.split("=", 1)[1].strip()
        if a.startswith("--before="):
            before_ymd = a.split("=", 1)[1].strip()
    if dry_run:
        print("[--dry-run] 실제 다운로드 없이 확인")
    if unseen_only:
        print("[--unseen] 신규(읽지 않음) 메일만 처리")
    if since_ymd:
        print(f"[--since={since_ymd}] 지정 날짜(포함) 이후만")
    if before_ymd:
        print(f"[--before={before_ymd}] 지정 날짜(미포함) 이전만")
    if limit:
        print(f"[--limit={limit}] 최대 {limit}건만 다운로드")

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

    # IMAP 검색은 서버단에서 거르는 게 빠름 (ALL을 클라이언트에서 훑지 않기)
    criteria = _build_search_criteria(unseen_only, since_ymd, before_ymd)
    status, messages = mail.search(None, criteria)
    if status != "OK":
        print("메일 검색 실패", file=sys.stderr)
        mail.logout()
        sys.exit(1)

    nums = messages[0].split()
    total_links = 0
    downloaded = 0
    skipped = 0
    dl_count = 0  # 실제 다운로드 시도 횟수 (진행 출력용)
    stop_dl = False

    for num in nums:
        if stop_dl:
            break
        try:
            status, data = mail.fetch(num, "(RFC822)")
            if status != "OK" or not data:
                continue
            raw = data[0][1]
            msg = email.message_from_bytes(raw)

            from_val = msg.get("From") or ""
            from_addr = str(from_val).lower() if from_val else ""
            if TARGET_SENDERS and not any(s in from_addr for s in TARGET_SENDERS):
                continue

            html = get_html_body(msg)
            if not html:
                continue

            links = extract_vetdxlab_links(html)
            if not links:
                continue

            date_header = msg.get("Date") or ""
            try:
                dt = parsedate_to_datetime(date_header)
            except Exception:
                dt = datetime.now()
            month_folder = f"{dt.year}-{dt.month:02d}"  # YYYY-MM (2026-03)
            base_path = os.path.join(SAVE_PATH, month_folder)
            subject_raw = msg.get("Subject") or "제목없음"
            try:
                decoded = decode_header(subject_raw)
                parts = []
                for b, enc in decoded:
                    parts.append(b.decode(enc or "utf-8", errors="replace") if isinstance(b, bytes) else str(b))
                subject = "".join(parts)
            except Exception:
                subject = str(subject_raw)
            subject = safe_filename(subject)
            from_short = from_addr.split("@")[0] if "@" in from_addr else "unknown"
            from_short = safe_filename(from_short, 30)
            prefix = dt.strftime("%Y%m%d") + "_" + subject[:40] + "_" + from_short

            seen_labels: set[str] = set()
            for url, link_text in links:
                if stop_dl:
                    break
                label = safe_filename(link_text or "pdf", 40)
                if label in seen_labels:
                    continue  # 같은 메일 내 동일 라벨(검사종목) 중복 스킵
                seen_labels.add(label)
                filename = f"{prefix}_{label}.pdf"
                filepath = os.path.join(base_path, filename)
                # 이미 유효한 PDF가 있으면 스킵 (--force 시 덮어쓰기)
                if os.path.exists(filepath) and is_valid_pdf(filepath) and not force_redownload:
                    continue
                n = 1
                while os.path.exists(filepath):
                    stem = label
                    filepath = os.path.join(base_path, f"{prefix}_{stem}_{n}.pdf")
                    n += 1
                total_links += 1

                if limit and dl_count >= limit:
                    stop_dl = True
                    print(f"  [--limit={limit} 도달, 다운로드 중단]", flush=True)
                    break

                if dry_run:
                    print(f"  [다운로드예정] {filename}")
                    downloaded += 1
                    continue

                os.makedirs(base_path, exist_ok=True)
                dl_count += 1
                print(f"  [{dl_count}] 다운로드 중: {filename[:60]}...", flush=True)
                ok, err = download_pdf(url, filepath)
                if ok:
                    print(f"      → 저장 완료", flush=True)
                    downloaded += 1
                else:
                    print(f"      → 실패: {err}", flush=True)
                    skipped += 1

        except Exception as e:
            print(f"메일 처리 오류 {num}: {e}", file=sys.stderr)

    mail.logout()
    print()
    print("=== vetdxlab 링크 다운로드 결과 ===")
    print(f"  PDF 링크 발견: {total_links}건")
    print(f"  다운로드: {downloaded}건" + (" (예정)" if dry_run else ""))
    if skipped:
        print(f"  실패: {skipped}건")


if __name__ == "__main__":
    main()
