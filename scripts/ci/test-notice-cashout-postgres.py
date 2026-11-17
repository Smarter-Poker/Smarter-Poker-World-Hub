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
 print(json.dumps({'passed':True,'cases':cases,'migrations':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in (R/'supabase/migrations').glob('20261117203*.sql')},'scope':'Actual transition, ledger triggers, receipt/invoice validation; isolated invoice transport fixture; no production writes'}))
finally:
 if started:cmd('pg_ctl','-D',str(D/'data'),'-m','immediate','stop')
 import shutil;shutil.rmtree(D)
