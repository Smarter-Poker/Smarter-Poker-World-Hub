import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { PLATFORM_ALERT_RECIPIENTS, PLATFORM_ALERT_TITLES, isPlatformAlert, mayDeliverNotification, isPushOnlyNotification } from '../src/lib/notifications/deliveryPolicy.mjs';
import { isVisibleNotification, notificationCache, readNotificationCache } from '../src/lib/notificationVisibility.mjs';
const player = '11111111-1111-4111-8111-111111111111';
test('every platform alert is restricted to exactly the two verified owner accounts', () => {
  for (const title of PLATFORM_ALERT_TITLES) {
    const row = {type:'system',title};
    assert.equal(isPlatformAlert(row),true);
    assert.equal(mayDeliverNotification(player,row),false);
    for (const id of PLATFORM_ALERT_RECIPIENTS) assert.equal(mayDeliverNotification(id,row),true);
  }
  for (const type of ['financial_incident','engine_break_failed','estate_digest']) assert.equal(mayDeliverNotification(player,{type}),false);
  assert.equal(mayDeliverNotification(player,{type:'system',data:{component:'club-arena-engine',alertname:'UnexpectedFailure'}}),false);
  assert.equal(mayDeliverNotification(player,{event:null,title:'Push Health Alert'}),false,'legacy push without event is still private');
});
test('player and club business notices keep their existing delivery',()=>{
 for(const type of ['accounting_invoice','new_message','cashout_approved','club_announcement','tournament_start']) {
  assert.equal(mayDeliverNotification(player,{type,title:'Push Health Alert'}),true);
  assert.equal(isVisibleNotification({type},player),true);
 }
});
test('blinding off is push only for every account and cannot return through cached/realtime feed',()=>{
 const row={id:'blind',type:'tournament_blinding_off'};
 assert.equal(isPushOnlyNotification(row),true);
 for(const user of [player,...PLATFORM_ALERT_RECIPIENTS]) {
  assert.equal(mayDeliverNotification(user,row),true);
  assert.equal(isVisibleNotification(row,user),false);
  const raw=notificationCache([row,{id:'msg',type:'new_message'}],user,100);
  assert.deepEqual(readNotificationCache(raw,user,101).map(x=>x.id),['msg']);
 }
});

test('database and JavaScript policy share the same alert vocabulary and owner accounts',()=>{
 const sql=readFileSync(new URL('../supabase/migrations/20261012152000_notification_delivery_policy.sql',import.meta.url),'utf8');
 for(const value of [...PLATFORM_ALERT_RECIPIENTS,...PLATFORM_ALERT_TITLES])assert.ok(sql.includes("'"+value+"'"),value);
 assert.equal(mayDeliverNotification(player,{type:'system',title:'New Diagnostic',data:{audience:'platform_admin'}}),false);
 assert.equal(mayDeliverNotification(player,{event:'platform_admin_alert'}),false);
});
