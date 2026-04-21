import { NextResponse } from 'next/server';

export async function GET() {
  const base = process.env.NEXTAUTH_URL || 'http://localhost:3005';
  const redirectUri = `${base.replace(/\/$/, '')}/api/auth/callback/google`;
  return NextResponse.json({
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    expectedRedirectUri: redirectUri,
    message:
      'Google Console 승인된 리디렉션 URI에 위 expectedRedirectUri 값을 그대로 등록하세요.',
  });
}
