# -*- coding: utf-8 -*-
# Generates notebooks/질병검사_OCR_검증.ipynb - run: python scripts/build-colab-verify-notebook.py
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "notebooks" / "질병검사_OCR_검증.ipynb"


def cell_md(text: str) -> dict:
    return {
        "cell_type": "markdown",
        "metadata": {},
        "source": [line + "\n" for line in text.strip("\n").split("\n")],
    }


def cell_code(text: str) -> dict:
    return {
        "cell_type": "code",
        "execution_count": None,
        "metadata": {},
        "outputs": [],
        "source": [line + "\n" for line in text.strip("\n").split("\n")],
    }


STEP1 = r"""# 필요 라이브러리 설치
!pip install pdfplumber -q

from google.colab import drive
drive.mount('/content/drive')
print("✅ 드라이브 연결 완료")"""

STEP2 = r"""import os

# ========== 여기만 수정하세요 ==========

# 구글 드라이브 PDF 폴더 경로
PDF_ROOT = '/content/drive/MyDrive/질병메일링_대시보드/검사결과_PDF'

# 대시보드 베이스 URL (Colab에서 접근 가능해야 함 — localhost 불가)
# 예: ngrok/Cloudflare Tunnel로 노출한 주소, 또는 Vercel 배포 URL
API_BASE = 'https://your-app.example.com'

# .env.local 의 RECORDS_VERIFY_TOKEN 과 동일한 값 (Bearer)
RECORDS_VERIFY_TOKEN = os.environ.get('RECORDS_VERIFY_TOKEN', '여기에_토큰_붙여넣기')

# 검증 API (프로젝트: app/api/verify/records-export/route.ts)
DB_API_URL = API_BASE.rstrip('/') + '/api/verify/records-export'

# 검증할 날짜 범위 (None이면 전체)
DATE_FROM = '2026-01-01'
DATE_TO = '2026-04-12'

# CSV 저장 경로 (선택)
OUTPUT_CSV = '/content/drive/MyDrive/질병메일링_대시보드/데이터/검증리포트.csv'

# =======================================

print(f"📁 PDF 경로: {PDF_ROOT}")
print(f"🔗 DB API: {DB_API_URL}")
print(f"📅 기간: {DATE_FROM} ~ {DATE_TO}")

if os.path.exists(PDF_ROOT):
    months = [d for d in os.listdir(PDF_ROOT) if os.path.isdir(os.path.join(PDF_ROOT, d))]
    total_pdfs = sum(
        len([f for f in os.listdir(os.path.join(PDF_ROOT, m)) if f.endswith('.pdf')])
        for m in months
    )
    print(f"✅ PDF 폴더 확인: {len(months)}개 월, 총 {total_pdfs}개 파일")
else:
    print(f"❌ PDF 폴더 없음: {PDF_ROOT}")"""

