export const approvedId = '11111111-1111-4111-8111-111111111111';
export const sessionToken = 'test-session-only';
export const aiEnv = {
  apiKey: 'test-only-key',
  supabaseUrl: 'https://project.supabase.co',
  publishableKey: 'sb_publishable_test',
};
export const authFetch: typeof fetch = async (_url, options) => {
  if (new Headers(options?.headers).get('Authorization') !== `Bearer ${sessionToken}`)
    return Response.json({}, { status: 401 });
  return Response.json({ id: approvedId, email_confirmed_at: '2026-09-30T00:00:00Z', is_anonymous: false });
};
