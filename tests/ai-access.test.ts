import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeAi } from '../lib/ai/access';
import { transcribeRequest } from '../lib/transcription/server';
import { rewriteRequest } from '../lib/ai/server';
import { aiEnv, authFetch, sessionToken, approvedId } from './ai-fixture';
const req = (token = sessionToken, origin = 'https://waffle.test') => new Request('https://waffle.test/api/ai/access', { headers: { Authorization: `Bearer ${token}`, Origin: origin } });
test('AI accepts only a server-verified, confirmed account, including a new signup', async () => {
  assert.equal(await authorizeAi(req(), aiEnv, authFetch), null);
  assert.equal(await authorizeAi(req(), aiEnv, async () => Response.json({ id: 'new-account', email_confirmed_at: 'date' })), null);
  for (const user of [
    { id: approvedId, email_confirmed_at: null },
    { id: approvedId, email_confirmed_at: 'date', is_anonymous: true },
  ]) assert.notEqual(await authorizeAi(req(), aiEnv, async () => Response.json(user)), null);
  assert.equal((await authorizeAi(req('old-private-code'), aiEnv, authFetch))?.status, 401);
});
test('missing identity/configuration, spoofed origins and auth outages fail closed', async () => {
  const never = async () => { throw new Error('Do not call auth'); };
  assert.equal((await authorizeAi(new Request('https://waffle.test'), aiEnv, never))?.status, 401);
  assert.equal((await authorizeAi(req(), { ...aiEnv, apiKey: '' }, never))?.status, 503);
  assert.equal((await authorizeAi(req(sessionToken, 'https://evil.test'), aiEnv, never))?.status, 403);
  const failed = await authorizeAi(req(), aiEnv, async () => { throw new Error('private backend details'); });
  assert.equal(failed?.status, 503); assert.doesNotMatch(await failed!.text(), /private backend details/);
});
test('both paid endpoints deny unconfirmed accounts before reading input or calling OpenAI', async () => {
  let providerCalls = 0;
  const provider = async () => { providerCalls++; return Response.json({}); };
  const unconfirmed: typeof fetch = async () => Response.json({ id: 'random-account', email_confirmed_at: null });
  assert.equal((await transcribeRequest(req(), aiEnv, provider, unconfirmed)).status, 401);
  assert.equal((await rewriteRequest(req(), aiEnv, provider, unconfirmed)).status, 401);
  assert.equal(providerCalls, 0);
});
test('session verification sends the token only to configured Supabase and never sends the provider key', async () => {
  const response = await authorizeAi(req(), aiEnv, async (url, options) => {
    assert.equal(url, 'https://project.supabase.co/auth/v1/user');
    assert.equal(new Headers(options?.headers).get('Authorization'), `Bearer ${sessionToken}`);
    assert.equal(new Headers(options?.headers).get('apikey'), 'sb_publishable_test');
    assert.equal(options?.redirect, 'error');
    assert.ok(!JSON.stringify(options).includes(aiEnv.apiKey));
    return Response.json({ id: approvedId, email_confirmed_at: 'date' });
  });
  assert.equal(response, null);
});
