import assert from 'node:assert/strict';
import { player,other,operator,oldSession,newSession } from './playerControlFixture.mjs';
export async function qualifyPlayerControl(query) {
 const scalar=async sql=>(await query(sql)).rows[0].value;
 const refusal=async sql=>{await assert.rejects(()=>query(sql),/PLAYER_RESTRICTED/);};
 const decision=(scope,key,user=player)=>`SELECT fn_ca_player_control_once('restrict','${operator}','${key}',jsonb_build_object('userId','${user}','scope','${scope}','reasonCode','security_compromise','note','test','expiresAt',NULL,'approvalId',NULL)) AS value`;
 // Policy-off must observe and preserve existing sessions, including horse targets.
 await query(decision('account','restriction-1'));
 await query(`INSERT INTO social_posts(author_id,content) VALUES('${player}','observed')`);
 assert.equal(await scalar(`SELECT count(*)::int AS value FROM ca_restriction_observations`),1);
 let result=await scalar(`SELECT fn_ca_player_force_logout('${player}','${operator}','logout-off','reason') AS value`);
 assert.equal(result.enforced,false);
 assert.equal(await scalar('SELECT count(*)::int AS value FROM auth.sessions'),2);
 assert.equal(await scalar('SELECT count(*)::int AS value FROM ca_player_session_revocations'),0);
 await query('UPDATE ca_operator_policy SET restrictions_enforced=true');
 await refusal(`INSERT INTO table_seats(user_id,table_id) VALUES('${player}','${other}')`);
 await refusal(`INSERT INTO tournament_players(user_id) VALUES('${player}')`);
 await query(`INSERT INTO tournament_players(user_id) VALUES('${other}')`);
 await query(`INSERT INTO ca_player_restrictions(user_id,scope,reason_code,applied_by) VALUES('${other}','tournaments','other','${operator}')`);
 await refusal(`UPDATE tournament_players SET rebuys=rebuys+1 WHERE user_id='${other}'`);
 await refusal(`UPDATE tournament_players SET add_on=true WHERE user_id='${other}'`);
 await query(`UPDATE tournament_players SET status='eliminated' WHERE user_id='${other}'`);
 await refusal(`UPDATE tournament_players SET status='registered' WHERE user_id='${other}'`);
 await query(`UPDATE tournament_players SET status='withdrawn' WHERE user_id='${other}'`);
 await refusal(`INSERT INTO social_posts(author_id,content) VALUES('${player}','denied')`);
 // The original debit and journal are one transaction; a refused journal refunds by rollback.
 for(const journal of [
  `INSERT INTO chip_transactions(from_user_id,to_user_id,amount,transaction_type) VALUES('${player}','${other}',10,'peer_transfer')`,
  `INSERT INTO wallet_transactions(user_id,amount,type,category) VALUES('${player}',10,'debit','transfer')`,
  `INSERT INTO diamond_transactions(user_id,amount,source) VALUES('${player}',-10,'wallet_diamond_transfer')`,
 ]) {
  await query('BEGIN');
  try {await query(`UPDATE balances SET balance=balance-10 WHERE user_id='${player}'`);await refusal(journal);} finally {await query('ROLLBACK');}
  assert.equal(Number(await scalar(`SELECT balance AS value FROM balances WHERE user_id='${player}'`)),100);
 }
 // Credits, returns, deleting own speech, settlement remain available.
 await query(`INSERT INTO diamond_transactions(user_id,amount,source) VALUES('${player}',10,'wallet_diamond_transfer'); DELETE FROM social_posts WHERE author_id='${player}'`);
 await assert.rejects(()=>query(`SELECT fn_ca_player_force_logout('${player}','${other}','unauthorized','reason')`),/moderation.write/);
 result=await scalar(`SELECT fn_ca_player_force_logout('${player}','${operator}','logout-1','reason') AS value`);
 assert.equal(result.revokedSessions,1);
 assert.equal(await scalar(`SELECT count(*)::int AS value FROM auth.refresh_tokens WHERE session_id='${oldSession}'`),0);
 assert.equal(await scalar(`SELECT count(*)::int AS value FROM auth.sessions WHERE user_id='${other}'`),1);
 assert.equal(await scalar(`SELECT fn_ca_player_session_live('${player}','${oldSession}') AS value`),false);
 await query(`INSERT INTO auth.sessions(id,user_id) VALUES('${newSession}','${player}')`);
 assert.equal(await scalar(`SELECT fn_ca_player_session_live('${player}','${newSession}') AS value`),true);
 result=await scalar(`SELECT fn_ca_player_force_logout('${player}','${operator}','logout-1','reason') AS value`);
 assert.equal(result.replayed,true);
 assert.equal(await scalar(`SELECT count(*)::int AS value FROM auth.sessions WHERE id='${newSession}'`),1);
 assert.equal(await scalar(`SELECT count(*)::int AS value FROM fixture_audit WHERE action='player.force_logout'`),2);
 await assert.rejects(()=>query(`SELECT fn_ca_player_force_logout('${player}','${operator}','logout-1','changed reason')`),/idempotency_payload_mismatch/);
 // Original Data API hook refuses old tokens, accepts new ones; full source preflight ran.
 await query(`SELECT set_config('request.jwt.claims','{"sub":"${player}","role":"authenticated","session_id":"${oldSession}"}',false)`);
 await assert.rejects(()=>query('SELECT smarter_private.fn_smarter_data_api_pre_request()'),/SESSION_REVOKED/);
 await query(`SELECT set_config('request.jwt.claims','{"sub":"${player}","role":"authenticated","session_id":"${newSession}"}',false)`);
 await query('SELECT smarter_private.fn_smarter_data_api_pre_request()');
 // Lift then replay must return original decision without taking access away again.
 const restriction=await scalar(`SELECT id AS value FROM ca_player_restrictions WHERE user_id='${player}' AND scope='account'`);
 await query(`SELECT fn_ca_player_control_once('lift','${operator}','lift-1',jsonb_build_object('restrictionId','${restriction}','note','resolved'))`);
 await query(decision('account','restriction-1'));
 assert.equal(await scalar(`SELECT status AS value FROM ca_player_restrictions WHERE id='${restriction}'`),'lifted');
 // Same restrictions apply to horses, with their own independent account.
 await query(decision('social','horse-restriction',other));
 await refusal(`INSERT INTO social_posts(author_id,content) VALUES('${other}','horse denied')`);
 assert.equal(await scalar(`SELECT has_function_privilege('authenticated','fn_ca_player_force_logout(uuid,uuid,text,text,text,text,text)','EXECUTE') AS value`),false);
 return { assertions:'policy off, target only, new login, replay, real debit rollback, horses, hook, permissions',passed:true };
}
