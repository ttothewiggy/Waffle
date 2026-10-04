import { aiEnvironment } from "@/lib/ai/access";
import { transcribeRequest } from "@/lib/transcription/server";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  return transcribeRequest(request, aiEnvironment());
}
