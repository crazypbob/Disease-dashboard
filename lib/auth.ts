import type { NextAuthOptions } from 'next-auth';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';

const allowedEmails = (process.env.ALLOWED_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/** next dev 전용 — Google OAuth 없이 로컬에서만 로그인 (authorize에서 Host 검증) */
export const DEV_LOCAL_AUTH_EMAIL = 'dev-local@localhost';

export function isLocalHostHeader(host: string | undefined): boolean {
  if (!host) return false;
  try {
    const h = new URL(`http://${host}`).hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '::1';
  } catch {
    return false;
  }
}

const devLocalProvider =
  process.env.NODE_ENV === 'development'
    ? Credentials({
        id: 'dev-local',
        name: 'Local dev',
        credentials: {},
        async authorize(_credentials, req) {
          const h = req.headers as Record<string, string | string[] | undefined> | undefined;
          const raw = h?.['x-forwarded-host'] ?? h?.host;
          const host = Array.isArray(raw) ? raw[0] : raw;
          if (!isLocalHostHeader(host)) return null;
          return {
            id: 'dev-local',
            email: DEV_LOCAL_AUTH_EMAIL,
            name: 'Local Dev',
          };
        },
      })
    : null;

export const authOptions = {
  // redirect_uri는 .env의 NEXTAUTH_URL 기준 (예: http://localhost:3005)
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    }),
    ...(devLocalProvider ? [devLocalProvider] : []),
  ],
  callbacks: {
    signIn({ user, account }) {
      // Credentials: NextAuth는 account.provider에 프로바이더 id(dev-local)를 넣음 (문자열 'credentials' 아님)
      if (
        account?.provider === 'dev-local' &&
        user?.email?.toLowerCase() === DEV_LOCAL_AUTH_EMAIL
      ) {
        return process.env.NODE_ENV === 'development';
      }
      if (!user?.email) return false;
      const email = user.email.toLowerCase();
      if (allowedEmails.length === 0) return true;
      return allowedEmails.includes(email);
    },
  },
  logger: {
    error(code, metadata) {
      console.error('[NextAuth logger]', code, metadata);
    },
    warn(code) {
      console.warn('[NextAuth warn]', code);
    },
    debug(code, metadata) {
      if (process.env.NODE_ENV === 'development') {
        const meta = metadata as Record<string, unknown> | undefined;
        if (code === 'GET_AUTHORIZATION_URL' && meta?.url) {
          const url = String(meta.url);
          const m = url.match(/redirect_uri=([^&]+)/);
          if (m)
            console.log('\n>>> Google에 등록해야 할 redirect_uri:', decodeURIComponent(m[1]), '\n');
        }
        console.log('[NextAuth debug]', code, metadata);
      }
    },
  },
  events: {
    signIn: ({ user }) => {
      console.log('[NextAuth] signIn:', user?.email);
    },
    signOut: () => {
      console.log('[NextAuth] signOut');
    },
  },
  pages: {
    signIn: '/',
    error: '/auth/error',
  },
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  trustHost: true,
  debug: process.env.NODE_ENV === 'development', // 터미널에 OAuth 상세 로그 출력
} as NextAuthOptions;
