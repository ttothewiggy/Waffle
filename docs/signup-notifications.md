# Signup notifications

Implemented 7 October 2026. Code must be deployed and the SQL job enabled before mail is sent.

## Activate

1. The existing `.env.local` has `RESEND_API_KEY`, `WAFFLE_ADMIN_EMAIL`, and `WAFFLE_EMAIL_FROM`. A random `WAFFLE_SIGNUP_WEBHOOK_SECRET` has also been generated there. Copy its value (not the setting name) into Vercel's Production environment variables under that exact name. Keep all four settings server-only. Do not commit `.env.local`.
2. Commit/push this feature and wait for the new Vercel deployment. Supabase will call `https://waffle-puce-delta.vercel.app/api/notifications/signup`. Do not use localhost or a protected preview URL.
3. In Supabase Vault, add these two named secrets using its dashboard form:
   - `waffle_signup_secret`: the same value as `WAFFLE_SIGNUP_WEBHOOK_SECRET`.
   - `waffle_signup_url`: `https://waffle-puce-delta.vercel.app/api/notifications/signup`.
   Vault stores the connection settings; it does not need your Resend API key. If these names already exist, update their values rather than creating duplicates. Do not paste secrets into chat or committed SQL.
4. Open `supabase/migrations/202610070001_signup_notifications.sql`, copy the whole file into Supabase SQL Editor, and Run. It enables pg_net and pg_cron, creates a private queue and installs a named once-per-minute job. Supabase Vault must be available. Run as the project's database owner (the normal SQL Editor role).
5. Create one fresh Waffle account on the live site using an email you control. The alert normally arrives within one or two minutes at low volume. Signup notifications are sent on account creation, before email confirmation. Confirm the account separately to test AI access. Existing accounts are not backfilled.
6. Check the received email, including spam. Resend's Logs show acceptance/delivery. With the `onboarding@resend.dev` test sender, the recipient must be your Resend account email. Use a verified sending domain for production.

## Check status

In Supabase SQL Editor (results do not include email addresses or secrets):

```sql
select user_id, created_at, status, attempts, next_attempt_at
from waffle_notifications.queue
order by created_at desc;
```

`pending`: queued or waiting to retry. `sent`: Resend accepted the message; this is not a guarantee of inbox delivery. `failed`: retries stopped. Missing connection secrets leave messages pending with zero attempts.

```sql
select status, return_message, start_time
from cron.job_run_details
where jobid in (select jobid from cron.job where jobname='waffle-signup-notifications')
order by start_time desc limit 10;
```

Temporary delivery errors retry every five minutes, up to 12 attempts and no later than 12 hours after the first attempt. Resend's same-user idempotency key prevents duplicate sends during its 24-hour retention window. Do not manually reset old failed rows: a previous send may have succeeded despite a lost response, and replaying after that window can duplicate it. Inspect Resend logs first.

## Disable

```sql
select cron.unschedule('waffle-signup-notifications');
```

This does not change registration, journal storage, sync or AI access. To resume, rerun the migration; its activation date and existing queue are preserved.

## Design and privacy

The cron job discovers committed new accounts and queues only their ID, email and signup time. There is no trigger or external call in the signup transaction, so delivery errors cannot roll back registration. One request per minute handles the current small test group; a burst queues rather than sending in parallel.

The private queue has no browser access. Emails are cleared from it after success or exhausted retries. Minimal status records remain until the account is deleted (cascade); pending unsent emails remain until resolved or the account is deleted. No passwords, authentication tokens or journal content are sent in the event. Provider logs and your inbox retain the notification according to their own settings. The receiving address comes only from server configuration.

The endpoint uses a shared secret, validates a small payload, sends plain text to the configured recipient, and does not expose provider error details. Keep this webhook secret separate from the OpenAI/Resend keys. Supabase's pg_net internals temporarily contain the outgoing authorization header; keep database administrator access restricted.

## Validation

Automated tests use a mocked email provider and a real embedded Postgres engine with mocked pg_net, Vault and cron plumbing. They cover authorization, payload bounds, fixed recipient, stable retry messages, failed sends, old/anonymous account exclusion, queue permissions and signup independence. No live emails or database migrations are run by these tests. Live Supabase scheduling and inbox delivery require the activation check above.

References: https://supabase.com/docs/guides/database/extensions/pg_net, https://supabase.com/docs/guides/database/vault, https://resend.com/docs/dashboard/emails/idempotency-keys.
