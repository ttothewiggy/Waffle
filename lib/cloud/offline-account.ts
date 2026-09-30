// A device-local pointer, not an authentication credential. Never use it to authorise cloud access.
export interface OfflineAccount {
  id: string;
  email?: string;
}
export const OFFLINE_ACCOUNT_KEY = "waffle-offline-account";
export function parseOfflineAccount(
  value: string | null,
): OfflineAccount | null {
  try {
    const data = JSON.parse(value || "null");
    if (
      !data ||
      typeof data.id !== "string" ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
        data.id,
      )
    )
      return null;
    return {
      id: data.id,
      ...(typeof data.email === "string" ? { email: data.email } : {}),
    };
  } catch {
    return null;
  }
}