STEP3 = r"""import os
import pdfplumber
import re
import requests
import json
from datetime import datetime


def parse_pdf(pdf_path):
    # PDF text layer extraction; scanned PDFs often yield empty fields.
    result = {
        'acc_no': None,
        'date': None,
        'farm': None,
        'client': None,
        'disease': None,
        'test_type': None,
        'result': None,
        'positive_pools': [],
        'details': {},
    }

    try:
        with pdfplumber.open(pdf_path) as pdf:
            full_text = ''
            for page in pdf.pages:
                t = page.extract_text()
                if t:
                    full_text += t + '\n'

        m = re.search(r'접수번호\s*[:\-]?\s*([\d\s\-]+)', full_text)
        if m:
            result['acc_no'] = re.sub(r'\s+', '', m.group(1)).strip()

        m = re.search(r'접수일자\s+(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일', full_text)
        if m:
            result['date'] = f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"

        m = re.search(r'농장정보\s+(.+?)(?:\n|$)', full_text)
        if m:
            result['farm'] = m.group(1).strip()

        m = re.search(r'의뢰정보\s+(.+?)(?:\n|$)', full_text)
        if m:
            result['client'] = m.group(1).strip()

        fname = os.path.basename(pdf_path).lower()
        head = full_text[:500] if len(full_text) > 500 else full_text
        if '항원' in head or '항원' in fname:
            result['test_type'] = 'PCR'
        elif '혈청' in head or '혈청' in fname:
            result['test_type'] = 'ELISA'
        else:
            result['test_type'] = 'Unknown'

        diseases = ['PRRS', 'PED', 'SIV', 'PCV2', 'MH', 'APP', 'ASF']
        for d in diseases:
            if d in full_text:
                result['disease'] = d
                break

        if '양성으로 판정' in full_text:
            result['result'] = '+'
        elif '음성으로 판정' in full_text:
            result['result'] = '-'

        positive_pools = []
        for pm in re.finditer(
            r'(Pool-?\d+[^\n]*?)\s+(양성\s*(?:\([A-Z]+\))?)',
            full_text,
            re.IGNORECASE,
        ):
            pool_info = pm.group(1).strip()
            strain = re.search(r'\(([A-Z]+)\)', pm.group(2))
            positive_pools.append({
                'pool': pool_info,
                'strain': strain.group(1) if strain else 'Unknown',
            })
        result['positive_pools'] = positive_pools

        m = re.search(r'평균\s+([\-\d\.]+)\s+([\d\.]+)%', full_text)
        if m:
            result['details']['sp_avg'] = float(m.group(1))
            result['details']['positive_rate'] = float(m.group(2))

    except Exception as e:
        result['error'] = str(e)

    return result


def types_compatible(pdf_type: str, db_type: str) -> bool:
    # True if PDF-inferred category matches DB test_type family
    if not pdf_type or pdf_type == 'Unknown':
        return True
    if not db_type:
        return True
    d = db_type
    dl = d.lower()
    if pdf_type == 'ELISA':
        return 'elisa' in dl or '혈청' in d or 'ab' in dl or '항체' in d
    if pdf_type == 'PCR':
        return 'pcr' in dl or '항원' in d or 'ag' in dl
    return True


def fetch_db_records(api_url: str, token: str, date_from=None, date_to=None):
    # GET /api/verify/records-export with Bearer token
    params = {'limit': '8000'}
    if date_from:
        params['dateFrom'] = date_from
    if date_to:
        params['dateTo'] = date_to
    headers = {'Authorization': f'Bearer {token}'}
    try:
        resp = requests.get(api_url, params=params, headers=headers, timeout=120)
        resp.raise_for_status()
        data = resp.json()
        records = data.get('records', data) if isinstance(data, dict) else data
        if not isinstance(records, list):
            records = []
        with_pdf = [r for r in records if r.get('pdf_file_id')]
        print(f"✅ DB 레코드: 전체 {len(records)}개 / PDF 연결 {len(with_pdf)}개")
        return records
    except Exception as e:
        print(f"❌ DB 조회 실패: {e}")
        print("  → RECORDS_VERIFY_TOKEN, API_BASE, 방화벽·ngrok 여부 확인")
        return []


print("✅ 파서 로드 완료")
print()

import glob
sample_pdfs = glob.glob(f"{PDF_ROOT}/**/*.pdf", recursive=True)[:3]
if sample_pdfs:
    print(f"🧪 샘플 테스트 ({len(sample_pdfs)}개):")
    for p in sample_pdfs:
        r = parse_pdf(p)
        print(f"  {os.path.basename(p)[:50]}")
        print(f"    접수: {r['acc_no']} | 날짜: {r['date']} | 농장: {r['farm']} | 질병: {r['disease']} | 결과: {r['result']}")
else:
    print("⚠️ PDF 폴더에 파일 없음 - 경로 확인 필요")"""

