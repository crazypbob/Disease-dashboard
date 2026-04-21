import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';

const handler = NextAuth(authOptions);

// 모든 NextAuth 라우트 요청 로그
async function wrappedHandler(
  req: Request,
  ctx: { params: Promise<{ nextauth?: string[] }> }
) {
  const url = new URL(req.url);
  console.log('[NextAuth]', req.method, url.pathname, url.search ? `?${url.search.slice(0, 80)}...` : '');
  return handler(req, ctx);
}

export const GET = wrappedHandler;
export const POST = wrappedHandler;
