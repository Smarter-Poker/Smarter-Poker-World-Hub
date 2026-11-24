#!/usr/bin/env python3
"""Exercise source migrations with actual cashout, autoledger and receipt functions in PG17.
The invoice transport fixture emits witnesses; real receipt validation checks them.
No production connection, customer rows or synthetic production money is used.
"""
import os,json,tempfile,subprocess,socket,hashlib,time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
R=Path(__file__).resolve().parents[2]
PG=Path(os.environ.get('PHASE6_POSTGRES_BIN','/opt/homebrew/opt/postgresql@17/bin' if os.uname().sysname=='Darwin' else '/usr/lib/postgresql/17/bin'))
parent=Path(os.environ.get('NOTICE_PG_ROOT',str(R/'work')));parent.mkdir(parents=True,exist_ok=True)
D=Path(tempfile.mkdtemp(prefix='notice-pg-',dir=parent));env={**os.environ,'TMPDIR':str(D),'LC_ALL':'C'}
sock=socket.socket();sock.bind(('127.0.0.1',0));port=sock.getsockname()[1];sock.close()
started=False;cases=[]
def cmd(name,*args):return subprocess.run([str(PG/name),*args],env=env,text=True,capture_output=True,check=True)
def sql(s,error=None):
 p=subprocess.run([str(PG/'psql'),'-X','-qAt','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',str(port),'-U','postgres','-d','postgres'],input=s,env=env,text=True,capture_output=True)
 if error:
  assert p.returncode and error in p.stderr,(error,p.stdout,p.stderr);return
 assert p.returncode==0,p.stderr
 return p.stdout.strip()
def lit(x):return "'"+str(x).replace("'","''")+"'"
def uid(n):return 'e6470000-0000-4000-8000-'+str(n).zfill(12)
C=uid(100);C2=uid(101);OWNER=uid(1);AGENT=uid(2);PLAYER=uid(3);ADMIN=uid(4);CO=uid(5);OTHER=uid(6);SUPER=uid(7);SUB=uid(8)
def asuser(u,s,role='authenticated',error=None):return sql('SET ROLE '+role+'; SELECT set_config(\'request.jwt.claim.sub\','+lit(u)+',false);'+s,error=error)
def rpc(u,name,args,error=None):
 out=asuser(u,"SELECT coalesce(to_jsonb("+name+'('+','.join(args)+")),'null'::jsonb);",error=error)
 return None if error else json.loads(out.splitlines()[-1])
def board(u,action,payload={},error=None):return rpc(u,'fn_club_notice_board',[lit(u),lit(C),lit(action),lit(json.dumps(payload))+'::jsonb'],error=error) if False else _board(u,action,payload,error)
def _board(u,action,payload,error):
 out=asuser(u,'SELECT fn_club_notice_board('+','.join([lit(u),lit(C),lit(action),lit(json.dumps(payload))+'::jsonb'])+');',role='service_role',error=error)
 return None if error else json.loads(out.splitlines()[-1])
seq=200
def op():
 global seq;seq+=1;return uid(seq)
def hold(note='Player Note'):
 return rpc(PLAYER,'fn_cashout_request_v2',[lit(C),'100.25',lit(PLAYER),lit(op()),lit(note)])