STEP4 = r"""import os
import glob
from datetime import datetime
from IPython.display import display, HTML

print("📡 DB 조회 중...")
db_records = fetch_db_records(DB_API_URL, RECORDS_VERIFY_TOKEN, DATE_FROM, DATE_TO)

print("\n📁 PDF 수집 중...")
all_pdfs = glob.glob(f"{PDF_ROOT}/**/*.pdf", recursive=True)
print(f"   PDF 총 {len(all_pdfs)}개 발견")

results = {
    'ok': [],
    'mismatch': [],
    'pdf_only': [],
    'db_only': [],
    'error': [],
}

pdf_by_path = {}
for pdf_path in all_pdfs:
    rel_path = pdf_path.replace(PDF_ROOT + '/', '').replace(chr(92), '/')
    pdf_by_path[rel_path] = pdf_path

db_by_pdf = {}
for rec in db_records:
    if rec.get('pdf_file_id'):
        db_by_pdf[rec['pdf_file_id']] = rec

print(f"\n🔍 검증 시작...")
matched = 0

for rel_path, pdf_path in pdf_by_path.items():
    db_rec = db_by_pdf.get(rel_path)

    pdf_data = parse_pdf(pdf_path)

    if pdf_data.get('error'):
        results['error'].append({
            'path': rel_path,
            'error': pdf_data['error'],
        })
        continue

    if not db_rec:
        results['pdf_only'].append({
            'path': rel_path,
            'pdf': pdf_data,
        })
        continue

    matched += 1
    mismatches = []

    pdf_date = pdf_data.get('date', '')
    db_date = str(db_rec.get('date', ''))[:10]
    if pdf_date and db_date and pdf_date != db_date:
        mismatches.append(f"날짜: PDF={pdf_date} / DB={db_date}")

    pdf_disease = pdf_data.get('disease', '')
    db_disease = str(db_rec.get('disease', ''))
    if pdf_disease and db_disease and pdf_disease.upper() != db_disease.upper():
        mismatches.append(f"질병: PDF={pdf_disease} / DB={db_disease}")

    pdf_type = pdf_data.get('test_type', '')
    db_type = str(db_rec.get('test_type', ''))
    if pdf_type and db_type and not types_compatible(pdf_type, db_type):
        mismatches.append(f"검사종류: PDF={pdf_type} / DB={db_type}")

    pdf_result = pdf_data.get('result', '')
    db_result = str(db_rec.get('result', ''))
    result_ok = False
    if pdf_result == '+':
        result_ok = any(x in db_result for x in ('+', '양성', 'positive', 'Positive'))
    elif pdf_result == '-':
        result_ok = any(x in db_result for x in ('-', '음성', 'negative', 'Negative'))
    else:
        result_ok = True
    if pdf_result and db_result and not result_ok:
        mismatches.append(f"결과: PDF={pdf_result} / DB={db_result}")

    entry = {
        'path': rel_path,
        'pdf': pdf_data,
        'db': db_rec,
        'mismatches': mismatches,
    }

    if mismatches:
        results['mismatch'].append(entry)
    else:
        results['ok'].append(entry)

for pdf_id, rec in db_by_pdf.items():
    if pdf_id not in pdf_by_path:
        results['db_only'].append({'pdf_id': pdf_id, 'db': rec})

total = len(all_pdfs)
ok = len(results['ok'])
mismatch = len(results['mismatch'])
pdf_only = len(results['pdf_only'])
db_only = len(results['db_only'])
error = len(results['error'])

html = f'''
<style>
  .report {{ font-family: "Malgun Gothic", sans-serif; max-width: 900px; }}
  .summary {{ display: grid; grid-template-columns: repeat(5,1fr); gap:10px; margin:16px 0; }}
  .kpi {{ padding:14px; border-radius:10px; text-align:center; }}
  .kpi .num {{ font-size:28px; font-weight:900; }}
  .kpi .lbl {{ font-size:11px; margin-top:4px; }}
  .ok {{ background:#e8f5e9; color:#2e7d32; }}
  .bad {{ background:#fce4ec; color:#b71c1c; }}
  .warn {{ background:#fff3e0; color:#e65100; }}
  .info {{ background:#e3f2fd; color:#1565c0; }}
  .gray {{ background:#f5f5f5; color:#555; }}
  table {{ width:100%; border-collapse:collapse; margin:12px 0; font-size:13px; }}
  th {{ background:#1a2636; color:#fff; padding:8px 10px; text-align:left; }}
  td {{ padding:7px 10px; border-bottom:1px solid #eee; }}
  tr:hover {{ background:#f8f8f8; }}
  .tag-bad {{ background:#fce4ec; color:#b71c1c; border-radius:4px; padding:2px 8px; font-size:11px; font-weight:700; }}
  h3 {{ margin:20px 0 8px; color:#1a2636; border-left:4px solid #2563eb; padding-left:10px; }}
</style>
<div class="report">
<h2 style="color:#1a2636">📋 PDF↔DB 검증 리포트</h2>
<p style="color:#666; font-size:13px">생성 시각: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} | 기간: {DATE_FROM} ~ {DATE_TO}</p>

<div class="summary">
  <div class="kpi ok"><div class="num">{ok}</div><div class="lbl">✅ 일치</div></div>
  <div class="kpi bad"><div class="num">{mismatch}</div><div class="lbl">⚠️ 불일치</div></div>
  <div class="kpi warn"><div class="num">{pdf_only}</div><div class="lbl">📄 PDF만 있음</div></div>
  <div class="kpi info"><div class="num">{db_only}</div><div class="lbl">🗃️ DB만 있음</div></div>
  <div class="kpi gray"><div class="num">{error}</div><div class="lbl">❌ 파싱오류</div></div>
</div>
'''

if results['mismatch']:
    html += "<h3>⚠️ 불일치 항목</h3><table>"
    html += "<tr><th>파일명</th><th>날짜</th><th>농장</th><th>불일치 내용</th></tr>"
    for r in results['mismatch']:
        fname = os.path.basename(r['path'])
        date = r['db'].get('date', '')
        farm = r['db'].get('farm_code', '')
        issues = '<br>'.join([f'<span class="tag-bad">{m}</span>' for m in r['mismatches']])
        html += f"<tr><td>{fname[:40]}</td><td>{date}</td><td>{farm}</td><td>{issues}</td></tr>"
    html += "</table>"

if results['pdf_only']:
    html += f"<h3>📄 DB 미등록 PDF ({len(results['pdf_only'])}개)</h3><table>"
    html += "<tr><th>파일명</th><th>파싱된 날짜</th><th>파싱된 농장</th><th>파싱된 결과</th></tr>"
    for r in results['pdf_only'][:20]:
        p = r['pdf']
        fname = os.path.basename(r['path'])
        html += f"<tr><td>{fname[:40]}</td><td>{p.get('date','')}</td><td>{p.get('farm','')}</td><td>{p.get('result','')}</td></tr>"
    if len(results['pdf_only']) > 20:
        html += f"<tr><td colspan=4 style='color:#999'>... 외 {len(results['pdf_only'])-20}개</td></tr>"
    html += "</table>"

if results['error']:
    html += f"<h3>❌ 파싱 오류 ({len(results['error'])}개)</h3><table>"
    html += "<tr><th>파일명</th><th>오류 내용</th></tr>"
    for r in results['error']:
        html += f"<tr><td>{os.path.basename(r['path'])[:40]}</td><td style='color:red'>{r['error'][:80]}</td></tr>"
    html += "</table>"

html += "</div>"

display(HTML(html))
print(f"\n📊 요약: 전체 {total}개 PDF | 일치 {ok} | 불일치 {mismatch} | DB미등록 {pdf_only} | PDF없음 {db_only}")"""

