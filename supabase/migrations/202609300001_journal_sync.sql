-- Run once in the Waffle project's SQL Editor. No secret key is needed in Waffle.
begin;
create table public.waffle_journals (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 1 check (revision > 0),
  manifest jsonb not null check (jsonb_typeof(manifest) = 'object' and octet_length(manifest::text) <= 10485760),
  updated_at timestamptz not null default now()
);
alter table public.waffle_journals enable row level security;
revoke all on public.waffle_journals from anon, authenticated;
grant select on public.waffle_journals to authenticated;
create policy "Read own journal" on public.waffle_journals for select to authenticated using ((select auth.uid()) = user_id);

-- All writes pass an expected revision. Concurrent writes cannot silently overwrite.
create function public.waffle_save_journal(expected_user uuid, expected_revision bigint, new_manifest jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare who uuid := auth.uid(); result bigint;
begin
  if who is null or who <> expected_user then raise exception 'Sign in required' using errcode = '42501'; end if;
  if expected_revision = 0 then
    insert into public.waffle_journals(user_id, manifest) values(who, new_manifest)
      on conflict (user_id) do nothing returning revision into result;
  else
    update public.waffle_journals set manifest = new_manifest, revision = revision + 1, updated_at = now()
      where user_id = who and revision = expected_revision returning revision into result;
  end if;
  if result is null then raise exception 'Journal changed on another device' using errcode = '40001'; end if;
  return result;
end;
$$;
revoke all on function public.waffle_save_journal(uuid, bigint, jsonb) from public, anon;
grant execute on function public.waffle_save_journal(uuid, bigint, jsonb) to authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('waffle-photos', 'waffle-photos', false, 20971520, array['image/jpeg','image/png','image/webp','image/gif']);
create policy "Read own Waffle photos" on storage.objects for select to authenticated
using (bucket_id = 'waffle-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Upload own Waffle photos" on storage.objects for insert to authenticated
with check (bucket_id = 'waffle-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
-- Immutable, content-addressed photos. No update policy; no public URLs.
commit;
