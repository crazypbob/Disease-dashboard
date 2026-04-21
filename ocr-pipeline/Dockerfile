FROM python:3.11-slim

# 시스템 패키지 설치: Tesseract, Poppler (pdf2image용), wget (tessdata_best용)
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    tesseract-ocr-eng \
    poppler-utils \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Tesseract best 한국어 모델 (기본 모델 대비 정확도 10-20% 향상)
RUN wget -q -O /usr/share/tesseract-ocr/5/tessdata/kor.traineddata \
    https://github.com/tesseract-ocr/tessdata_best/raw/main/kor.traineddata

# Python 패키지 설치
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 앱 디렉토리
WORKDIR /app
COPY app/ /app/
COPY tests/ /app/tests/

# 입력/출력 폴더 생성
RUN mkdir -p /app/input /app/output

# MODE=batch (기본): 한번 실행 후 종료
# MODE=watch: 파일 감시 상시 실행
ENV MODE=batch

CMD ["sh", "-c", "if [ \"$MODE\" = 'watch' ]; then python watcher.py; else python main.py; fi"]
