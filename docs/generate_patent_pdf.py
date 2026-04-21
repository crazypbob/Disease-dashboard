"""
특허 임시출원 PDF 생성 스크립트 (v2 — mermaid CLI 사전 렌더링)
1. 명세서의 mermaid 코드블록 → mermaid CLI로 PNG 렌더링
2. HTML 생성: 텍스트 + 도면(스크린샷) + 다이어그램 이미지
3. Chrome headless → PDF 변환
"""

import os, re, base64, subprocess, tempfile, sys
from pathlib import Path
import markdown

DOCS_DIR  = Path(__file__).parent
DRAW_DIR  = DOCS_DIR / "patent-drawings"
SPEC_FILE = DOCS_DIR / "특허명세서_초안.md"
OUT_HTML  = DOCS_DIR / "임시출원_명세서.html"
OUT_PDF   = DOCS_DIR / "임시출원_명세서.pdf"
CHROME    = r"C:\Program Files\Google\Chrome\Application\chrome.exe"

# ─── 도면 이미지 목록 ───────────────────────────────────────────────
DRAWINGS = [
    ("도면2_기본_매트릭스뷰.jpg",
     "[도면 2] 매트릭스 대시보드 — 기본 scope (역할 선택 버튼 6종·전체 농장×질병 매트릭스)"),
    ("도면3_중앙정부_시도집계_매트릭스.jpg",
     "[도면 3] 중앙정부 scope — 시/도×월·질병 집계 매트릭스"),
    ("도면5_지도뷰_역할버튼_질병필터.jpg",
     "[도면 5] 지도 뷰 — 전국 농장 GPS 마커·역할·질병·반경 필터 UI"),
    ("도면6_등록농장_탭.jpg",
     "[도면 6] 등록농장 탭 — 수의사 담당 농장 매트릭스"),
    ("도면7_고객농장_탭.jpg",
     "[도면 7] 고객농장 탭 — 고객 계약 농장 전용 매트릭스"),
]

# ─── 유틸 ────────────────────────────────────────────────────────────
def b64(path: Path, mime="image/jpeg") -> str:
    with open(path, "rb") as f:
        data = base64.b64encode(f.read()).decode()
    return f"data:{mime};base64,{data}"

# ─── mermaid CLI 렌더링 ──────────────────────────────────────────────
def render_mermaid_blocks(text: str, tmpdir: Path) -> str:
    """mermaid 코드블록을 찾아 PNG로 렌더링하고, <img> 태그로 교체"""
    idx = [0]

    def replace(m):
        code = m.group(1).strip()
        n = idx[0]; idx[0] += 1
        mmd_file = tmpdir / f"diagram_{n}.mmd"
        png_file = tmpdir / f"diagram_{n}.png"
        mmd_file.write_text(code, encoding="utf-8")
        try:
            svg_file = tmpdir / f"diagram_{n}.svg"
            result = subprocess.run(
                ["npx", "@mermaid-js/mermaid-cli",
                 "-i", str(mmd_file), "-o", str(svg_file),
                 "-b", "white", "-w", "800"],
                capture_output=True, timeout=60, shell=True
            )
            if result.returncode == 0 and svg_file.exists():
                svg_content = svg_file.read_text(encoding="utf-8")
                # SVG를 base64로 인코딩하여 img로 삽입
                svg_b64 = base64.b64encode(svg_content.encode()).decode()
                return f'<div class="diagram"><img src="data:image/svg+xml;base64,{svg_b64}" alt="diagram_{n}" /></div>'
        except Exception as e:
            print(f"  다이어그램 {n} 렌더링 실패: {e}")
        # 실패 시 코드 블록 유지
        return f'<pre class="mermaid-fallback"><code>{code}</code></pre>'

    return re.sub(r'```mermaid\n(.*?)\n```', replace, text, flags=re.DOTALL)

# ─── 도면 섹션 HTML ──────────────────────────────────────────────────
def drawings_section(drawings) -> str:
    html = '<div class="page-break"></div>\n<section class="drawings">\n<h2>도면 (실제 화면)</h2>\n'
    for fname, caption in drawings:
        fpath = DRAW_DIR / fname
        if not fpath.exists():
            html += f'<p class="missing">⚠ 파일 없음: {fname}</p>\n'
            continue
        src = b64(fpath)
        html += f'''<div class="drawing-wrap no-break">
  <img src="{src}" alt="{caption}" />
  <p class="caption">{caption}</p>
</div><div class="page-break"></div>\n'''
    html += '</section>\n'
    return html

