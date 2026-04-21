/**
 * Gmail OAuth 콜백 — 코드 교환 후 refresh_token 표시
 */
import { NextResponse } from 'next/server';
import { exchangeCodeForTokens } from '@/lib/mail-pipeline/google-auth';

function redirectUrl(path: string): string {
  const base = process.env.NEXTAUTH_URL || 'http://localhost:3005';
  return path.startsWith('http') ? path : `${base.replace(/\/$/, '')}${path.startsWith('/') ? path : '/' + path}`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(
      redirectUrl(`/setup/gmail?error=${encodeURIComponent(error)}`)
    );
  }

  if (!code) {
    return NextResponse.redirect(redirectUrl('/setup/gmail?error=no_code'));
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const refreshToken = tokens.refresh_token;
    if (!refreshToken) {
      return NextResponse.redirect(
        redirectUrl('/setup/gmail?error=no_refresh_token')
      );
    }

    return NextResponse.redirect(
      redirectUrl(`/setup/gmail?success=1&refresh_token=${encodeURIComponent(refreshToken)}`)
    );
  } catch (e) {
    return NextResponse.redirect(
      redirectUrl(`/setup/gmail?error=${encodeURIComponent((e as Error).message)}`)
    );
  }
}
