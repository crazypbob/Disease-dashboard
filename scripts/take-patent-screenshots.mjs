/**
 * 특허 도면용 스크린샷 캡처 스크립트
 * 실행: node scripts/take-patent-screenshots.mjs
 */
import puppeteer from 'puppeteer-core';
import http from 'http';
import path from 'path';
import fs from 'fs';

const OUTPUT_DIR = path.resolve('docs/patent-drawings');
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
];
const chromePath = CHROME_PATHS.find(p => fs.existsSync(p));
if (!chromePath) throw new Error('Chrome을 찾을 수 없습니다.');

const BASE = 'http://localhost:3005';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Node.js에서 직접 HTTP 요청 (host: localhost 헤더 포함)
function httpGet(urlStr, cookies = '') {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const options = { hostname: url.hostname, port: url.port, path: url.pathname + url.search, headers: { 'host': 'localhost:3005', 'cookie': cookies } };
    http.get(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    }).on('error', reject);
  });
}

function httpPost(urlStr, body, cookies = '') {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const postData = typeof body === 'string' ? body : new URLSearchParams(body).toString();
    const options = {
      hostname: url.hostname, port: url.port, path: url.pathname,
      method: 'POST',
      headers: { 'host': 'localhost:3005', 'content-type': 'application/x-www-form-urlencoded', 'content-length': Buffer.byteLength(postData), 'cookie': cookies },
    };
    const req = http.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// 1. CSRF 토큰 취득
const csrfRes = await httpGet(`${BASE}/api/auth/csrf`);
const { csrfToken } = JSON.parse(csrfRes.body);
const csrfCookies = (csrfRes.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
console.log('CSRF 취득:', csrfToken?.slice(0, 12) + '...');

// 2. dev-local 로그인
const signInRes = await httpPost(
  `${BASE}/api/auth/callback/credentials`,
  { csrfToken, callbackUrl: `${BASE}/dashboard`, json: 'true' },
  csrfCookies
);
console.log('로그인 응답 상태:', signInRes.status);

const sessionCookies = [
  csrfCookies,
  ...(signInRes.headers['set-cookie'] || []).map(c => c.split(';')[0]),
].filter(Boolean).join('; ');

// 3. 세션 확인
const sessionRes = await httpGet(`${BASE}/api/auth/session`, sessionCookies);
const session = JSON.parse(sessionRes.body);
console.log('세션 이메일:', session?.user?.email || '없음');

// 4. Puppeteer 실행 및 쿠키 주입
const browser = await puppeteer.launch({
  executablePath: chromePath, headless: true,
  args: ['--no-sandbox', '--window-size=1600,900'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();

// 쿠키 주입
const cookieObjects = sessionCookies.split('; ').map(c => {
  const [name, ...valParts] = c.split('=');
  return { name: name.trim(), value: valParts.join('='), domain: 'localhost', path: '/' };
}).filter(c => c.name);
await page.setCookie(...cookieObjects);
console.log('쿠키 주입 완료:', cookieObjects.map(c => c.name).join(', '));

await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle2', timeout: 30000 });
await sleep(2500);
console.log('접속 URL:', page.url());

if (!page.url().includes('/dashboard')) {
  console.error('❌ 대시보드 접근 실패. 로그인 상태 확인 필요.');
  await browser.close();
  process.exit(1);
}

// ── 도면 2: 전체 대시보드 레이아웃 ──────────────────────────
console.log('[도면 2] 전체 대시보드 캡처...');
await page.screenshot({ path: path.join(OUTPUT_DIR, '도면2_전체대시보드.jpg'), type: 'jpeg', quality: 95 });

// ── 도면 3: 매트릭스 Ag/Ab 구조 클로즈업 ────────────────────
console.log('[도면 3] 매트릭스 Ag/Ab 클로즈업...');
await page.screenshot({ path: path.join(OUTPUT_DIR, '도면3_매트릭스_AgAb구조.jpg'), type: 'jpeg', quality: 95, clip: { x: 185, y: 215, width: 900, height: 350 } });

// ── 도면 4: 농장 사이드바 그룹 구조 ─────────────────────────
console.log('[도면 4] 농장 사이드바 그룹...');
await page.screenshot({ path: path.join(OUTPUT_DIR, '도면4_농장사이드바_그룹구조.jpg'), type: 'jpeg', quality: 95, clip: { x: 0, y: 50, width: 190, height: 730 } });

// ── 도면 5: 질병 필터 + 날짜 범위 ───────────────────────────
console.log('[도면 5] 질병 필터 바...');
await page.screenshot({ path: path.join(OUTPUT_DIR, '도면5_질병필터_날짜범위.jpg'), type: 'jpeg', quality: 95, clip: { x: 185, y: 155, width: 1415, height: 70 } });

// ── 도면 6: 양성만 표기 필터 활성화 ─────────────────────────
console.log('[도면 6] 양성만 표기 활성화...');
const checkboxes = await page.$$('input[type="checkbox"]');
const lastCb = checkboxes[checkboxes.length - 1];
if (lastCb) { await lastCb.click(); await sleep(1000); }
await page.screenshot({ path: path.join(OUTPUT_DIR, '도면6_양성만표기_필터.jpg'), type: 'jpeg', quality: 95 });

// ── 도면 7: 양성(+) 결과 셀 클로즈업 ────────────────────────
console.log('[도면 7] 양성 셀 클로즈업...');
// 매트릭스에서 양성(+) 링크가 있는 행을 찾아 스크롤
const plusLinks = await page.$$('a[href*="/api/pdf"], td a');
if (plusLinks.length > 0) {
  await plusLinks[0].scrollIntoView?.();
  await sleep(500);
}
await page.screenshot({ path: path.join(OUTPUT_DIR, '도면7_양성셀_PDF링크.jpg'), type: 'jpeg', quality: 95, clip: { x: 185, y: 215, width: 800, height: 300 } });

await browser.close();

console.log('\n✅ 특허 도면 저장 완료 →', OUTPUT_DIR);
fs.readdirSync(OUTPUT_DIR).forEach(f => console.log(' -', f));
