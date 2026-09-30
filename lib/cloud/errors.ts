// Only Waffle-authored messages pass through; provider details may contain private data.
export class CloudProblem extends Error {}
export function syncErrorMessage(error: unknown): string {
  if (error instanceof CloudProblem) return error.message;
  const value =
    error && typeof error === "object"
      ? (error as Record<string, unknown>)
      : {};
  const code = String(value.code || "");
  const status = Number(value.statusCode || value.status || 0);
  const message = typeof value.message === "string" ? value.message : "";
  const safe = "Your changes remain saved on this device.";
  if (
    code === "WAFFLE_TIMEOUT" ||
    value.name === "TimeoutError" ||
    message.includes("The cloud request timed out.")
  )
    return `Sync took too long. ${safe} Check your connection, then choose Sync now in Settings.`;
  if (
    status === 401 ||
    [
      "PGRST301",
      "PGRST302",
      "PGRST303",
      "bad_jwt",
      "session_not_found",
      "refresh_token_not_found",
    ].includes(code)
  )
    return `Sign in again through Settings to resume syncing. ${safe}`;
  if (["42P01", "PGRST202", "PGRST205"].includes(code))
    return `Cloud sync setup is incomplete. ${safe} The Waffle database setup needs checking.`;
  if (status === 403 || code === "42501")
    return `This account was not allowed to sync. ${safe} Try signing in again. If this continues, the account needs checking.`;
  if (status === 429 || code === "over_request_rate_limit")
    return `Cloud sync is temporarily rate-limited. ${safe} Wait a little before trying again.`;
  if (status === 413 || code === "EntityTooLarge")
    return `A cloud upload is too large. ${safe} Export a backup and use smaller photos before retrying.`;
  if (status === 404)
    return `A required cloud file or service could not be found. ${safe} Retry sync; if this continues, the cloud storage needs checking.`;
  if (status >= 500)
    return `The cloud service is temporarily unavailable. ${safe} Waffle will retry while it is open.`;
  return `Couldn’t sync. ${safe} Check your connection, then choose Sync now in Settings.`;
}
