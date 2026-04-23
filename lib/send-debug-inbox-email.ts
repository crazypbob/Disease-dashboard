/**
 * Resend REST API (의존성 없이 fetch만 사용).
 * RESEND_API_KEY, RESEND_FROM_EMAIL(선택), ADMIN_DEBUG_EMAIL 필요.
 */
export async function sendDebugInboxEmail(input: {
  to: string;
  subject: string;
  textBody: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    return { ok: false, error: 'RESEND_API_KEY 없음' };
  }

  const from =
    process.env.RESEND_FROM_EMAIL?.trim() ||
    'onboarding@resend.dev';

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      text: input.textBody,
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    return { ok: false, error: t || `HTTP ${res.status}` };
  }
  return { ok: true };
}
