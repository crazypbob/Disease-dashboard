#!/bin/bash
# OCR Pipeline - NAS 빌드 및 실행 스크립트 (UGOS / UGREEN NAS)
# SSH 접속 후 이 스크립트를 실행하세요

set -e

# ──────────────────────────────────────
# NAS에서 X드라이브 공유폴더 경로 찾기
# ──────────────────────────────────────
echo "=== X드라이브 공유폴더 경로 탐색 중 ==="
# UGOS NAS의 공유폴더 절대 경로
SHARE_PATH="/volume1/docker/질병메일링_대시보드/disease-dashboard/ocr-pipeline"

if [ ! -d "$SHARE_PATH" ]; then
  echo "[오류] ocr-pipeline 폴더를 찾을 수 없습니다."
  echo "수동으로 경로를 확인하세요: find / -name 'ocr-pipeline' -type d 2>/dev/null"
  exit 1
fi

echo "발견된 경로: $SHARE_PATH"
cd "$SHARE_PATH"

# ──────────────────────────────────────
# Docker 이미지 빌드
# ──────────────────────────────────────
echo ""
echo "=== Docker 이미지 빌드 중 (약 5분 소요) ==="
docker compose build

echo ""
echo "=== 빌드 완료! ==="
echo ""
echo "▶ PDF 처리 실행 방법:"
echo "   1. $SHARE_PATH/input/ 폴더에 PDF 파일 복사"
echo "   2. 아래 명령어 실행:"
echo "      cd $SHARE_PATH && docker compose run --rm ocr-pipeline"
echo ""
echo "▶ 결과 파일 위치:"
echo "   $SHARE_PATH/output/results.xlsx"