STEP5 = r"""import csv

if results['mismatch'] or results['pdf_only']:
    rows = []
    for r in results['mismatch']:
        rows.append({
            '상태': '불일치',
            '파일명': os.path.basename(r['path']),
            '경로': r['path'],
            'DB날짜': r['db'].get('date', ''),
            'PDF날짜': r['pdf'].get('date', ''),
            'DB농장': r['db'].get('farm_code', ''),
            'PDF농장': r['pdf'].get('farm', ''),
            'DB결과': r['db'].get('result', ''),
            'PDF결과': r['pdf'].get('result', ''),
            '불일치내용': ' | '.join(r['mismatches']),
        })
    for r in results['pdf_only']:
        rows.append({
            '상태': 'DB미등록',
            '파일명': os.path.basename(r['path']),
            '경로': r['path'],
            'DB날짜': '',
            'PDF날짜': r['pdf'].get('date', ''),
            'DB농장': '',
            'PDF농장': r['pdf'].get('farm', ''),
            'DB결과': '',
            'PDF결과': r['pdf'].get('result', ''),
            '불일치내용': 'DB에 레코드 없음',
        })

    os.makedirs(os.path.dirname(OUTPUT_CSV), exist_ok=True)
    with open(OUTPUT_CSV, 'w', newline='', encoding='utf-8-sig') as f:
        if rows:
            writer = csv.DictWriter(f, fieldnames=rows[0].keys())
            writer.writeheader()
            writer.writerows(rows)
    print(f"✅ CSV 저장 완료: {OUTPUT_CSV}")
    print(f"   총 {len(rows)}개 항목")
else:
    print("✅ 불일치/미등록 항목 없음 - CSV 저장 불필요")"""


def main() -> None:
    intro = """# 질병검사 PDF ↔ DB 검증 (Colab)

### 역할
- **pdfplumber**로 PDF **텍스트 레이어**에서 필드를 추출해 DB(`test_records`)와 비교합니다.
- **스캔 이미지 전용 PDF**는 텍스트가 없어 대부분 빈 값이 됩니다. 운영 파이프라인(NAS Docker OCR + `parser.py`)과 목적이 다릅니다.

### DB 연결 (Colab → 대시보드)
1. 대시보드 `.env.local`에 `RECORDS_VERIFY_TOKEN` 설정 후 서버 재시작.
2. Colab이 접근 가능한 URL 사용 (`localhost` 불가). 예: **ngrok**, **Cloudflare Tunnel**, **배포 URL**.
3. 아래 **STEP 2**에서 `API_BASE`와 `RECORDS_VERIFY_TOKEN`을 수정.

### 대안 (로컬)
- `docs/DATA-VERIFY-RUNBOOK.md` 의 `verify:matrix-report` 등.

---
"""

    nb = {
        "nbformat": 4,
        "nbformat_minor": 5,
        "metadata": {
            "kernelspec": {
                "display_name": "Python 3",
                "language": "python",
                "name": "python3",
            },
            "language_info": {"name": "python", "version": "3.10.0"},
        },
        "cells": [
            cell_md(intro),
            cell_md("## STEP 1: 환경 설정 & 드라이브 연결"),
            cell_code(STEP1),
            cell_md("## STEP 2: 설정값 입력"),
            cell_code(STEP2),
            cell_md("## STEP 3: PDF 파싱 엔진 로드"),
            cell_code(STEP3),
            cell_md("## STEP 4: 검증 실행"),
            cell_code(STEP4),
            cell_md("## STEP 5: 불일치 CSV 저장 (선택)"),
            cell_code(STEP5),
        ],
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(nb, ensure_ascii=False, indent=1), encoding="utf-8")
    print("Wrote", OUT)


if __name__ == "__main__":
    main()