def escalate(h,who=AGENT,operation=None,error=None):return rpc(who,'fn_cashout_escalate_v2',[lit(h['cashout_id']),lit(C),lit(who),lit(operation or op())],error)
def decide(h,who,action='approve',operation=None,error=None):return rpc(who,'fn_cashout_'+('approve' if action=='approve' else 'release')+'_v2',[lit(h['cashout_id']),lit(C),'100.25',lit(who),lit(operation or op()),'NULL'],error)
def balances():return json.loads(sql("SELECT jsonb_build_object('player',(SELECT chip_balance FROM club_members WHERE club_id="+lit(C)+" AND user_id="+lit(PLAYER)+"),'bank',(SELECT chip_treasury FROM clubs WHERE id="+lit(C)+"),'agents',(SELECT coalesce(sum(agent_wallet_balance),0) FROM agents WHERE club_id="+lit(C)+"),'held',(SELECT coalesce(sum(amount),0) FROM chip_escrow WHERE club_id="+lit(C)+" AND released_at IS NULL));"))
try:
 cmd('initdb','-D',str(D/'data'),'-A','trust','-U','postgres','--no-locale','-E','UTF8')
 cmd('pg_ctl','-D',str(D/'data'),'-l',str(D/'server.log'),'-o',f"-p {port} -c listen_addresses=127.0.0.1 -c unix_socket_directories='' -c wal_level=logical",'start');started=True
 sql((R/'__tests__/sql/notice-cashout/baseline.sql').read_text())
 # Synthetic identities are local-only. Actual trigger logic remains enabled.
 for u,role in [(OWNER,'owner'),(AGENT,'agent'),(PLAYER,'player'),(ADMIN,'admin'),(CO,'co_owner'),(OTHER,'agent'),(SUPER,'super_agent'),(SUB,'sub_agent')]:
  sql('INSERT INTO profiles(id,username,status) VALUES('+lit(u)+','+lit('Fixture '+role)+",'active');")
 sql('INSERT INTO clubs(id,name,owner_id,chip_treasury) VALUES('+','.join([lit(C),"'Fixture Club'",lit(OWNER),'500'])+'),('+','.join([lit(C2),"'Other Club'",lit(OTHER),'500'])+');')
 for u,role in [(OWNER,'owner'),(AGENT,'agent'),(PLAYER,'player'),(ADMIN,'admin'),(CO,'co_owner'),(SUPER,'super_agent'),(SUB,'sub_agent')]:
  sql('INSERT INTO club_members(club_id,user_id,role,status,is_active,membership_lifecycle_status,agent_id,chip_balance) VALUES('+','.join([lit(C),lit(u),lit(role),"'active'",'true',"'active'",lit(AGENT) if u==PLAYER else 'NULL','1000'])+');')
  if role in ['agent','super_agent','sub_agent']:
   sql('INSERT INTO agents(id,club_id,user_id,role,status,agent_wallet_balance) VALUES('+','.join([lit(op()),lit(C),lit(u),lit(role),"'active'",'0'])+');')
 legacy_message=op()
 sql('INSERT INTO social_messages(id,conversation_id,sender_id,content) SELECT '+lit(legacy_message)+',conversation_id,'+lit(AGENT)+",'Historical Agent Post' FROM club_messenger_staff_notice_groups WHERE club_id="+lit(C)+';')
 sql('ALTER TABLE social_messages ENABLE ROW LEVEL SECURITY; GRANT SELECT,UPDATE,DELETE ON social_messages TO authenticated; CREATE POLICY fixture_message_read ON social_messages FOR SELECT TO authenticated USING (sender_id=auth.uid()); CREATE POLICY fixture_message_edit ON social_messages FOR UPDATE TO authenticated USING(sender_id=auth.uid()) WITH CHECK(sender_id=auth.uid());')
 assert board(PLAYER,'read')['canManage']==False
 assert board(CO,'read')['canManage']==False
 for name in ['20261117203000_notice_board_staff_and_cashout_links.sql','20261117203100_escalated_cashouts_settle_to_club_bank.sql']:
  sql((R/'supabase/migrations'/name).read_text())
  if name.startswith('20261117203000'):
   assert sql("SELECT has_function_privilege('authenticated','public.fn_cashout_escalate_v2(uuid,uuid,uuid,uuid)','EXECUTE');")=="f"
   asuser(AGENT,"SELECT fn_cashout_escalate_v2(NULL,NULL,NULL,NULL);",error='permission denied')
 assert sql("SELECT has_function_privilege('authenticated','public.fn_cashout_escalate_v2(uuid,uuid,uuid,uuid)','EXECUTE');")=="t"
 cases.append('escalation admission denied between migrations until bank settlement installed')
 assert board(AGENT,'read')['memberCount']==6
 for u in [AGENT,SUPER,SUB]:assert board(u,'read')['canManage']==False
 for u in [OWNER,ADMIN,CO]:assert board(u,'read')['canManage']==True
 board(PLAYER,'read',error='Active Club Membership Required');board(OTHER,'read',error='Active Club Membership Required')
 for change in ["is_deleted=true","media_metadata='{}'::jsonb","content='Changed'","conversation_id=NULL"]:
  asuser(AGENT,'UPDATE social_messages SET '+change+' WHERE id='+lit(legacy_message)+';',error='Only Club Management')
 asuser(AGENT,'UPDATE social_messages SET read_at=now() WHERE id='+lit(legacy_message)+';')
 asuser(AGENT,'DELETE FROM social_messages WHERE id='+lit(legacy_message)+';')
 assert sql('SELECT count(*) FROM social_messages WHERE id='+lit(legacy_message)+';')=='1'
 cases.append('staff group metadata/soft-delete edits blocked; receipt reads preserved and existing RLS denies hard delete')
 cases.append('current staff inclusion, co-owner management, ordinary and other-club denial')
 entry=board(OWNER,'create',{'id':op(),'content':'Club Notice','status':'notice'})
 for u in [AGENT,SUPER,SUB]:board(u,'create',{'id':op(),'content':'Unauthorized','status':'notice'},error='Club Admin Or Owner Required')
 # Demotion removes history even if the former agent record stays active.
 sql('UPDATE club_members SET role=\'player\' WHERE club_id='+lit(C)+' AND user_id='+lit(AGENT)+';')
 board(AGENT,'read',error='Active Club Membership Required')
 assert asuser(AGENT,'SELECT count(*) FROM club_notice_board;').splitlines()[-1]=='0'
 assert asuser(AGENT,'SELECT can_access FROM club_notice_access_events WHERE club_id='+lit(C)+';').splitlines()[-1]=='f'
 sql('UPDATE club_members SET role=\'agent\' WHERE club_id='+lit(C)+' AND user_id='+lit(AGENT)+';')
 assert board(AGENT,'read')['rows'][0]['id']==entry['id']
 for col,value in [('is_active','false'),('membership_lifecycle_status',"'left'"),('status',"'kicked'")]:
  sql('UPDATE club_members SET '+col+'='+value+' WHERE club_id='+lit(C)+' AND user_id='+lit(AGENT)+';')
  board(AGENT,'read',error='Active Club Membership Required')
  sql('UPDATE club_members SET is_active=true,membership_lifecycle_status=\'active\',status=\'active\' WHERE club_id='+lit(C)+' AND user_id='+lit(AGENT)+';')
 sql('UPDATE agents SET status=\'inactive\' WHERE club_id='+lit(C)+' AND user_id='+lit(AGENT)+';');board(AGENT,'read',error='Active Club Membership Required')
 sql('UPDATE agents SET status=\'active\' WHERE club_id='+lit(C)+' AND user_id='+lit(AGENT)+';')
 cases.append('promotion/demotion/departure/inactive-agent revokes DB history and emits self-readable access event')
 before=balances();h=hold('Line One\nLine Two');afterhold=balances();eop=op();
 with ThreadPoolExecutor(max_workers=2) as pool: ers=list(pool.map(lambda _:escalate(h,operation=eop),range(2)))
 assert sorted(x['replayed'] for x in ers)==[False,True]
 es=ers[0];assert es['is_escalated'] and not es['can_decide']
 assert balances()==afterhold
 assert escalate(h,operation=eop)['replayed']
 escalate(h,operation=op(),error='cashier_request_already_escalated')
 assert rpc(AGENT,'fn_cashout_request_card',[lit(h['cashout_id'])])['can_decide']==False
 assert rpc(SUB,'fn_cashout_request_card',[lit(h['cashout_id'])])['is_escalated']
 assert rpc(OTHER,'fn_cashout_request_card',[lit(h['cashout_id'])]) is None
 decide(h,AGENT,error='Escalated Cashouts Require Club Management')
 for u in [SUPER,SUB]:decide(h,u,error='cashier_current_authority_required')
 card=[r for r in board(AGENT,'read')['rows'] if r.get('cashout_id')==h['cashout_id']][0]
 board(OWNER,'update',{'id':card['id'],'version':card['version'],'status':'paid'},error='Use The Cashout Decision')
 noteop=op();notep={'id':card['id'],'version':card['version'],'note':'Arrange Payout','op_id':noteop}
 noted=board(CO,'add_note',notep);assert len(noted['manager_notes'])==1
 assert board(CO,'add_note',notep)==noted
 board(AGENT,'add_note',notep,error='Club Admin Or Owner Required')
 approveop=op();a=decide(h,CO,operation=approveop)
 assert a['cashier']['ledger_to_type']=='club_treasury' and a['cashier']['ledger_to_entity_id']==C
 assert a['approval_destination']=='club_bank' and a['club_bank_after']==a['actor_wallet_after']
 assert 'club_bank_after' not in a['cashier']
 assert decide(h,CO,operation=approveop)['replayed']
 after=balances();assert after['bank']==before['bank']+100.25 and after['agents']==before['agents'] and after['held']==0
 assert sum(after.values())==sum(before.values())
 assert [r for r in board(AGENT,'read')['rows'] if r.get('cashout_id')==h['cashout_id']][0]['cashout']['status']=='approved'
 cases.append('concurrent escalation preserves one hold and one link, manager notes retry, manager-only atomic bank approval and exact immutable receipt')
 h=hold();escalate(h);b=balances();decide(h,ADMIN,'release');a=balances();assert a['bank']==b['bank'] and a['player']==b['player']+100.25 and a['held']==0
 cases.append('manager denial refunds original player')
 h=hold();b=balances();a=decide(h,AGENT);assert a['ledger_to_type']=='agent_wallet' and 'approval_destination' not in a
 assert balances()['agents']==b['agents']+100.25
 cases.append('private approval preserves original agent destination and receipt shape')
 h=hold('x'*2000);assert h['accepted_note']=='x'*2000;decide(h,PLAYER,'release')
 rpc(PLAYER,'fn_cashout_request_v2',[lit(C),'100.25',lit(PLAYER),lit(op()),lit('x'*2001)],error='cashier_note_too_long')
 cases.append('2000-character multiline note boundary and player withdrawal')
 h=hold();escalate(h);b=balances();
 asuser(OWNER,"SELECT set_config('app.ledger_autoskip_clubs','1',false); SELECT fn_cashout_approve_v2("+','.join([lit(h['cashout_id']),lit(C),'100.25',lit(OWNER),lit(op()),'NULL'])+');',error='cashier_physical_ledger_missing_or_duplicate')
 assert balances()==b
 cases.append('suppressed bank journal aborts the whole approval without changing escrow or balances')
 o1=op();o2=op()
 def terminal(u,o):
  try:return decide(h,u,operation=o)
  except AssertionError as e:return str(e)
 with ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(lambda z:terminal(*z),[(OWNER,o1),(ADMIN,o2)]))
 assert sum(isinstance(x,dict) for x in results)==1,results
 assert balances()['bank']==b['bank']+100.25
 assert sql('SELECT count(*) FROM accounting_cashier_events WHERE cashout_id='+lit(h['cashout_id'])+" AND event_slot='terminal';")=='1'
 cases.append('simultaneous decisions produce exactly one terminal event and bank movement')
 # Apply 20261124150500: owner downline notification suppression, >4h overdue owner alert, and Telegram Notice Board.
 sql((R/'supabase/migrations/20261124150500_payout_overdue_owner_notify_and_telegram_notice_board.sql').read_text())
 sql((R/'supabase/migrations/20261124150500_payout_overdue_owner_notify_and_telegram_notice_board.sql').read_text(),error='Overdue cashout owner notification table already installed')
 # 1. Non-escalated agent approval/decline/withdrawal excludes OWNER from audience & notifications.
 owner_notes_before=int(sql('SELECT count(*) FROM notifications WHERE user_id='+lit(OWNER)+';'))
 h=hold('Normal downline payout');a=decide(h,AGENT)
 aud=json.loads(sql('SELECT to_jsonb(audience_user_ids) FROM accounting_cashier_events WHERE id='+lit(a['event_id'])+';'))
 assert sorted(aud)==sorted([PLAYER,AGENT]),aud
 assert OWNER not in aud
 assert int(sql('SELECT count(*) FROM notifications WHERE user_id='+lit(OWNER)+';'))==owner_notes_before
 # Admin deciding another agent's non-escalated cashout informs player, admin, and assigned agent, NOT owner.
 h=hold('Admin non-escalated');a=decide(h,ADMIN,'release')
 aud=json.loads(sql('SELECT to_jsonb(audience_user_ids) FROM accounting_cashier_events WHERE id='+lit(a['event_id'])+';'))
 assert sorted(aud)==sorted([PLAYER,ADMIN,AGENT]),aud
 assert OWNER not in aud
 # Player withdrawal of another agent's downline request excludes OWNER.
 h=hold('Player cancel');a=decide(h,PLAYER,'release')
 aud=json.loads(sql('SELECT to_jsonb(audience_user_ids) FROM accounting_cashier_events WHERE id='+lit(a['event_id'])+';'))
 assert sorted(aud)==sorted([PLAYER,AGENT]),aud
 assert OWNER not in aud
 assert int(sql('SELECT count(*) FROM notifications WHERE user_id='+lit(OWNER)+';'))==owner_notes_before
 # Escalated club-bank settlement DOES include OWNER.
 h=hold('Escalated bank payout');escalate(h);a=decide(h,CO)
 aud=json.loads(sql('SELECT to_jsonb(audience_user_ids) FROM accounting_cashier_events WHERE id='+lit(a['event_id'])+';'))
 assert OWNER in aud and PLAYER in aud and CO in aud and AGENT in aud,aud
 cases.append('non-escalated other-agent downline cashouts exclude owner; escalated bank settlements retain owner')
 # 2. >4h unfulfilled downline payout notifies OWNER once and only once; <4h stays silent.
 h_fresh=hold('Pending under 4h')
 res_fresh=json.loads(asuser(OWNER,'SELECT fn_notify_overdue_cashouts(4,200);',role='service_role').splitlines()[-1])
 assert res_fresh['notified']==0,res_fresh
 sql("UPDATE cashout_requests SET created_at=clock_timestamp()-interval '5 hours' WHERE id="+lit(h_fresh['cashout_id'])+';')
 res_overdue=json.loads(asuser(OWNER,'SELECT fn_notify_overdue_cashouts(4,200);',role='service_role').splitlines()[-1])
 assert res_overdue['notified']==1,res_overdue
 overdue_row=json.loads(sql("SELECT jsonb_build_object('user_id',user_id,'type',type,'title',title,'message',message,'action_url',action_url) FROM notifications WHERE type='cashout_overdue' AND data->>'cashout_id'="+lit(h_fresh['cashout_id'])+';'))
 assert overdue_row['user_id']==OWNER and 'Unfulfilled Payout' in overdue_row['title'] and f'/hub/messenger?clubId={C}&folder=notice-board'==overdue_row['action_url'],overdue_row
 # Second call is strictly idempotent (at-most-once).
 res_again=json.loads(asuser(OWNER,'SELECT fn_notify_overdue_cashouts(4,200);',role='service_role').splitlines()[-1])
 assert res_again['notified']==0,res_again
 # Concurrent >4h overdue scans emit strictly one owner notification for a newly aged request.
 sql('UPDATE cashout_requests SET created_at=updated_at WHERE id='+lit(h_fresh['cashout_id'])+';')
 decide(h_fresh,AGENT,'release')
 h_conc=hold('Concurrent overdue scan')
 sql("UPDATE cashout_requests SET created_at=clock_timestamp()-interval '6 hours' WHERE id="+lit(h_conc['cashout_id'])+';')
 with ThreadPoolExecutor(max_workers=2) as pool:
  conc_results=list(pool.map(lambda _:json.loads(asuser(OWNER,'SELECT fn_notify_overdue_cashouts(4,200);',role='service_role').splitlines()[-1]),range(2)))
 assert sum(r['notified'] for r in conc_results)==1,conc_results
 assert sql("SELECT count(*) FROM cashout_overdue_owner_notifications WHERE cashout_id="+lit(h_conc['cashout_id'])+';')=='1'
 # Direct downline player of OWNER (>5h pending) does NOT trigger duplicate cashout_overdue.
 sql('UPDATE cashout_requests SET created_at=updated_at WHERE id='+lit(h_conc['cashout_id'])+';')
 decide(h_conc,AGENT)
 sql('UPDATE club_members SET agent_id='+lit(OWNER)+' WHERE club_id='+lit(C)+' AND user_id='+lit(PLAYER)+';')
 h_own=hold('Owner direct downline')
 sql("UPDATE cashout_requests SET created_at=clock_timestamp()-interval '6 hours' WHERE id="+lit(h_own['cashout_id'])+';')
 res_own=json.loads(asuser(OWNER,'SELECT fn_notify_overdue_cashouts(4,200);',role='service_role').splitlines()[-1])
 assert res_own['notified']==0,res_own
 sql('UPDATE cashout_requests SET created_at=updated_at WHERE id='+lit(h_own['cashout_id'])+';')
 a_own=decide(h_own,OWNER,'release')
 aud_own=json.loads(sql('SELECT to_jsonb(audience_user_ids) FROM accounting_cashier_events WHERE id='+lit(a_own['event_id'])+';'))
 assert sorted(aud_own)==sorted([PLAYER,OWNER]),aud_own
 sql('UPDATE club_members SET agent_id='+lit(AGENT)+' WHERE club_id='+lit(C)+' AND user_id='+lit(PLAYER)+';')
 # Re-seed an overdue request so Notice Board overduePayouts read is also verified below.
 h_fresh=hold('Pending for Notice Board overdue list')
 sql("UPDATE cashout_requests SET created_at=clock_timestamp()-interval '5 hours' WHERE id="+lit(h_fresh['cashout_id'])+';')
 # Authenticated role cannot invoke fn_notify_overdue_cashouts.
 asuser(AGENT,'SELECT fn_notify_overdue_cashouts(4,200);',error='permission denied')
 cases.append('unfulfilled >4h downline cashout notifies owner exactly once (including concurrent scans) and skips owner direct downline')
 # 3. Telegram-style Notice Board: pin regular club notice, author metadata, roster & roleCounts, overduePayouts, club rename sync.
 pinned_notice=board(OWNER,'create',{'id':op(),'content':'Pinned Club Announcement','status':'notice','is_pinned':True})
 assert pinned_notice['is_pinned'] is True and pinned_notice['author_name'] and pinned_notice['author_role']=='owner',pinned_notice
 owner_read=board(OWNER,'read')
 assert owner_read['memberCount']==6 and owner_read['roleCounts']['management']==3 and owner_read['roleCounts']['agents']==3 and owner_read['roleCounts']['total']==6,owner_read['roleCounts']
 assert len(owner_read['members'])==6 and owner_read['members'][0]['role']=='owner',owner_read['members']
 assert any(p['id']==pinned_notice['id'] for p in owner_read['pinned'])
 assert len(owner_read['overduePayouts'])==1 and owner_read['overduePayouts'][0]['cashout_id']==h_fresh['cashout_id'],owner_read['overduePayouts']
 agent_read=board(AGENT,'read')
 assert agent_read['viewerRole']=='agent' and agent_read['overduePayouts']==[] and agent_read['memberCount']==6
 sql("UPDATE clubs SET name='Renamed Kings Club' WHERE id="+lit(C)+';')
 sql('SELECT fn_sync_club_staff_notice_group('+lit(C)+');')
 assert sql('SELECT sc.group_name FROM club_messenger_staff_notice_groups g JOIN social_conversations sc ON sc.id=g.conversation_id WHERE g.club_id='+lit(C)+';')=='Renamed Kings Club - Notice Board'
 cases.append('Telegram Notice Board pins regular notices, enriches author/roster/roleCounts/overduePayouts, and syncs club renames')

 # Phase 2 migration (20261124180000): read receipts/unread counts, reactions/acks, attachments, @mentions,
 # pagination skip, configurable overdue settings/escalation ladder, and management overdue escalation.
 sql((R/'supabase/migrations/20261124180000_notice_board_phase2_reads_acks_media_mentions_and_overdue_config.sql').read_text())
 # 4. Unread counts, read receipts, and Seen By counts.
 unread_before=json.loads(asuser(OWNER,"SELECT fn_club_notice_unread_counts("+lit(AGENT)+", ARRAY["+lit(C)+"]::uuid[]);",role='service_role').splitlines()[-1])
 assert unread_before[C]>=1,unread_before
 mark_res=board(AGENT,'mark_read',{'lastNoticeId':pinned_notice['id']})
 assert mark_res['markedRead'] is True,mark_res
 unread_after=json.loads(asuser(OWNER,"SELECT fn_club_notice_unread_counts("+lit(AGENT)+", ARRAY["+lit(C)+"]::uuid[]);",role='service_role').splitlines()[-1])
 assert unread_after[C]==0,unread_after
 # Read-only agent can acknowledge & toggle reactions; author + reader increment seen_count.
 ack_entry=board(AGENT,'toggle_reaction',{'id':pinned_notice['id'],'reaction':'ack'})
 assert ack_entry['reactions']['ack']==1 and 'ack' in ack_entry['my_reactions'] and ack_entry['seen_count']>=2 and len(ack_entry['ack_users'])==1,ack_entry
 ack_off=board(AGENT,'toggle_reaction',{'id':pinned_notice['id'],'reaction':'ack'})
 assert ack_off['reactions']['ack']==0 and ack_off['my_reactions']==[],ack_off
 cases.append('Notice Board tracks per-staff unread counts, read receipts (Seen By), and read-only agent acknowledgments/reactions')
 # 5. Attachments (HTTPS only) + @mention notifications + group-name self-heal on write + pagination/metaOnly optimization.
 board(OWNER,'create',{'id':op(),'content':'Bad URL','status':'notice','attachments':[{'url':'javascript:alert(1)'}]},error='Attachment URL Must Use HTTPS')
 agent_mentions_before=int(sql("SELECT count(*) FROM notifications WHERE user_id="+lit(AGENT)+" AND type='notice_board_mention';"))
 sql("UPDATE clubs SET name='Kings Club Live' WHERE id="+lit(C)+';')
 rich=board(OWNER,'create',{
  'id':op(),'content':'@Agent Please Review Receipt','status':'notice','is_pinned':False,
  'attachments':[{'url':'https://example.com/receipt.png','name':'Receipt.png','mime':'image/png'}],
  'mention_user_ids':[AGENT],
 })
 assert len(rich['attachments'])==1 and rich['attachments'][0]['url']=='https://example.com/receipt.png',rich
 assert AGENT in rich['mentions'],rich
 assert int(sql("SELECT count(*) FROM notifications WHERE user_id="+lit(AGENT)+" AND type='notice_board_mention';"))==agent_mentions_before+1
 assert sql('SELECT sc.group_name FROM club_messenger_staff_notice_groups g JOIN social_conversations sc ON sc.id=g.conversation_id WHERE g.club_id='+lit(C)+';')=='Kings Club Live - Notice Board'
 paged=board(OWNER,'read',{'before':rich['created_at'],'beforeId':rich['id']})
 assert paged.get('paginated') is True and 'members' not in paged and 'overduePayouts' not in paged,paged
 meta_only=board(OWNER,'read',{'refreshMeta':True})
 assert meta_only.get('metaOnly') is True and meta_only['memberCount']==6 and 'rows' not in meta_only,meta_only
 cases.append('Notice Board validates HTTPS attachments, notifies @mentioned staff, self-heals group name on write, and optimizes pagination/metaOnly reads')
 # 6. Configurable overdue alert settings, escalation ladder (followup + admin alerts + auto-escalate), and manual management overdue escalation.
 board(AGENT,'update_alert_settings',{'overdue_threshold_hours':2,'notify_admins':True},error='Club Owner Or Co-Owner Required')
 board(ADMIN,'update_alert_settings',{'overdue_threshold_hours':2,'notify_admins':True},error='Club Owner Or Co-Owner Required')
 cfg=board(OWNER,'update_alert_settings',{'overdue_threshold_hours':2,'followup_threshold_hours':6,'notify_admins':True,'auto_escalate_hours':8})
 assert cfg['alertSettings']['overdue_threshold_hours']==2 and cfg['alertSettings']['followup_threshold_hours']==6 and cfg['alertSettings']['notify_admins'] is True and cfg['alertSettings']['auto_escalate_hours']==8,cfg
 # Fresh (<2h) request CANNOT be escalated by OWNER (still assigned cashier only).
 sql('UPDATE cashout_requests SET created_at=updated_at WHERE id='+lit(h_fresh['cashout_id'])+';')
 decide(h_fresh,AGENT,'release')
 h_mgmt=hold('Fresh request cannot be escalated by owner')
 rpc(OWNER,'fn_cashout_escalate_v2',[lit(h_mgmt['cashout_id']),lit(C),lit(OWNER),lit(op())],error='Assigned Active Cashier Required')
 # Simulate a real 3h-old hold with cryptographically consistent timestamps across its hold receipt chain.
 sql("""
  BEGIN;
  SET LOCAL session_replication_role = 'replica';
  DO $$ DECLARE v_ts timestamptz := clock_timestamp() - interval '3 hours'; v_cid uuid := """ + lit(h_mgmt['cashout_id']) + """::uuid; v_ev public.accounting_cashier_events%ROWTYPE; v_payload jsonb; v_inv public.settlement_invoices%ROWTYPE; v_body text; BEGIN
   UPDATE public.cashout_requests SET created_at = v_ts, updated_at = v_ts WHERE id = v_cid;
   UPDATE public.chip_escrow SET locked_at = v_ts WHERE cashout_request_id = v_cid;
   UPDATE public.accounting_cashier_events SET occurred_at = v_ts WHERE cashout_id = v_cid AND event_slot = 'hold' RETURNING * INTO v_ev;
   UPDATE public.chip_ledger SET created_at = v_ts WHERE id = v_ev.source_ledger_id;
   UPDATE public.chip_transactions SET created_at = v_ts WHERE id = v_ev.source_transaction_id;
   v_payload := public.fn_cashier_event_payload(v_ev);
   UPDATE public.settlement_invoices SET breakdown = jsonb_set(breakdown, '{cashier}', v_payload) WHERE id = v_ev.invoice_id RETURNING * INTO v_inv;
   v_body := public.fn_cashier_document_body(v_ev.id, v_inv.invoice_number);
   UPDATE public.social_messages m SET content = v_body, media_metadata = jsonb_set(media_metadata, '{cashier}', v_payload) FROM public.accounting_invoice_deliveries d WHERE d.invoice_id = v_ev.invoice_id AND m.id = d.message_id;
   UPDATE public.notifications n SET data = jsonb_set(data, '{cashier}', v_payload), metadata = jsonb_set(metadata, '{cashier}', v_payload) FROM public.accounting_invoice_deliveries d WHERE d.invoice_id = v_ev.invoice_id AND n.id = d.notification_id;
  END $$;
  COMMIT;
 """)
 esc_mgmt=rpc(OWNER,'fn_cashout_escalate_v2',[lit(h_mgmt['cashout_id']),lit(C),lit(OWNER),lit(op())])
 assert esc_mgmt['is_escalated'] is True,esc_mgmt
 decide(h_mgmt,OWNER)
 # Escalation ladder: 3h notifies owner+co-owner+admin (initial), 7h sends followup once, 9h auto-escalates to Club Bank.
 h_lad=hold('Escalation ladder cashout')
 sql("UPDATE cashout_requests SET created_at=clock_timestamp()-interval '3 hours' WHERE id="+lit(h_lad['cashout_id'])+';')
 lad1=json.loads(asuser(OWNER,'SELECT fn_notify_overdue_cashouts(4,200);',role='service_role').splitlines()[-1])
 assert lad1['notified']==3 and lad1['followups']==0 and lad1['auto_escalated']==0,lad1
 lad1_dup=json.loads(asuser(OWNER,'SELECT fn_notify_overdue_cashouts(4,200);',role='service_role').splitlines()[-1])
 assert lad1_dup['notified']==0,lad1_dup
 sql("UPDATE cashout_requests SET created_at=clock_timestamp()-interval '7 hours' WHERE id="+lit(h_lad['cashout_id'])+';')
 lad2=json.loads(asuser(OWNER,'SELECT fn_notify_overdue_cashouts(4,200);',role='service_role').splitlines()[-1])
 assert lad2['followups']==3 and lad2['auto_escalated']==0,lad2
 sql("UPDATE cashout_requests SET created_at=clock_timestamp()-interval '9 hours' WHERE id="+lit(h_lad['cashout_id'])+';')
 lad3=json.loads(asuser(OWNER,'SELECT fn_notify_overdue_cashouts(4,200);',role='service_role').splitlines()[-1])
 assert lad3['auto_escalated']==1,lad3
 assert sql('SELECT count(*) FROM club_cashout_escalations WHERE cashout_id='+lit(h_lad['cashout_id'])+';')=='1'
 cases.append('configurable overdue alert ladder (threshold, admin backup, follow-up, auto-escalate) and overdue-only management escalation enforced')

 # Phase 3 hardening migration (20261124190000): canonical lock-order receipt-verified auto-escalation,
 # fn_notice_cashout_card overdue can_escalate parity, realtime reactions RLS, and create-replay attachment check.
 sql((R/'supabase/migrations/20261124190000_notice_board_hardening_auto_escalate_realtime_and_parity.sql').read_text())
 # 7. Create-replay attachment check & reactions staff-scoped RLS.
 dup_id=op()
 att_a=[{'url':'https://example.com/a.png','name':'A.png','mime':'image/png'}]
 att_b=[{'url':'https://example.com/b.png','name':'B.png','mime':'image/png'}]
 r1=board(OWNER,'create',{'id':dup_id,'content':'Replay Attachment Test','status':'notice','is_pinned':False,'attachments':att_a})
 r2=board(OWNER,'create',{'id':dup_id,'content':'Replay Attachment Test','status':'notice','is_pinned':False,'attachments':att_a})
 assert r1['id']==r2['id']
 board(OWNER,'create',{'id':dup_id,'content':'Replay Attachment Test','status':'notice','is_pinned':False,'attachments':att_b},error='Entry Already Exists')
 board(AGENT,'toggle_reaction',{'id':dup_id,'reaction':'ack'})
 assert int(asuser(AGENT,'SELECT count(*) FROM club_notice_board_reactions WHERE notice_id='+lit(dup_id)+';').splitlines()[-1])==1
 assert int(asuser(PLAYER,'SELECT count(*) FROM club_notice_board_reactions WHERE notice_id='+lit(dup_id)+';').splitlines()[-1])==0
 # 8. fn_notice_cashout_card.can_escalate parity + receipt-verified auto-escalation without orphans.
 sql('UPDATE cashout_requests SET created_at=updated_at WHERE id='+lit(h_lad['cashout_id'])+';')
 decide(h_lad,OWNER,'release')
 h_p3=hold('Hardening parity and auto-escalate')
 assert rpc(OWNER,'fn_cashout_request_card',[lit(h_p3['cashout_id'])])['can_escalate'] is False
 assert rpc(AGENT,'fn_cashout_request_card',[lit(h_p3['cashout_id'])])['can_escalate'] is True
 # Broken receipt timestamp must NOT auto-escalate or leave an orphan club_notice_board row.
 sql("UPDATE cashout_requests SET created_at=clock_timestamp()-interval '9 hours' WHERE id="+lit(h_p3['cashout_id'])+';')
 broken_res=json.loads(asuser(OWNER,'SELECT fn_notify_overdue_cashouts(4,200);',role='service_role').splitlines()[-1])
 assert broken_res['auto_escalated']==0,broken_res
 assert sql('SELECT count(*) FROM club_notice_board WHERE cashout_id='+lit(h_p3['cashout_id'])+';')=='0'
 # Align full hold receipt chain to 9 hours ago -> OWNER sees can_escalate=True AND auto-escalate succeeds cleanly & settles to Club Bank.
 sql("""
  BEGIN;
  SET LOCAL session_replication_role = 'replica';
  DO $$ DECLARE v_ts timestamptz := clock_timestamp() - interval '9 hours'; v_cid uuid := """ + lit(h_p3['cashout_id']) + """::uuid; v_ev public.accounting_cashier_events%ROWTYPE; v_payload jsonb; v_inv public.settlement_invoices%ROWTYPE; v_body text; BEGIN
   UPDATE public.cashout_requests SET created_at = v_ts, updated_at = v_ts WHERE id = v_cid;
   UPDATE public.chip_escrow SET locked_at = v_ts WHERE cashout_request_id = v_cid;
   UPDATE public.accounting_cashier_events SET occurred_at = v_ts WHERE cashout_id = v_cid AND event_slot = 'hold' RETURNING * INTO v_ev;
   UPDATE public.chip_ledger SET created_at = v_ts WHERE id = v_ev.source_ledger_id;
   UPDATE public.chip_transactions SET created_at = v_ts WHERE id = v_ev.source_transaction_id;
   v_payload := public.fn_cashier_event_payload(v_ev);
   UPDATE public.settlement_invoices SET breakdown = jsonb_set(breakdown, '{cashier}', v_payload) WHERE id = v_ev.invoice_id RETURNING * INTO v_inv;
   v_body := public.fn_cashier_document_body(v_ev.id, v_inv.invoice_number);
   UPDATE public.social_messages m SET content = v_body, media_metadata = jsonb_set(media_metadata, '{cashier}', v_payload) FROM public.accounting_invoice_deliveries d WHERE d.invoice_id = v_ev.invoice_id AND m.id = d.message_id;
   UPDATE public.notifications n SET data = jsonb_set(data, '{cashier}', v_payload), metadata = jsonb_set(metadata, '{cashier}', v_payload) FROM public.accounting_invoice_deliveries d WHERE d.invoice_id = v_ev.invoice_id AND n.id = d.notification_id;
  END $$;
  COMMIT;
 """)
 assert rpc(OWNER,'fn_cashout_request_card',[lit(h_p3['cashout_id'])])['can_escalate'] is True
 good_res=json.loads(asuser(OWNER,'SELECT fn_notify_overdue_cashouts(4,200);',role='service_role').splitlines()[-1])
 assert good_res['auto_escalated']==1,good_res
 assert sql('SELECT count(*) FROM club_cashout_escalations WHERE cashout_id='+lit(h_p3['cashout_id'])+';')=='1'
 decide(h_p3,OWNER)
 cases.append('hardening pass enforces receipt-verified orphan-free auto-escalation, card can_escalate parity, reactions RLS, and attachment create-replay')
 print(json.dumps({'passed':True,'cases':cases,'migrations':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(list((R/'supabase/migrations').glob('20261117203*.sql'))+list((R/'supabase/migrations').glob('20261124*.sql')))},'scope':'Actual transition, ledger triggers, receipt/invoice validation; isolated invoice transport fixture; no production writes'}))
finally:
 if started:cmd('pg_ctl','-D',str(D/'data'),'-m','immediate','stop')
 import shutil;shutil.rmtree(D)
