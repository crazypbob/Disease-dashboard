import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const DOCS_DIR = join(process.cwd(), 'docs');

// 미리볼 파일 목록
const DOC_FILES: Record<string, string> = {
  '명세서': '특허명세서_초안.md',
  '임시출원_서식': '임시출원_서식.md',
  '선행기술조사': '선행기술조사_보고서.md',
};

function getMarkdown(file: string): string {
  try {
    return readFileSync(join(DOCS_DIR, file), 'utf-8');
  } catch {
    return `# 파일 없음\n\`${file}\` 을 찾을 수 없습니다.`;
  }
}

export default async function DocPreviewPage({
  searchParams,
}: {
  // Next.js 타입 생성기 기준: searchParams는 Promise로 취급됨
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const fileParam = sp.file;
  const fileKey = (Array.isArray(fileParam) ? fileParam[0] : fileParam) ?? '명세서';
  const fileName = DOC_FILES[fileKey] ?? '특허명세서_초안.md';
  const raw = getMarkdown(fileName);

  return (
    <>
      <style>{`
        body { margin: 0; font-family: 'Malgun Gothic', sans-serif; background: #f5f5f5; }
        .nav { position: sticky; top: 0; background: #1e293b; color: white;
                display: flex; gap: 8px; padding: 10px 20px; z-index: 100; flex-wrap: wrap; }
        .nav a { color: #94a3b8; text-decoration: none; padding: 4px 12px;
                  border-radius: 4px; font-size: 13px; }
        .nav a.active, .nav a:hover { background: #334155; color: white; }
        .nav .title { color: white; font-weight: bold; margin-right: 8px; font-size: 14px; }
        .container { max-width: 900px; margin: 24px auto; background: white;
                      border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,.1);
                      padding: 40px 48px; }
        .raw { white-space: pre-wrap; font-family: monospace; font-size: 13px;
               line-height: 1.7; color: #333; }
        .filename { color: #888; font-size: 12px; margin-bottom: 16px; }
      `}</style>

      <div className="nav">
        <span className="title">📄 특허 문서 미리보기</span>
        {Object.entries(DOC_FILES).map(([key]) => (
          <a
            key={key}
            href={`/docs/preview?file=${key}`}
            className={fileKey === key ? 'active' : ''}
          >
            {key}
          </a>
        ))}
      </div>

      <div className="container">
        <div className="filename">📁 docs/{fileName}</div>
        <div className="raw" id="content">{raw}</div>
      </div>

      <script
        dangerouslySetInnerHTML={{
          __html: `
// marked.js로 마크다운 렌더링
const script = document.createElement('script');
script.src = 'https://cdn.jsdelivr.net/npm/marked@9/marked.min.js';
script.onload = function() {
  const el = document.getElementById('content');
  const raw = el.textContent;
  el.innerHTML = marked.parse(raw);
  el.classList.remove('raw');

  // 렌더링 후 스타일 적용
  const style = document.createElement('style');
  style.textContent = \`
    #content h1{font-size:20px;font-weight:700;margin:24px 0 12px;padding-bottom:6px;border-bottom:2px solid #333}
    #content h2{font-size:16px;font-weight:700;margin:20px 0 8px;padding-bottom:4px;border-bottom:1px solid #ccc}
    #content h3{font-size:14px;font-weight:700;margin:16px 0 6px}
    #content h4{font-size:13px;font-weight:700;margin:12px 0 4px}
    #content p{margin:6px 0 10px;line-height:1.8}
    #content ul,#content ol{margin:6px 0 10px 20px}
    #content li{margin:3px 0;line-height:1.7}
    #content table{width:100%;border-collapse:collapse;margin:12px 0;font-size:13px}
    #content th,#content td{border:1px solid #ccc;padding:6px 10px;text-align:left}
    #content th{background:#f0f0f0;font-weight:700}
    #content tr:nth-child(even) td{background:#fafafa}
    #content code{background:#f5f5f5;padding:1px 5px;border-radius:3px;font-size:12px;font-family:Consolas,monospace}
    #content pre{background:#f5f5f5;border:1px solid #ddd;border-radius:4px;padding:12px;overflow-x:auto;font-size:12px;margin:10px 0}
    #content pre code{background:none;padding:0}
    #content blockquote{border-left:3px solid #ccc;padding-left:14px;color:#666;margin:10px 0}
    #content hr{border:none;border-top:1px solid #eee;margin:20px 0}
  \`;
  document.head.appendChild(style);
};
document.head.appendChild(script);
          `,
        }}
      />
    </>
  );
}
