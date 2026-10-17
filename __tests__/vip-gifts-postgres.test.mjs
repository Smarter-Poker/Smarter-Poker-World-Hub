import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import net from 'node:net';
import pg from 'pg';
const root = new URL('../', import.meta.url);
const migration = readFileSync(new URL('supabase/migrations/20261017002000_vip_friend_gifts.sql', root), 'utf8');
const fixture = `
CREATE EXTENSION pgcrypto; CREATE SCHEMA extensions;
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE TABLE profiles(id uuid PRIMARY KEY,is_vip boolean DEFAULT false,vip_tier text,vip_expires_at timestamptz,
 diamonds integer DEFAULT 100000,diamond_balance integer DEFAULT 100000,diamond_multiplier numeric DEFAULT 2,updated_at timestamptz DEFAULT now());
CREATE TABLE friendships(user_id uuid,friend_id uuid,status text);
CREATE TABLE ca_money_rpc_registry(proname text PRIMARY KEY,status text,notes text);
CREATE TABLE notifications(id uuid DEFAULT gen_random_uuid(),user_id uuid,actor_id uuid,type text,title text,message text,link text,action_url text,data jsonb);
CREATE TABLE vip_subscriptions(user_id uuid,status text,stripe_subscription_id text);
CREATE TABLE vip_subscription_checkout_claims(user_id uuid,state text,expires_at timestamptz);
CREATE TABLE diamond_transactions(id uuid DEFAULT gen_random_uuid(),user_id uuid,amount integer,transaction_type text,type text,
 description text,balance_after integer,reference_id text,metadata jsonb,counterparty text,issuance_class text,UNIQUE(user_id,reference_id));
CREATE TABLE diamond_purchase_lots(id uuid DEFAULT gen_random_uuid(),user_id uuid,issued bigint,consumed bigint DEFAULT 0,refunded bigint DEFAULT 0,
 arena_reserved bigint DEFAULT 0,frozen_at timestamptz,created_at timestamptz DEFAULT now());
CREATE TABLE diamond_debts(id uuid DEFAULT gen_random_uuid(),user_id uuid,purchase_id uuid,amount bigint,reason text,
 created_at timestamptz DEFAULT now(),settled_at timestamptz,settled_by text);
CREATE TABLE ca_payout_freeze(scope text,cleared_at timestamptz);
-- Isolated configuration only: negative gift spends/refunds do not issue earnings.
CREATE FUNCTION fn_ca_diamond_rule_mode(text) RETURNS text LANGUAGE sql AS $$ SELECT 'observe'::text $$;
CREATE FUNCTION fn_ca_diamond_incident(text,text,uuid,bigint,text,jsonb) RETURNS void LANGUAGE sql AS $$ SELECT $$;
`;
const ids = ['10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000003'];

