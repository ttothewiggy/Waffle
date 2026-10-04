import { aiEnvironment } from "@/lib/ai/access";
import { rewriteRequest } from "@/lib/ai/server";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  return rewriteRequest(request, aiEnvironment());
}
