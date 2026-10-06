# Account-based AI and longer recording — 2026-10-03

## Rollout

1. Apply the code update. Keep `OPENAI_API_KEY` server-only, plus the existing `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` settings. No Supabase service-role key is needed.
2. Restart local development and test a newly created, confirmed email account. It should use dictation and polishing without owner approval. Signed-out, anonymous, unconfirmed and expired sessions remain denied.
3. Push and deploy, then update/reopen installed Waffle apps. `WAFFLE_AI_ALLOWED_USER_IDS` is no longer read by this build and can be removed after rollout. Keep it until the previous build is no longer needed for rollback. The old `WAFFLE_DICTATION_TOKEN` is also unused by the account-based builds.

## Access behaviour

Both paid routes verify the session with Supabase's `/auth/v1/user` on every request. Every confirmed, non-anonymous account is eligible, including future public signups. Neither user metadata nor a client-only sign-in check grants access. Auth failures stop the request before uploads are processed or OpenAI is called.

This is authentication, not an invitation gate or usage quota. Anyone who creates and confirms an account can consume API credit. Provider keys remain server-only. Signup notifications are not a spending limit.

## Signup notifications

Background signup notifications are implemented separately from account access. See [activation and troubleshooting](signup-notifications.md). They need deployment and Supabase setup; adding environment variables alone does not enable delivery.

## Recording behaviour

- Ten-minute target at 32 kbit/s mono speech, with a separate 3 MiB upload guard below Vercel's body limit. Browsers that ignore the requested bitrate may hit the size guard sooner.
- A screen wake lock is requested during recording and released afterwards. Low-power modes, browser support or OS policy can deny/release it; the UI then asks the user to keep Waffle visible and check screen timeout.
- Screen hiding, leaving the page or losing the microphone stops the session. Captured chunks and the final stop event are retained rather than discarded on a recorder error. This does not promise recording while the phone is locked.
- Audio prefixes are checkpointed locally approximately every five seconds as data arrives, and the finished audio/transcript are saved by account and date. Browser suspension can delay chunks; a killed process may lose the newest segment, and interrupted media containers may not be playable. Play back recovered audio before using it.
- Open dictation on the same day and account to recover an unfinished draft. Audio is not synced, sent automatically, or included in journal JSON/PDF exports. It remains on this trusted device across closing/sign-out until added or explicitly discarded.
- Download recording is available for recovery, oversized audio and failed uploads. A storage failure keeps the dialog open rather than pretending recovery succeeded.
- The original audio remains during transcription timeouts or failures. Existing server limits remain 45 seconds for the provider request and 60 seconds for the function; a ten-minute *recording* does not keep a server function running for ten minutes.

## Device checks still needed

On the Samsung: record beyond the former screen timeout, confirm the screen stays awake, manually lock it and return, then check playback/recovery. Repeat with battery saver on. Also test a ten-minute recording on the Pixel, with a real confirmed account, and an interrupted network request. No live OpenAI calls or real microphone recording were made during automated testing.

References: [Supabase user verification](https://supabase.com/docs/reference/javascript/auth-getuser), [Screen Wake Lock](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API), [OpenAI transcription](https://developers.openai.com/api/docs/guides/speech-to-text), [Vercel limits](https://vercel.com/docs/functions/limitations).
