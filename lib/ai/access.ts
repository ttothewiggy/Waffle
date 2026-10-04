import { sameOrigin } from '../server/origin';
export interface AiEnvironment {
  apiKey?: string;
  supabaseUrl?: string;
  publishableKey?: string;
}
export const aiJson = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export function aiEnvironment(): AiEnvironment {
  return {
    apiKey: process.env.OPENAI_API_KEY,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
}
/** Verify a confirmed, non-anonymous account with Supabase server-side.
 * Never grant access from user_metadata, decoded-but-unverified JWTs, or UI state.
 */
export async function authorizeAi(request: Request, env: AiEnvironment, fetcher: typeof fetch = fetch): Promise<Response | null> {
  if (!sameOrigin(request)) return aiJson({ error: 'Open this request from Waffle.' }, 403);
  const token = request.headers.get('authorization')?.match(/^Bearer ([^\s]+)$/)?.[1];
  if (!token || token.length > 16000) return aiJson({ error: 'Sign in to use dictation and AI polishing.' }, 401);
  if (!env.apiKey || !env.supabaseUrl || !env.publishableKey?.startsWith('sb_publishable_'))
    return aiJson({ error: 'AI access has not been set up for this Waffle yet.' }, 503);
  try {
    const endpoint = new URL('/auth/v1/user', env.supabaseUrl);
    if (endpoint.protocol !== 'https:') throw new Error('Invalid auth configuration');
    const response = await fetcher(endpoint.toString(), {
      headers: { apikey: env.publishableKey, Authorization: `Bearer ${token}` },
      cache: 'no-store', signal: AbortSignal.timeout(10000), redirect: 'error',
    });
    if (response.status === 401 || response.status === 403)
      return aiJson({ error: 'Your sign-in has expired. Sign in again; your writing and recording are safe.' }, 401);
    if (!response.ok) throw new Error('Authentication unavailable');
    const user = await response.json();
    if (!user || typeof user.id !== 'string' || !user.email_confirmed_at || user.is_anonymous)
      return aiJson({ error: 'Sign in with a confirmed email account to use AI.' }, 401);
    return null;
  } catch {
    return aiJson({ error: 'Could not check your AI access. Please reconnect and retry; your content is still here.' }, 503);
  }
}
