-- Run once in Supabase SQL Editor, after deploying the notification endpoint.
-- No signup trigger: all notification work happens separately, after signup.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
create schema if not exists waffle_notifications;
revoke all on schema waffle_notifications from public, anon, authenticated;

create table if not exists waffle_notifications.settings (
  singleton boolean primary key default true check (singleton),
  enabled_at timestamptz not null default now()
);
insert into waffle_notifications.settings(singleton) values(true) on conflict do nothing;
create table if not exists waffle_notifications.queue (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null,
  attempts integer not null default 0,
  first_attempt_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  request_id bigint,
  status text not null default 'pending' check(status in ('pending','sent','failed'))
);
alter table waffle_notifications.settings enable row level security;
alter table waffle_notifications.queue enable row level security;
revoke all on all tables in schema waffle_notifications from public, anon, authenticated;

create or replace function waffle_notifications.dispatch()
returns void language plpgsql security definer set search_path = '' as $$
declare
  target text; secret text; item record; request bigint;
begin
  -- Avoid overlapping manual/scheduled runs.
  if not pg_try_advisory_xact_lock(73460107001) then return; end if;
  -- Snapshot only minimal signup data. Existing accounts are not backfilled.
  insert into waffle_notifications.queue(user_id,email,created_at)
    select u.id,u.email,u.created_at from auth.users u
    where u.created_at >= (select enabled_at from waffle_notifications.settings where singleton)
      and u.is_anonymous is not true and u.email is not null and u.email <> ''
    on conflict(user_id) do nothing;

  -- HTTP 200 means Resend accepted it; inbox delivery is tracked in Resend.
  update waffle_notifications.queue q set status='sent',email=null
    from net._http_response r where r.id=q.request_id and q.status='pending'
      and r.status_code=200 and coalesce(r.timed_out,false)=false and r.error_msg is null;
  -- Never replay beyond Resend's 24-hour idempotency window.
  update waffle_notifications.queue set status='failed',email=null
    where status='pending' and next_attempt_at <= now()
      and (attempts >= 12 or first_attempt_at < now()-interval '12 hours');

  select decrypted_secret into target from vault.decrypted_secrets where name='waffle_signup_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name='waffle_signup_secret';
  if target is null or target !~ '^https://' or secret is null or length(secret)<32 then return; end if;
  -- One request per minute keeps small-project volume gentle. Retry after 5 minutes.
  select * into item from waffle_notifications.queue
    where status='pending' and next_attempt_at<=now() order by created_at limit 1 for update;
  if not found then return; end if;
  request := net.http_post(url:=target,
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||secret),
    body:=jsonb_build_object('user_id',item.user_id,'email',item.email,'created_at',item.created_at),
    timeout_milliseconds:=20000);
  update waffle_notifications.queue set request_id=request,attempts=attempts+1,
    first_attempt_at=coalesce(first_attempt_at,now()),next_attempt_at=now()+interval '5 minutes'
    where user_id=item.user_id;
end;
$$;
revoke all on function waffle_notifications.dispatch() from public, anon, authenticated;
-- Running this migration again replaces this named schedule rather than duplicating it.
select cron.schedule('waffle-signup-notifications','* * * * *','select waffle_notifications.dispatch();');
