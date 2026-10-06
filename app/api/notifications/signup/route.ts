import { notificationSettings, signupNotification } from '@/lib/notifications/signup';
export const runtime = 'nodejs';
export const maxDuration = 30;
export async function POST(request: Request) {
  return signupNotification(request, notificationSettings());
}