# ─── HTML 조립 ───────────────────────────────────────────────────────
CSS = """
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;600;700&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Noto Sans KR','Malgun Gothic',sans-serif;font-size:10pt;line-height:1.75;color:#111;background:#fff}
@page{size:A4;margin:25mm 20mm 25mm 25mm}
@media print{.page-break{page-break-after:always;break-after:page}.no-break{page-break-inside:avoid;break-inside:avoid}pre,table{page-break-inside:avoid}}
@media screen{body{max-width:820px;margin:0 auto;padding:20px}}

/* 표지 */
.cover{min-height:88vh;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:60px 40px;border:2px solid #333}
.cover h1{font-size:14pt;font-weight:700;margin-bottom:12px}
.cover h2{font-size:13pt;font-weight:700;border:none;margin-bottom:40px;line-height:1.6}
.cover table{border:none;width:auto;margin:0 auto}
.cover td{border:none;padding:4px 12px;font-size:10.5pt}
.cover td:first-child{font-weight:700;text-align:right}

/* 본문 */
h1{font-size:14pt;font-weight:700;margin:20px 0 8px;border-bottom:2px solid #222;padding-bottom:4px}
h2{font-size:12pt;font-weight:700;margin:16px 0 6px;border-bottom:1px solid #999;padding-bottom:3px}
h3{font-size:11pt;font-weight:700;margin:12px 0 5px}
h4{font-size:10.5pt;font-weight:700;margin:10px 0 4px}
p{margin:5px 0 8px}
ul,ol{margin:5px 0 8px 20px}li{margin:3px 0}
blockquote{border-left:3px solid #bbb;padding-left:12px;color:#555;margin:8px 0}
hr{border:none;border-top:1px solid #ccc;margin:14px 0}

/* 표 */
table{width:100%;border-collapse:collapse;margin:10px 0;font-size:9pt}
th,td{border:1px solid #bbb;padding:5px 8px;text-align:left;vertical-align:top}
th{background:#f0f0f0;font-weight:700}
tr:nth-child(even) td{background:#fafafa}

/* 코드 */
code{font-family:Consolas,monospace;font-size:8.5pt;background:#f5f5f5;padding:1px 4px;border-radius:2px}
pre{background:#f5f5f5;border:1px solid #ddd;border-radius:3px;padding:10px;font-size:8pt;overflow:auto;margin:8px 0}
pre code{background:none;padding:0}

/* 다이어그램 */
.diagram{text-align:center;margin:12px 0}
.diagram img{max-width:95%;border:1px solid #e8e8e8;border-radius:3px}
.mermaid-fallback{background:#fffde7;border:1px dashed #aaa;color:#555;font-size:8pt;padding:8px;margin:8px 0}

/* 도면 */
.drawings h2{margin-top:0}
.drawing-wrap{text-align:center;margin:10px 0 20px}
.drawing-wrap img{max-width:100%;max-height:660px;border:1px solid #ccc;box-shadow:0 2px 5px rgba(0,0,0,.1)}
.caption{margin-top:8px;font-size:9pt;font-weight:700;color:#333}
.missing{color:red;font-size:9pt}
"""

def build_html(body_md: str, diagrams_html: str) -> str:
    body_html = markdown.markdown(
        body_md,
        extensions=["tables","fenced_code","nl2br"],
    )
    return f"""<!DOCTYPE html>
<html lang="ko"><head>
<meta charset="UTF-8">
<title>특허 임시출원 명세서</title>
<style>{CSS}</style>
</head><body>

<div class="cover page-break">
  <h1>특허 출원 명세서 (임시출원용)</h1>
  <h2>축산 방역을 위한 다중 농장 질병 검사결과<br>
      매트릭스 시각화 및 역할 기반 접근 제어<br>
      시스템과 그 방법</h2>
  <table><tr><td>발 명 자</td><td>박지형</td></tr>
         <tr><td>출 원 인</td><td>박지형</td></tr>
         <tr><td>작 성 일</td><td>2026년 4월 5일</td></tr>
         <tr><td>상&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;태</td><td>임시출원용 초안 — 정식출원 전 변리사 검토 필요</td></tr>
  </table>
</div>

<div class="spec-body">{body_html}</div>

{diagrams_html}

</body></html>"""

# ─── Chrome PDF ──────────────────────────────────────────────────────
def to_pdf(html_path: Path, pdf_path: Path) -> bool:
    cmd = [CHROME, "--headless=new", "--disable-gpu", "--no-sandbox",
           "--run-all-compositor-stages-before-draw",
           "--virtual-time-budget=8000",
           f"--print-to-pdf={pdf_path}",
           "--print-to-pdf-no-header",
           str(html_path.resolve())]
    print("  Chrome 실행 중...")
    try:
        r = subprocess.run(cmd, timeout=90, capture_output=True)
        return r.returncode == 0 and pdf_path.exists()
    except Exception as e:
        print(f"  오류: {e}")
        return False

# ─── 메인 ────────────────────────────────────────────────────────────
def main():
    print(f"[1/4] 명세서 읽기: {SPEC_FILE.name}")
    spec = SPEC_FILE.read_text(encoding="utf-8")

    with tempfile.TemporaryDirectory() as td:
        tmpdir = Path(td)

        print("[2/4] mermaid 다이어그램 렌더링...")
        spec_rendered = render_mermaid_blocks(spec, tmpdir)

        print("[3/4] 도면 이미지 준비 & HTML 조립...")
        drawings_html = drawings_section(DRAWINGS)
        html = build_html(spec_rendered, drawings_html)
        OUT_HTML.write_text(html, encoding="utf-8")
        size_html = OUT_HTML.stat().st_size / 1024
        print(f"  HTML 저장: {OUT_HTML.name} ({size_html:.0f} KB)")

        print("[4/4] Chrome PDF 변환...")
        ok = to_pdf(OUT_HTML, OUT_PDF)

    if ok:
        mb = OUT_PDF.stat().st_size / 1024 / 1024
        print(f"\n완료: {OUT_PDF.name} ({mb:.2f} MB)")
        print(f"위치: {OUT_PDF}")
    else:
        print(f"\nPDF 변환 실패. HTML을 Chrome으로 열어 Ctrl+P → PDF 저장하세요.")
        print(f"HTML: {OUT_HTML}")

if __name__ == "__main__":
    main()
