import { withAuth } from 'next-auth/middleware';

export default withAuth({
  pages: {
    signIn: '/', // 로그인 페이지(홈)로 리다이렉트
  },
});

export const config = {
  // /dashboard만 보호, /api/auth 및 정적 자원 제외
  matcher: ['/dashboard/:path*'],
};
