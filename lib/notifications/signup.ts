import { timingSafeEqual } from 'node:crypto';

interface Settings { secret?: string; apiKey?: string; to?: string; from?: string }
const json = (error: string, status: number) => Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
export function notificationSettings(): Settings {
  return { secret: process.env.WAFFLE_SIGNUP_WEBHOOK_SECRET, apiKey: process.env.RESEND_API_KEY,
    to: process.env.WAFFLE_ADMIN_EMAIL, from: process.env.WAFFLE_EMAIL_FROM };
}
export async function signupNotification(request: Request, settings: Settings, send: typeof fetch = fetch) {
  if (!settings.secret || settings.secret.length < 32) return json('Notifications are not configured.', 503);
  const expected = Buffer.from(`Bearer ${settings.secret}`);
  const actual = Buffer.from(request.headers.get('authorization') || '');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return json('Unauthorized.', 401);
  if (!settings.apiKey || !settings.to || !settings.from) return json('Notifications are not configured.', 503);
  // The database sends only these fields, never an auth.users row or journal content.
  let event;
  try {
    const reader = request.body?.getReader();
    if (!reader) return json('Missing event.', 400);
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const next = await reader.read(); if (next.done) break;
      size += next.value.byteLength;
      if (size > 4096) { await reader.cancel(); return json('Event too large.', 413); }
      chunks.push(next.value);
    }
    event = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch { return json('Invalid event.', 400); }
  if (!event || typeof event !== 'object' || Array.isArray(event) ||
    Object.keys(event).some(k => !['user_id', 'email', 'created_at'].includes(k)) ||
    typeof event.user_id !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(event.user_id) ||
    typeof event.email !== 'string' || event.email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(event.email) ||
    typeof event.created_at !== 'string' || event.created_at.length > 64 || !Number.isFinite(Date.parse(event.created_at)))
    return json('Invalid event.', 400);
  try {
    const response = await send('https://api.resend.com/emails', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${settings.apiKey}`, 'Content-Type': 'application/json',
        'Idempotency-Key': `waffle-signup/${event.user_id}` },
      body: JSON.stringify({ from: settings.from, to: [settings.to], subject: 'Someone joined Waffle',
        text: `A new Waffle account was created.\n\nEmail: ${event.email}\nSigned up: ${new Date(event.created_at).toISOString()}\n\nThis is a signup notification, not an email-confirmation notice. No journal content is included.` }),
    });
    if (!response.ok) return json('Email service did not accept the notification.', 502);
    const result = await response.json();
    if (typeof result.id !== 'string' || !result.id) return json('Email service returned an invalid response.', 502);
    return Response.json({ accepted: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return json('Email service is temporarily unavailable.', 502); }
}
