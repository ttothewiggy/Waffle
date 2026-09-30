# Supabase accounts and sync — first private test

This phase adds ordinary email/password accounts and cloud sync. It is **not end-to-end encrypted**. Authorised backend administrators can technically read journal contents. Optional end-to-end encryption is a later feature, not a switch already implemented.

## 1. Create the database and private photo storage

Open the Waffle Supabase project → SQL Editor → New query.
Copy the entire contents of `supabase/migrations/202609300001_journal_sync.sql` and run it once.

It creates:
- One versioned journal manifest per account (text, captions, versions and deleted entries).
- A private `waffle-photos` bucket. Files are limited to 20 MB and supported image types.
- Owner-only database and photo permissions. Signed-out users get no access.
- A save function that checks both the signed-in identity and the previous revision. Conflicting writes fail instead of overwriting.

The migration is transactional. If it fails, stop and inspect the error; do not disable RLS to get past it. Do not rerun a successful migration. Leave Auto RLS enabled.

## 2. Configure sign-in addresses

Supabase → Authentication → URL Configuration:
- Site URL: `https://waffle-puce-delta.vercel.app`
- Additional Redirect URLs: `https://waffle-puce-delta.vercel.app/` and `http://localhost:3001/`.

Keep email confirmation enabled. Use email/password authentication. Set the minimum password length to 12 characters to match the sign-up form. The app handles confirmation and password-recovery links at `/`.

Supabase's default email sender is restricted to organisation team addresses and very low volume. For your first test, use the email associated with your Supabase organisation. Configure custom SMTP before inviting other people or depending on password-reset delivery. Keep the existing confirmation/reset templates unless changing them deliberately; this client handles Supabase's standard email-link flow.

## 3. App configuration

The local ignored `.env.local` has already been created with the supplied public URL and publishable key. Existing server-only AI settings are untouched.

Add these same names in Vercel → Project Settings → Environment Variables, for Production:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

Use the project URL and **publishable** key from Supabase's Connect panel. No secret key, service-role key, database password or JWKS setting is needed. Public variables are included at build time: restart local development and redeploy Vercel after setting them. Preview deployments need their own variables and explicitly allowed redirect addresses if you want sign-in there.

## 4. Safely bring over existing writing

1. Keep fresh JSON exports from every device/origin containing entries.
2. Open Settings → Account & sync → Create an account. Confirm the email, then sign in.
3. Your account journal starts separately from the old device-only journal. Wait for sync to finish.
4. Choose **Copy this device’s journal to my account**. This preserves matching dates already in the account and leaves the original device journal untouched. It copies active days; recover any old deleted days first if you want to include them.
5. Wait for **Synced across your devices**.
6. On the second device, sign in with the same account. Your writing and photos should appear. Copy any additional old device entries only after the account finishes downloading.
7. If matching dates were skipped, compare your backups and use the existing restore tool to replace selected data deliberately. Nothing is automatically merged.

Signing out returns to the old device-only journal. If authentication expires while offline, the cached account journal stays available; sign in again to resume sync. A remembered account pointer only selects local storage and never authorises cloud access. An unencrypted account cache stays on this browser for offline use and unsynced changes; use a trusted device. Account switching never automatically copies the previous account's data.

## Sync behaviour and conflict recovery

Local writes and their pending-sync marker share one IndexedDB transaction. Work survives reload and connectivity loss. Sync runs after 1.5 seconds without a local save, on reconnect/focus, every 30 seconds, and through Sync now. Cached entries are available offline after the app shell has been loaded/cached. A new device must connect before it can download a journal.

The first implementation syncs a complete text manifest, with separately stored content-addressed photos. Existing photos are not re-uploaded for text edits. Cloud manifests are versioned and capped at 10 MB. This is intentionally a small-journal implementation; incremental per-entry syncing is a later efficiency improvement.

Concurrent device edits produce a conflict, including edits to different days. Neither copy is silently replaced. Download and review both versions in Settings; browsers may ask permission for multiple downloads. Then choose a version. Choosing this device checks the cloud revision again. Either choice preserves displaced entries in Recently deleted, which also syncs. JSON exports contain active entries only, not Recently deleted.

Use one editing tab per device. Web Locks serialize network sync in supported browsers, but simultaneous typing in two tabs is not supported.

## Private-test checklist

- Create/confirm an account and sign in on phone and computer.
- Copy the old phone journal; verify text, photo bytes, captions and AI versions on computer.
- Edit on each device in turn and wait for synced status.
- Make an offline edit, close/reopen, reconnect and verify the other device.
- Edit the same day on both devices offline. Verify conflict recovery and both downloads.
- Delete on one device, recover through Recently deleted on the other.
- Test password reset through the real email provider.
- Sign out and sign into a second test account; confirm no journal leakage.

Local automated checks cover the actual SQL policies in an embedded PostgreSQL test database, plus offline persistence, races, conflicts and photo transport. They do not replace this live Supabase/email/two-device test.

## Before wider beta

This is the accounts-and-sync slice of Milestone 4, not completion of privacy hardening. Still needed:
- Self-service account/cloud-data deletion, permanent trash removal and photo cleanup. Removed photo objects currently remain private in storage; trash is retained until restored.
- Durable API abuse limits and account-based authorisation for AI (existing private AI access code remains).
- A tested server backup/restore process covering both database and photo objects; database backups alone do not back up Storage files.
- Optional end-to-end encryption and recovery, and an explicit migration into that mode.
- Clear cache-removal controls for shared devices, plus privacy wording and retention policy.

Do not advertise administrator-inaccessible journals or instant complete deletion yet.
