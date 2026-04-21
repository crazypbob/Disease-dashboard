/**
 * Google OAuth2 — Gmail·Drive API 인증
 * GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN 필요
 */
import { google } from 'googleapis';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.file',
];

export function getGoogleAuth() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN이 .env.local에 필요합니다.'
    );
  }

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, undefined);
  oauth2.setCredentials({ refresh_token: refreshToken });
  return oauth2;
}

export function getAuthUrl() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3005';

  if (!clientId || !clientSecret) {
    throw new Error('GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET이 필요합니다.');
  }

  const oauth2 = new google.auth.OAuth2(
    clientId,
    clientSecret,
    `${baseUrl}/api/setup/gmail/callback`
  );
  return oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });
}

export async function exchangeCodeForTokens(code: string) {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3005';

  if (!clientId || !clientSecret) {
    throw new Error('GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET이 필요합니다.');
  }

  const oauth2 = new google.auth.OAuth2(
    clientId,
    clientSecret,
    `${baseUrl}/api/setup/gmail/callback`
  );
  const { tokens } = await oauth2.getToken(code);
  return tokens;
}