test('VIP gift transactions: real PostgreSQL wallet, friendship, payments, redemption, reversals and concurrency', async () => {
  const bin = process.env.PG17_BINDIR || ['/opt/homebrew/opt/postgresql@17/bin','/usr/lib/postgresql/17/bin'].find(p => existsSync(join(p,'initdb')));
  assert.ok(bin, 'PostgreSQL 17 is required; do not skip financial qualification');
  const base = process.env.VIP_GIFT_POSTGRES_ROOT || process.env.MARKETPLACE_POSTGRES_ROOT;
  assert.ok(base && existsSync(base), 'Provide a task-owned PostgreSQL scratch directory');
  const dir=mkdtempSync(join(base,'vip-gifts-')); const data=join(dir,'db'); const socket=join(dir,'socket'); mkdirSync(socket);
  const server=net.createServer(); await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve)); const port=server.address().port;
  await new Promise(resolve=>server.close(resolve));
  const opts={host:'127.0.0.1',port,user:'postgres',database:'postgres'};
  const client=new pg.Client(opts); let started=false;
  async function rpc(name,args,connection=client) {
    const {rows}=await connection.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args);
    return rows[0].result;
  }
  const send=(request,plan='monthly',method='diamonds',recipient=ids[1],amount={monthly:1999,yearly:19999,lifetime:49900}[plan],connection=client)=>
    rpc('send_vip_gift_atomic',[ids[0],recipient,request,plan,method,amount],connection);
  try {
    execFileSync(join(bin,'initdb'),['-D',data,'-U','postgres','--no-locale','--encoding=UTF8','--wal-segsize=1'],{stdio:'ignore'});
    execFileSync(join(bin,'pg_ctl'),['-D',data,'-l',join(dir,'pg.log'),'-o',`-F -p ${port} -k ${socket} -c listen_addresses=127.0.0.1 -c timezone=UTC`,'-w','start'],{stdio:'ignore'}); started=true;
    await client.connect(); await client.query(fixture);
    await client.query(readFileSync(new URL('__tests__/fixtures/vip-gift-wallet.sql',root),'utf8'));
    await assert.rejects(send('before-migration'),/does not exist/);
    await client.query(migration);
    await assert.rejects(client.query(migration),/already exists/); await client.query('ROLLBACK');
    await client.query('insert into profiles(id) select unnest($1::uuid[])',[ids]);
    assert.equal((await send('no-friend')).error,'friends_required');
    await client.query("insert into friendships values($1,$2,'pending')",[ids[1],ids[0]]);
    assert.equal((await send('pending-friend')).error,'friends_required');
    await client.query("update friendships set status='accepted'");
    assert.equal((await send('self-gift','monthly','diamonds',ids[0])).error,'invalid_offer');
    assert.equal((await send('price-tamper','monthly','diamonds',ids[1],1)).error,'invalid_offer');
    const second=new pg.Client(opts); await second.connect();
    let pair;
    try { pair=await Promise.all([send('same-request'),send('same-request','monthly','diamonds',ids[1],1999,second)]); }
    finally { await second.end(); }
    assert.ok(pair.every(r=>r.success)); assert.equal(pair.filter(r=>r.duplicate).length,1);
    const gift=pair[0].gift;
    assert.equal((await client.query('select diamonds from profiles where id=$1',[ids[0]])).rows[0].diamonds,98001);
    assert.equal((await client.query('select count(*)::integer n from diamond_transactions')).rows[0].n,1);
    assert.equal((await client.query('select count(*)::integer n from notifications')).rows[0].n,1);
    assert.equal((await send('same-request','yearly')).error,'request_conflict');
    assert.equal((await rpc('redeem_vip_gift_atomic',[ids[2],gift.id])).error,'gift_not_found');
    const redeemed=await rpc('redeem_vip_gift_atomic',[ids[1],gift.id]); assert.equal(redeemed.tier,'monthly');
    const expiry=Date.parse(redeemed.expiresAt); assert.ok(expiry>Date.now()+29.99*86400000 && expiry<Date.now()+30.01*86400000, JSON.stringify(redeemed));
    assert.equal((await rpc('redeem_vip_gift_atomic',[ids[1],gift.id])).duplicate,true);
    assert.equal((await rpc('return_vip_gift_atomic',[ids[0],gift.id])).error,'gift_not_returnable');
    const refundable=(await send('return-diamond')).gift;
    assert.equal((await rpc('return_vip_gift_atomic',[ids[2],refundable.id])).error,'gift_not_found');
    assert.equal((await rpc('return_vip_gift_atomic',[ids[1],refundable.id])).success,true);
    assert.equal((await rpc('return_vip_gift_atomic',[ids[0],refundable.id])).duplicate,true);
    assert.equal((await client.query('select diamonds from profiles where id=$1',[ids[0]])).rows[0].diamonds,98001,'2x earnings multiplier must never multiply a return');
    await client.query('update profiles set diamonds=1 where id=$1',[ids[0]]);
    assert.equal((await send('insufficient')).error,'insufficient_diamonds');
    assert.equal((await client.query("select count(*)::int n from vip_gifts where request_id='insufficient'")).rows[0].n,0);
    await client.query('update profiles set diamonds=100000 where id=$1',[ids[0]]);
    const yearly=(await send('year-extension','yearly')).gift;
    const prior=(await client.query('select vip_expires_at from profiles where id=$1',[ids[1]])).rows[0].vip_expires_at;
    const yearResult=await rpc('redeem_vip_gift_atomic',[ids[1],yearly.id]);
    assert.equal(yearResult.tier,'yearly'); assert.equal(Date.parse(yearResult.expiresAt)-prior.getTime(),365*86400000);
    const raceGift=(await send('redeem-return-race')).gift;
    const racing=new pg.Client(opts);await racing.connect();
    let raced;
    try { raced=await Promise.all([rpc('redeem_vip_gift_atomic',[ids[1],raceGift.id]),rpc('return_vip_gift_atomic',[ids[0],raceGift.id],racing)]); }
    finally { await racing.end(); }
    assert.equal(raced.filter(r=>r.success).length,1,'a gift cannot be both redeemed and refunded');
    const card=(await send('card-lifetime','lifetime','card')).gift;
    assert.equal((await rpc('redeem_vip_gift_atomic',[ids[1],card.id])).error,'gift_not_available');
    assert.equal((await rpc('settle_vip_gift_atomic',[card.id,'cs_gift','pi_gift',1])).error,'settlement_conflict');
    assert.equal((await rpc('settle_vip_gift_atomic',[card.id,'cs_gift','pi_gift',49900])).success,true);
    assert.equal((await rpc('settle_vip_gift_atomic',[card.id,'cs_gift','pi_gift',49900])).duplicate,true);
    await client.query("insert into vip_subscriptions values($1,'active','sub_card')",[ids[1]]);
    assert.equal((await rpc('redeem_vip_gift_atomic',[ids[1],card.id])).error,'manage_card_subscription_first');
    await client.query('delete from vip_subscriptions');
    await client.query("insert into vip_subscription_checkout_claims values($1,'admitting',now()+interval '1 hour')",[ids[1]]);
    assert.equal((await rpc('redeem_vip_gift_atomic',[ids[1],card.id])).error,'manage_card_subscription_first');
    await client.query('delete from vip_subscription_checkout_claims');
    assert.equal((await rpc('redeem_vip_gift_atomic',[ids[1],card.id])).tier,'lifetime');
    assert.equal((await client.query('select vip_expires_at from profiles where id=$1',[ids[1]])).rows[0].vip_expires_at,null);
    assert.equal((await send('already-lifetime')).error,'recipient_already_lifetime');
    // Partial refunds preserve the term. Dispute withdrawal restores prior term.
    await rpc('reverse_vip_gift_atomic',[card.id,100,null,null]);
    assert.equal((await client.query('select vip_tier from profiles where id=$1',[ids[1]])).rows[0].vip_tier,'lifetime');
    await rpc('reverse_vip_gift_atomic',[card.id,100,'open','dp_gift']);
    assert.equal((await client.query('select vip_tier from profiles where id=$1',[ids[1]])).rows[0].vip_tier,'yearly');
    await rpc('reverse_vip_gift_atomic',[card.id,100,'won','dp_gift']);
    assert.equal((await client.query('select vip_tier from profiles where id=$1',[ids[1]])).rows[0].vip_tier,'lifetime');
    await rpc('reverse_vip_gift_atomic',[card.id,100,'open','dp_gift']);
    assert.equal((await client.query('select vip_tier from profiles where id=$1',[ids[1]])).rows[0].vip_tier,'lifetime','late dispute-created cannot reopen a won dispute');
    // Later independent VIP writer clears provenance; an old refund must not undo it.
    await client.query("update profiles set vip_tier='yearly',vip_expires_at=now()+interval '400 days' where id=$1",[ids[1]]);
    await rpc('reverse_vip_gift_atomic',[card.id,49900,null,null]);
    assert.equal((await client.query('select vip_tier from profiles where id=$1',[ids[1]])).rows[0].vip_tier,'yearly');
    const early=(await send('refund-before-paid','monthly','card')).gift;
    await rpc('reverse_vip_gift_atomic',[early.id,1999,null,null]);
    await rpc('settle_vip_gift_atomic',[early.id,'cs_early','pi_early',1999]);
    assert.equal((await client.query('select status from vip_gifts where id=$1',[early.id])).rows[0].status,'refunded');
    const returning=(await send('card-return','monthly','card')).gift;
    await rpc('settle_vip_gift_atomic',[returning.id,'cs_return','pi_return',1999]);
    assert.equal((await rpc('prepare_vip_gift_card_return',[ids[0],returning.id])).paymentIntent,'pi_return');
    assert.equal((await rpc('redeem_vip_gift_atomic',[ids[1],returning.id])).error,'gift_not_available');
    await rpc('reverse_vip_gift_atomic',[returning.id,1999,null,null]);
    // Replay is historical even after friendship disappears.
    await client.query('delete from friendships'); assert.equal((await send('same-request')).duplicate,true);
    assert.equal((await send('removed-friend')).error,'friends_required');
    await client.query('grant select,update on profiles to authenticated');
    await client.query('set role authenticated');
    await assert.rejects(client.query('update profiles set vip_gift_id=$1 where id=$2',[gift.id,ids[1]]),/service-managed/);
    await assert.rejects(client.query('select * from vip_gifts'),/permission denied/);
    await assert.rejects(send('forged-service'),/permission denied/); await client.query('reset role');
    const {rows:[security]}=await client.query("select bool_and(p.prosecdef AND p.proconfig @> ARRAY['search_path=public, extensions']) ok from pg_proc p where p.proname in ('send_vip_gift_atomic','settle_vip_gift_atomic','redeem_vip_gift_atomic','return_vip_gift_atomic','reverse_vip_gift_atomic')");
    assert.equal(security.ok,true);
  } finally {
    await client.end().catch(()=>{});
    if(started) execFileSync(join(bin,'pg_ctl'),['-D',data,'-m','immediate','-w','stop'],{stdio:'ignore'});
    rmSync(dir,{recursive:true,force:true});
  }
});
