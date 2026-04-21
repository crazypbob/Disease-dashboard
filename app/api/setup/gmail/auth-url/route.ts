/**
 * Gmail OAuth URL 생성
 */
import { NextResponse } from 'next/server';
import { getAuthUrl } from '@/lib/mail-pipeline/google-auth';

export async function GET() {
  try {
    const url = getAuthUrl();
    return NextResponse.json({ url });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
