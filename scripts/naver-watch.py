#!/usr/bin/env python3
"""
네이버 메일 → NAS 자동 감시 (1~2분마다 실행)

백그라운드로 실행해 두면 새 메일을 주기적으로 감지해 NAS에 저장합니다.

사용법:
  # 환경변수: NAVER_EMAIL, NAVER_APP_PASSWORD, SAVE_PATH (필수)
  # TARGET_SENDER (선택)
  python naver-watch.py              # 90초마다 (기본)
  python naver-watch.py --interval 60   # 60초마다
  python naver-watch.py --interval 120  # 2분마다
"""
import argparse
import os
import subprocess
import sys
import time
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
NAVER_IMAP = SCRIPT_DIR / "naver-imap-to-nas.py"


def main():
    parser = argparse.ArgumentParser(description="네이버 메일 1~2분마다 자동 감시")
    parser.add_argument("--interval", type=int, default=90, help="실행 간격(초). 기본 90")
    args = parser.parse_args()

    if not NAVER_IMAP.exists():
        print(f"naver-imap-to-nas.py 없음: {NAVER_IMAP}", file=sys.stderr)
        sys.exit(1)
    if not os.environ.get("NAVER_EMAIL") or not os.environ.get("NAVER_APP_PASSWORD"):
        print("NAVER_EMAIL, NAVER_APP_PASSWORD 환경변수를 설정하세요.", file=sys.stderr)
        sys.exit(1)

    print(f"네이버 메일 감시 시작 (간격: {args.interval}초). 종료: Ctrl+C")
    print()

    run = 0
    while True:
        try:
            run += 1
            subprocess.run(
                [sys.executable, str(NAVER_IMAP)],
                cwd=str(SCRIPT_DIR.parent),
                env=os.environ.copy(),
            )
        except KeyboardInterrupt:
            print("\n종료")
            break
        except Exception as e:
            print(f"[오류] {e}", file=sys.stderr)
        print(f"  다음 확인: {args.interval}초 후...")
        time.sleep(args.interval)


if __name__ == "__main__":
    main()
