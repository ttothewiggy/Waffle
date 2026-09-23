import { transcribeRequest } from "@/lib/transcription/server";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  return transcribeRequest(request, {
    apiKey: process.env.OPENAI_API_KEY,
    accessCode: process.env.WAFFLE_DICTATION_TOKEN,
  });
}
