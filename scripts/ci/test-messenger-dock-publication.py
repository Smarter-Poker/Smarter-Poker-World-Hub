#!/usr/bin/env python3
"""Qualify only the dock publication change in disposable native PostgreSQL."""
import os, json, subprocess, tempfile, shutil
from pathlib import Path
root=Path(__file__).resolve().parents[2]
pg=Path(os.environ.get('PG_BIN','/opt/homebrew/opt/postgresql@17/bin'))
cluster=Path(tempfile.mkdtemp(prefix='messenger-dock-'))
sock=root/'work'/'dock-pg-socket';sock.mkdir(mode=0o700,parents=True,exist_ok=False)
env={k:v for k,v in os.environ.items() if not k.startswith('PG')}
def call(args,sql=None):
 return subprocess.run([str(a) for a in args],input=sql,text=True,capture_output=True,env=env,timeout=45)
cmd=[pg/'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-h',sock,'-p','55491','-U','postgres','-d','postgres']
def sql(value):return call(cmd,value)
try:
 r=call([pg/'initdb','-D',cluster/'data','-U','postgres','--auth-local=trust','--auth-host=reject','--no-locale','--encoding=UTF8']);assert r.returncode==0,r.stderr
 with (cluster/'data/postgresql.conf').open('a') as f:f.write(f"\nlisten_addresses=''\nunix_socket_directories='{sock}'\nunix_socket_permissions=0700\nport=55491\nwal_level=logical\nshared_buffers='16MB'\n")
 r=call([pg/'pg_ctl','-D',cluster/'data','-l',cluster/'server.log','-w','start']);assert r.returncode==0,r.stderr+(cluster/'server.log').read_text()
 fixture="""CREATE ROLE authenticated; CREATE TABLE public.social_messages(id uuid PRIMARY KEY,content text); ALTER TABLE public.social_messages ENABLE ROW LEVEL SECURITY; CREATE POLICY messenger_private_message_content ON public.social_messages AS RESTRICTIVE FOR SELECT TO authenticated USING(false); CREATE PUBLICATION supabase_realtime;"""
 r=sql(fixture);assert r.returncode==0,r.stderr
 snapshot="SELECT relacl::text,(SELECT md5(string_agg(pg_get_expr(polqual,polrelid),',' ORDER BY polname)) FROM pg_policy WHERE polrelid='public.social_messages'::regclass) FROM pg_class WHERE oid='public.social_messages'::regclass;"
 before=sql(snapshot).stdout
 absent=sql("SELECT count(*) FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='social_messages';");assert absent.stdout.strip()=='0'
 migration=(root/'supabase/migrations/20261015222732_messenger_messages_realtime_dock.sql').read_text()
 r=sql(migration);assert r.returncode==0,r.stderr
 present=sql("SELECT count(*) FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='social_messages';");assert present.stdout.strip()=='1'
 assert sql(snapshot).stdout==before,'ACL or RLS changed'
 r=sql(migration);assert r.returncode!=0 and 'already installed' in r.stderr,'Replay did not refuse'
 assert sql(snapshot).stdout==before
 assert sql("SELECT count(*) FROM social_messages;").stdout.strip()=='0','Migration mutated messages'
 print(json.dumps({'passed':True,'cases':['absent-before','present-after','acl-unchanged','rls-unchanged','replay-refused','no-message-writes']}))
finally:
 if (cluster/'data/postmaster.pid').exists():
  r=call([pg/'pg_ctl','-D',cluster/'data','-m','fast','-w','stop']);assert r.returncode==0,r.stderr
 shutil.rmtree(cluster)
 shutil.rmtree(sock)
