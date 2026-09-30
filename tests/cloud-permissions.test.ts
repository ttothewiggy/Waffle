import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const alice = "11111111-1111-4111-8111-111111111111";
const bob = "22222222-2222-4222-8222-222222222222";
test("SQL migration enforces account isolation, private photo ownership and optimistic concurrency", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth; create schema storage;
      create table auth.users(id uuid primary key);
      insert into auth.users values ('${alice}'), ('${bob}');
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects(id uuid default gen_random_uuid(), bucket_id text, name text);
      alter table storage.objects enable row level security;
      create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1, '/') $$;
      grant usage on schema public, auth, storage to anon, authenticated;
      grant select, insert, update, delete on storage.objects to authenticated;
    `);
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/202609300001_journal_sync.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec(
      `set role authenticated; set request.jwt.claim.sub = '${alice}';`,
    );
    const save = (who: string, version: number) =>
      db.query(
        "select public.waffle_save_journal($1::uuid, $2::bigint, $3::jsonb) as revision",
        [who, version, JSON.stringify({ version: 1, entries: [], trash: [] })],
      );
    assert.equal((await save(alice, 0)).rows.length, 1);
    await assert.rejects(save(alice, 0), /another device/);
    await assert.rejects(save(bob, 0), /Sign in required/);
    await assert.rejects(
      db.exec(`update public.waffle_journals set revision = 99`),
      /permission denied/,
    );
    await db.query(
      "insert into storage.objects(bucket_id,name) values ('waffle-photos',$1)",
      [`${alice}/photo`],
    );
    await assert.rejects(
      db.query(
        "insert into storage.objects(bucket_id,name) values ('waffle-photos',$1)",
        [`${bob}/photo`],
      ),
      /row-level security/,
    );
    await db.exec(`set request.jwt.claim.sub = '${bob}';`);
    assert.equal(
      (await db.query("select * from public.waffle_journals")).rows.length,
      0,
    );
    assert.equal(
      (await db.query("select * from storage.objects")).rows.length,
      0,
    );
    await save(bob, 0);
    await db.exec(`set request.jwt.claim.sub = '${alice}';`);
    await save(alice, 1);
    await assert.rejects(save(alice, 1), /another device/);
    await db.exec(
      "reset role; set role anon; set request.jwt.claim.sub = ''; ",
    );
    await assert.rejects(
      db.query("select * from public.waffle_journals"),
      /permission denied/,
    );
    await assert.rejects(save(alice, 2), /permission denied/);
    await db.exec("reset role;");
    assert.equal(
      (
        await db.query<{ public: boolean }>(
          "select public from storage.buckets where id = 'waffle-photos'",
        )
      ).rows[0].public,
      false,
    );
  } finally {
    await db.close();
  }
});
