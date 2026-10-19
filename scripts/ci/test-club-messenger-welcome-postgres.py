#!/usr/bin/env python3
"""Real transaction/privilege qualification. Never connects to production."""
import os, json, subprocess, tempfile, shutil, socket
from pathlib import Path
root=Path(__file__).resolve().parents[2]
pg=Path(os.environ.get('PG_BIN','/opt/homebrew/opt/postgresql@17/bin'))
cluster=Path(tempfile.mkdtemp(prefix='club-messenger-'))
with socket.socket() as listener:
 listener.bind(('127.0.0.1',0));port=str(listener.getsockname()[1])
env={k:v for k,v in os.environ.items() if not k.startswith('PG')}
def call(args,sql=None):
 return subprocess.run([str(a) for a in args],input=sql,text=True,capture_output=True,env=env,timeout=60)
cmd=[pg/'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',port,'-U','postgres','-d','postgres']
def sql(value):return call(cmd,value)
def ok(value):
 r=sql(value);assert r.returncode==0,r.stderr;return r.stdout.strip()
def refused(value,reason):
 r=sql(value);assert r.returncode!=0 and reason in r.stderr,r.stderr
try:
 r=call([pg/'initdb','-D',cluster/'data','-U','postgres','--auth-local=trust','--auth-host=trust','--no-locale','--encoding=UTF8']);assert r.returncode==0,r.stderr
 with (cluster/'data/postgresql.conf').open('a') as f:f.write(f"\nlisten_addresses='127.0.0.1'\nunix_socket_directories=''\nport={port}\nshared_buffers='16MB'\n")
 r=call([pg/'pg_ctl','-D',cluster/'data','-l',cluster/'server.log','-w','start']);assert r.returncode==0,r.stderr+(cluster/'server.log').read_text()
 ok((root/'scripts/ci/fixtures/club-messenger-welcome.sql').read_text())
 migration=(root/'supabase/migrations/20261016033645_club_messenger_welcome_and_verified_relationships.sql').read_text()
 ok(migration)
 assert ok('SELECT count(*) FROM club_messenger_admissions;')=='0','Historical member backfill'
 ok((root/'scripts/ci/fixtures/club-messenger-welcome-cases.sql').read_text())
 refused("SET ROLE authenticated; SELECT * FROM club_messenger_welcome_templates;",'permission denied')
 refused("SET ROLE authenticated; SELECT fn_messenger_club_relationships('00000000-0000-4000-8000-000000000001',ARRAY[]::uuid[]);",'permission denied')
 refused("SET ROLE authenticated; SELECT fn_deliver_club_messenger_welcome();",'permission denied')
 refused("SET request.jwt.claim.sub='00000000-0000-4000-8000-000000000007'; SET ROLE authenticated; SELECT fn_save_club_welcome_message('00000000-0000-4000-8000-000000000100','Forged',true,0,gen_random_uuid());",'Active Club Staff')
 refused("SET request.jwt.claim.sub='00000000-0000-4000-8000-000000000002'; SET ROLE authenticated; SELECT fn_save_club_welcome_message('00000000-0000-4000-8000-000000000100','Stale',true,0,gen_random_uuid());",'Changed In Another Window')
 refused(migration,'already installed')
 ok("CREATE TABLE ca_declared_money_triggers(table_name text,trigger_name text,note text,PRIMARY KEY(table_name,trigger_name)); ALTER TABLE social_conversations ADD COLUMN group_name text; ALTER TABLE social_messages ADD COLUMN is_deleted boolean DEFAULT false;")
 sequence=(root/'supabase/migrations/20261019161708_club_messenger_welcome_sequence_and_staff_notice_groups.sql').read_text()
 ok(sequence)
 ok((root/'scripts/ci/fixtures/club-messenger-welcome-sequence-cases.sql').read_text())
 refused("SET ROLE authenticated; SELECT fn_dispatch_club_owner_welcomes(1);",'permission denied')
 refused("SET ROLE authenticated; SELECT * FROM club_messenger_owner_followups;",'permission denied')
 refused(sequence,'already installed')
 print(json.dumps({'passed':True,'cases':['no-historical-blast','five-role-settings','own-template-cas-and-replay','final-assignment-at-commit','pending-sends-nothing','owner-fallback','duplicate-update-no-resend','assignment-introduction','rejoin-new-admission','disabled-no-retroactive-send','rollback-no-message','blocked-no-bypass','authoritative-upline-labels','cross-club-isolation','direct-table-and-private-rpc-denied','player-cannot-configure','replay-refused','two-owner-slots','owner-slot-owner-only','first-agent-then-ten-minute-owner','early-dispatch-refused','delayed-send-exact-once','delayed-block-respected','five-promotion-roles-enrolled','demotion-removes-access','player-cannot-forge-participant','no-persisted-sequence-fixture']}))
finally:
 if (cluster/'data/postmaster.pid').exists():
  r=call([pg/'pg_ctl','-D',cluster/'data','-m','fast','-w','stop']);assert r.returncode==0,r.stderr
 shutil.rmtree(cluster)
