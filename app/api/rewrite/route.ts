import { rewriteRequest } from "@/lib/ai/server";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  return rewriteRequest(request, {
    apiKey: process.env.OPENAI_API_KEY,
    accessCode: process.env.WAFFLE_DICTATION_TOKEN,
  });
}
