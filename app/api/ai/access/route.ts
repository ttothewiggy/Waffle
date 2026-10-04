import { aiEnvironment, aiJson, authorizeAi } from '@/lib/ai/access';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  return await authorizeAi(request, aiEnvironment()) || aiJson({ allowed: true });
}
