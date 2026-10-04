import { cloudClient } from '../cloud/client';
/** Obtain a fresh SDK-managed session for every operation; never store another token. */
export async function aiHeaders() {
  const client = cloudClient();
  if (!client) throw new Error('Sign in to use dictation and AI polishing.');
  const { data, error } = await client.auth.getSession();
  if (error || !data.session || data.session.user.is_anonymous)
    throw new Error('Sign in to use dictation and AI polishing.');
  return { Authorization: `Bearer ${data.session.access_token}` };
}
