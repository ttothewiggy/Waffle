import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { signupNotification } from '../lib/notifications/signup';
const settings = { secret: 's'.repeat(64), apiKey: 'private-key', to: 'owner@example.com', from: 'onboarding@resend.dev' };
const event = { user_id: '11111111-1111-4111-8111-111111111111', email: 'tester@example.com', created_at: '2026-10-07T00:00:00Z' };
const req = (body: unknown = event, token = settings.secret) => new Request('https://waffle.test/api/notifications/signup', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
test('notification rejects unauthorized, unconfigured and oversized requests before sending', async () => {
  const never = async () => { assert.fail('Must not send email'); };
  assert.equal((await signupNotification(req(event,'wrong'), settings, never)).status,401);
  assert.equal((await signupNotification(req(), {...settings,secret:undefined}, never)).status,503);
  assert.equal((await signupNotification(req({ ...event, email:'x'.repeat(5000) }), settings, never)).status,413);
  assert.equal((await signupNotification(req({ ...event, encrypted_password:'no' }), settings, never)).status,400);
  assert.equal((await signupNotification(req({ ...event, email:'bad\nemail' }), settings, never)).status,400);
});
test('notification uses a fixed recipient, plain text and stable deduplication key', async () => {
  let body = '';
  const send: typeof fetch = async (url, options) => {
    assert.equal(url,'https://api.resend.com/emails');
    assert.equal(new Headers(options?.headers).get('Idempotency-Key'),`waffle-signup/${event.user_id}`);
    body = options?.body as string;
    assert.deepEqual(JSON.parse(body).to,[settings.to]);
    assert.match(JSON.parse(body).text,/tester@example.com/);
    assert.equal(JSON.parse(body).html,undefined);
    assert.ok(!body.includes(settings.secret));
    return Response.json({id:'sent'});
  };
  assert.equal((await signupNotification(req(),settings,send)).status,200);
  const first=body;
  assert.equal((await signupNotification(req(),settings,send)).status,200);
  assert.equal(body,first);
});
test('provider failures are retryable without exposing keys or provider details', async () => {
  for (const send of [async () => Response.json({error:'private detail'},{status:429}), async () => { throw Error('private detail'); }]) {
    const response = await signupNotification(req(),settings,send);
    assert.equal(response.status,502); assert.doesNotMatch(await response.text(),/private detail/);
  }
});
test('SQL queue excludes old/anonymous users, retries safely, hides email after success and cannot block signup', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated;
      create schema auth; create table auth.users(id uuid primary key,email text,created_at timestamptz default now(),is_anonymous boolean default false);
      create schema vault; create table vault.decrypted_secrets(name text,decrypted_secret text);
      create schema net; create table net._http_response(id bigint,status_code int,timed_out boolean,error_msg text);
      create table net.requests(id bigserial primary key,body jsonb);
      create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language plpgsql as $$
      declare n bigint; begin insert into net.requests(body) values(body) returning id into n; return n; end; $$;
      create schema cron; create function cron.schedule(text,text,text) returns bigint language sql as $$select 1::bigint$$;
      insert into auth.users(id,email,created_at) values('00000000-0000-4000-8000-000000000000','old@example.com',now()-interval '1 day');`);
    const migration=(await readFile('supabase/migrations/202610070001_signup_notifications.sql','utf8')).replace(/^create extension.*;$/gm,'');
    await db.exec(migration);
    await db.query('insert into auth.users(id,email) values($1,$2)',[event.user_id,event.email]);
    // Missing delivery settings never interfere with creating an account.
    await db.exec('select waffle_notifications.dispatch();');
    assert.equal((await db.query('select * from net.requests')).rows.length,0);
    assert.equal((await db.query('select * from waffle_notifications.queue')).rows.length,1);
    await db.query('insert into vault.decrypted_secrets values($1,$2),($3,$4)',['waffle_signup_url','https://waffle.test/api/notifications/signup','waffle_signup_secret',settings.secret]);
    await db.exec('select waffle_notifications.dispatch(); select waffle_notifications.dispatch();');
    assert.equal((await db.query('select * from net.requests')).rows.length,1);
    await db.exec("insert into net._http_response values(1,502,false,null); update waffle_notifications.queue set next_attempt_at=now()-interval '1 minute'; select waffle_notifications.dispatch();");
    const sent=await db.query<{body:unknown}>('select body from net.requests order by id');
    assert.equal(sent.rows.length,2); assert.deepEqual(sent.rows[0].body,sent.rows[1].body);
    await db.exec('insert into net._http_response values(2,200,false,null); select waffle_notifications.dispatch();');
    const success=await db.query<{status:string;email:string|null}>('select status,email from waffle_notifications.queue');
    assert.equal(success.rows[0].status,'sent'); assert.equal(success.rows[0].email,null);
    await db.exec(`insert into auth.users values('22222222-2222-4222-8222-222222222222','anon@example.com',now(),true);
      insert into auth.users values('33333333-3333-4333-8333-333333333333','next@example.com',now(),false);
      select waffle_notifications.dispatch();
      update waffle_notifications.queue set first_attempt_at=now()-interval '13 hours',next_attempt_at=now()-interval '1 minute' where status='pending';
      select waffle_notifications.dispatch();`);
    assert.equal((await db.query("select * from waffle_notifications.queue where status='failed' and email is null")).rows.length,1);
    await assert.rejects(db.exec('set role authenticated; select * from waffle_notifications.queue;'),/permission denied/);
    await db.exec('reset role;');
    // Simulate broken notification function: account creation still has no dependency on it.
    await db.exec('drop function waffle_notifications.dispatch();');
    await db.exec("insert into auth.users(id,email) values('44444444-4444-4444-8444-444444444444','still-works@example.com');");
  } finally { await db.close(); }
});
