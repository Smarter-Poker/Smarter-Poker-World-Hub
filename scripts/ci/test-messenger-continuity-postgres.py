#!/usr/bin/env python3
"""Exercise the installed continuity migration in a disposable PostgreSQL 17 cluster."""
import argparse
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', type=Path, default=ROOT / 'artifacts/messenger-continuity-postgres')
out = parser.parse_args().output.resolve()
out.mkdir(parents=True, exist_ok=False)
pg = Path(os.environ.get('PG_BIN', '/opt/homebrew/opt/postgresql@17/bin'))
env = {k: v for k, v in os.environ.items() if not k.startswith('PG')}
cluster = Path(tempfile.mkdtemp(prefix='messenger-continuity-'))
socket = cluster / 'socket'
socket.mkdir(mode=0o700)
results = {'passed': False, 'cases': []}
cmd = [str(pg / 'psql'), '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', str(socket), '-p', '55487', '-U', 'postgres', '-d', 'postgres']
def command(args, sql=None):
    return subprocess.run([str(a) for a in args], input=sql, text=True, capture_output=True, env=env, timeout=45)
def run(name, sql, expected=None, failure=None):
    r = command(cmd, sql)
    (out / (name + '.log')).write_text(r.stdout + r.stderr)
    ok = (r.returncode != 0 and failure in r.stderr) if failure else (r.returncode == 0 and (expected is None or r.stdout.strip() == expected))
    results['cases'].append({'name': name, 'passed': ok})
    if not ok: raise RuntimeError(name + ': ' + r.stdout[-1000:] + r.stderr[-2000:])
uid = lambda n: f'00000000-0000-4000-8000-{n:012d}'
u, peer, outsider, c, c2, club, page, invoice = [uid(n) for n in range(1,9)]
mid = lambda n: uid(100+n)
def write(field, value, revision=0, actor=u, conv=c):
    payload = json.dumps(value).replace("'", "''")
    return f"SELECT fn_messenger_continuity_write('{actor}','{conv}','{field}',{revision},'{payload}')"
def window(mode='latest', anchor=None, at=None, atid=None, limit=5, actor=u, conv=c):
    q = lambda x: "NULL" if x is None else "'"+x+"'"
    return f"SELECT fn_messenger_continuity_window('{actor}','{conv}','{mode}',{q(anchor)},{q(at)},{q(atid)},{limit})"
def read(actor=u, conv=c):
    return f"SELECT fn_messenger_continuity_read('{actor}',ARRAY['{conv}'::uuid])"
try:
    if not re.search(r'PostgreSQL\) 17\.', command([pg / 'postgres', '--version']).stdout): raise RuntimeError('PostgreSQL 17 is required')
    r = command([pg / 'initdb', '-D', cluster / 'data', '-U', 'postgres', '--auth-local=trust', '--auth-host=reject', '--no-locale', '--encoding=UTF8'])
    if r.returncode: raise RuntimeError(r.stderr)
    with (cluster / 'data/postgresql.conf').open('a') as f:
        f.write("\nlisten_addresses=''\nunix_socket_directories='"+str(socket)+"'\nunix_socket_permissions=0700\nport=55487\nshared_buffers='16MB'\n")
    r = command([pg / 'pg_ctl', '-D', cluster / 'data', '-l', cluster / 'server.log', '-w', 'start'])
    if r.returncode: raise RuntimeError(r.stderr)
    run('fixture', f"""
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA extensions;
CREATE TABLE profiles(id uuid PRIMARY KEY);
CREATE TABLE social_conversations(id uuid PRIMARY KEY,is_request boolean DEFAULT false,request_sender_id uuid);
CREATE TABLE social_conversation_participants(conversation_id uuid,user_id uuid,context_entity_id uuid,last_read_at timestamptz,UNIQUE(conversation_id,user_id));
CREATE TABLE social_messages(id uuid PRIMARY KEY,conversation_id uuid,sender_id uuid,content text,created_at timestamptz,is_deleted boolean DEFAULT false,visible boolean DEFAULT true,legacy boolean DEFAULT false);
CREATE TABLE social_pages(id uuid,linked_entity_id uuid,linked_entity_type text);
CREATE TABLE club_members(user_id uuid,club_id uuid,is_active boolean,membership_lifecycle_status text,status text);
CREATE TABLE accounting_conversations(conversation_id uuid,scope_id uuid,recipient_id uuid,sender_id uuid,last_discussion_at timestamptz,recipient_visible boolean);
CREATE TABLE accounting_invoice_deliveries(message_id uuid,delivery_mode text);
CREATE INDEX fixture_messages_conversation ON social_messages(conversation_id,created_at DESC);
CREATE INDEX fixture_delivery_message ON accounting_invoice_deliveries(message_id);
CREATE FUNCTION fn_messenger_message_visible_to(uuid,uuid) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT visible FROM social_messages WHERE id=$1$$;
CREATE FUNCTION fn_accounting_correction_legacy_identity(uuid,uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT CASE WHEN legacy THEN '{{"invoice_identity_verified":true}}'::jsonb ELSE NULL END FROM social_messages WHERE id=$1$$;
CREATE FUNCTION fn_messenger_private_accounting_threads(uuid,uuid[]) RETURNS TABLE(conversation_id uuid,recipient_visible boolean) LANGUAGE sql STABLE AS $$SELECT conversation_id,recipient_visible FROM accounting_conversations WHERE conversation_id=ANY($2)$$;
CREATE FUNCTION fn_messenger_private_message_page(uuid,uuid,timestamptz,uuid,integer) RETURNS TABLE(id uuid,conversation_id uuid,sender_id uuid,content text,created_at timestamptz) LANGUAGE sql STABLE AS $$
 SELECT m.id,m.conversation_id,m.sender_id,CASE WHEN legacy THEN 'Verified unavailable receipt' ELSE content END,m.created_at FROM social_messages m
 LEFT JOIN accounting_invoice_deliveries d ON d.message_id=m.id
 WHERE m.conversation_id=$2 AND NOT coalesce(m.is_deleted,false) AND coalesce(d.delivery_mode,'immediate')<>'weekly_detail'
 AND (fn_messenger_message_visible_to(m.id,$1) OR fn_accounting_correction_legacy_identity(m.id,$1) IS NOT NULL)
 AND ($3 IS NULL OR m.created_at<$3 OR ($4 IS NOT NULL AND m.created_at=$3 AND m.id<$4)) ORDER BY m.created_at DESC,m.id DESC LIMIT $5 $$;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
INSERT INTO profiles VALUES('{u}'),('{peer}'),('{outsider}');
INSERT INTO social_conversations(id) VALUES('{c}'),('{c2}'),('{invoice}');
INSERT INTO social_conversation_participants VALUES('{c}','{u}',NULL,'2026-09-01 00:00:02Z'),('{c}','{peer}',NULL,NULL),('{c2}','{u}','{page}',NULL),('{invoice}','{u}','{page}',NULL);
INSERT INTO social_pages VALUES('{page}','{club}','club');
INSERT INTO club_members VALUES('{u}','{club}',true,'active','active');
INSERT INTO accounting_conversations VALUES('{invoice}','{club}','{u}','{peer}',NULL,true);
""")
    for n in range(1,13):
        run('message-'+str(n), f"INSERT INTO social_messages VALUES('{mid(n)}','{c}','{peer}','Message {n}','2026-09-01 00:00:{n:02d}Z',false,true,false);")
    run('install', (ROOT / 'supabase/migrations/20260927163000_messenger_account_continuity.sql').read_text())
    run('anonymous-denied', 'SET ROLE anon; '+read()+';', failure='permission denied')
    run('authenticated-denied', 'SET ROLE authenticated; '+write('pin',True)+';', failure='permission denied')
    run('table-private', 'SET ROLE authenticated; SELECT * FROM messenger_conversation_state;', failure='permission denied')
    run('default-state', read()+f"->'states'->'{c}'->'draft'->>'revision';", '0')
    run('save-draft', 'SET ROLE service_role; '+write('draft',{'text':'A draft','replyToId':None})+"->>'revision';", '1')
    run('same-value-retry', write('draft',{'text':'A draft','replyToId':None})+"->>'revision';", '1')
    run('stale-draft-conflict', write('draft',{'text':'stale','replyToId':None})+"->>'success';", 'false')
    run('independent-pin', write('pin',True)+"->>'revision';", '1')
    run('independent-position', write('position',{'messageId':mid(7),'offset':12})+"->>'revision';", '1')
    run('draft-not-clobbered', read()+f"->'states'->'{c}'->'draft'->>'text';", 'A draft')
    run('unavailable-other-account', write('pin',True,actor=outsider)+';', failure='Conversation Unavailable')
    run('reply-foreign-message-denied', write('draft',{'text':'x','replyToId':uid(999)},1)+';', failure='Message Unavailable')
    run('save-item', write('saved',{'messageId':mid(7),'saved':True})+"->>'revision';", '1')
    run('save-item-repeat', write('saved',{'messageId':mid(7),'saved':True})+"->>'revision';", '1')
    run('unsave-item', write('saved',{'messageId':mid(7),'saved':False},1)+"->>'revision';", '2')
    run('page-retains-saved-tombstone', "SELECT (item->>'revision')='2' AND (item->>'saved')='false' FROM jsonb_array_elements(("+window('anchor',mid(7),limit=1)+")->'savedItems') item;", 't')
    run('stale-save-no-resurrection', write('saved',{'messageId':mid(7),'saved':True},1)+"->>'success';", 'false')
    run('unsave-wrong-conversation', write('saved',{'messageId':mid(7),'saved':False},2,conv=c2)+';', failure='Saved Message Unavailable')
    run('unsave-other-account', write('saved',{'messageId':mid(7),'saved':False},2,actor=outsider)+';', failure='Saved Message Unavailable')
    run('latest-window', window()+"->'messages'->0->>'id';", mid(12))
    run('first-unread-beyond-latest-page', window('firstUnread')+"->>'anchorMessageId';", mid(3))
    run('anchor-centered', window('anchor',mid(7))+"->'messages';")
    run('anchor-centered-exact', "SELECT string_agg(m->>'id',',') FROM jsonb_array_elements(("+window('anchor',mid(7))+")->'messages') m;", ','.join(mid(n) for n in range(9,4,-1)))
    run('first-unread-watermark-unchanged', f"SELECT last_read_at='2026-09-01 00:00:02Z' FROM social_conversation_participants WHERE user_id='{u}' AND conversation_id='{c}';", 't')
    run('after-contiguous', "SELECT string_agg(m->>'id',',') FROM jsonb_array_elements(("+window('after',at='2026-09-01T00:00:09Z',atid=mid(9))+")->'messages') m;", ','.join(mid(n) for n in range(12,9,-1)))
    run('empty-after-has-older', window('after',at='2026-09-01T00:00:12Z',atid=mid(12))+"->>'hasOlder';", 'true')
    run('before-contiguous', "SELECT string_agg(m->>'id',',') FROM jsonb_array_elements(("+window('before',at='2026-09-01T00:00:05Z',atid=mid(5))+")->'messages') m;", ','.join(mid(n) for n in range(4,0,-1)))
    run('limit-one-anchor', window('anchor',mid(7),limit=1)+"->'messages'->0->>'id';", mid(7))
    run('missing-anchor-fallback', window('anchor',uid(999))+"->>'anchorUnavailable';", 'true')
    run('hide-first-unread', f"UPDATE social_messages SET visible=false WHERE id='{mid(3)}'; INSERT INTO accounting_invoice_deliveries VALUES('{mid(4)}','weekly_detail');")
    run('first-unread-filters-private', window('firstUnread')+"->>'firstUnreadMessageId';", mid(5))
    run('private-hydration-preserved', f"UPDATE social_messages SET visible=false,legacy=true WHERE id='{mid(6)}';"+window('anchor',mid(6),limit=1)+"->'messages'->0->>'content';", 'Verified unavailable receipt')
    run('tie-fixture', f"UPDATE social_messages SET created_at='2026-09-01 00:00:08.123456Z' WHERE id IN('{mid(8)}','{mid(9)}','{mid(10)}');")
    run('tie-anchor', window('anchor',mid(9),limit=1)+"->'messages'->0->>'id';", mid(9))
    run('tie-after', window('after',at='2026-09-01T00:00:08.123456Z',atid=mid(8),limit=1)+"->'messages'->0->>'id';", mid(9))
    run('tie-before', window('before',at='2026-09-01T00:00:08.123456Z',atid=mid(10),limit=1)+"->'messages'->0->>'id';", mid(9))
    run('revoked-membership-denies', f"UPDATE club_members SET is_active=false;"+write('pin',True,conv=c2)+';', failure='Conversation Unavailable')
    run('revoked-navigation-denies', window(conv=c2)+';', failure='Conversation Unavailable')
    run('revoked-read-omits', read(conv=c2)+"->>'states';", '{}')
    run('restore-membership', 'UPDATE club_members SET is_active=true;')
    run('private-recipient-revoked', 'UPDATE accounting_conversations SET recipient_visible=false;'+write('pin',True,conv=invoice)+';', failure='Conversation Unavailable')
    run('issuer-discussion-visible', f"UPDATE accounting_conversations SET recipient_id='{peer}',sender_id='{u}',last_discussion_at=now();"+write('pin',True,conv=invoice)+"->>'success';", 'true')
    # Concurrent writers with one base revision must produce one winning value.
    workers = [subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env) for _ in range(8)]
    for i, worker in enumerate(workers):
        worker.stdin.write(write('draft',{'text':f'Contender {i}','replyToId':None},1)+";"); worker.stdin.close()
    receipts = []
    for worker in workers:
        worker.wait(timeout=20)
        if worker.returncode: raise RuntimeError(worker.stderr.read())
        receipts.append(json.loads(worker.stdout.read()))
    if sum(r['success'] for r in receipts)!=1 or len({r['value']['text'] for r in receipts})!=1: raise RuntimeError('CAS concurrency failed')
    results['cases'].append({'name':'eight-concurrent-draft-writers-one-winner','passed':True})
    (out / 'concurrency.json').write_text(json.dumps(receipts))
    run('no-stale-send-clear', write('draft',{'text':'','replyToId':None},1)+"->>'success';", 'false')
    run('rollback-write', 'BEGIN; '+write('pin',False,1)+"->>'revision'; ROLLBACK; "+read()+f"->'states'->'{c}'->'pin'->>'value';", '2\ntrue')
    run('resave-before-delete', write('saved',{'messageId':mid(7),'saved':True},2)+"->>'revision';", '3')
    run('deleted-reference-hidden', f"DELETE FROM social_messages WHERE id='{mid(7)}';"+read()+"->>'saved';", '[]')
    run('deleted-unsave-after-membership-loss', f"DELETE FROM social_conversation_participants WHERE user_id='{u}' AND conversation_id='{c}';"+write('saved',{'messageId':mid(7),'saved':False},3)+"->>'revision';", '4')
    run('deleted-unsave-duplicate', write('saved',{'messageId':mid(7),'saved':False},3)+"->>'revision';", '4')
    run('participant-revocation-denies-state', write('draft',{'text':'blocked','replyToId':None},2)+';', failure='Conversation Unavailable')
    run('conversation-cascade-cleans', f"DELETE FROM social_conversations WHERE id='{c}'; SELECT (SELECT count(*) FROM messenger_conversation_state WHERE conversation_id='{c}')+(SELECT count(*) FROM messenger_saved_messages WHERE conversation_id='{c}');", '0')
    longc=uid(10)
    run('long-history-fixture', f"""
INSERT INTO social_conversations(id) VALUES('{longc}');
INSERT INTO social_conversation_participants VALUES('{longc}','{u}',NULL,NULL);
INSERT INTO social_messages(id,conversation_id,sender_id,content,created_at)
 SELECT ('00000000-0000-4000-8000-'||lpad((10000+n)::text,12,'0'))::uuid,'{longc}','{peer}','Long fixture','2026-09-01'::timestamptz+n*interval '1 second' FROM generate_series(1,1200)n;
ANALYZE social_messages; ANALYZE accounting_invoice_deliveries;
""")
    plan=command(cmd,f"EXPLAIN (ANALYZE,FORMAT JSON) SELECT * FROM fn_messenger_continuity_visible('{u}','{longc}') WHERE id='{uid(10600)}' LIMIT 1;")
    (out/'long-history-anchor-plan.json').write_text(plan.stdout)
    if plan.returncode or 'Function Scan' in plan.stdout or 'social_messages_pkey' not in plan.stdout: raise RuntimeError('Visible helper did not inline to indexed anchor lookup: '+plan.stdout+plan.stderr)
    results['cases'].append({'name':'1200-row-anchor-predicate-pushdown-index','passed':True})
    run('long-history-window', window('anchor',uid(10600),limit=50,conv=longc)+"->'messages'->0->>'id';", uid(10624))
    run('long-history-first-unread', window('firstUnread',limit=50,conv=longc)+"->>'firstUnreadMessageId';", uid(10001))
    results['passed']=True
finally:
    if (cluster/'data/postmaster.pid').exists():
        stopped=command([pg/'pg_ctl','-D',cluster/'data','-m','fast','-w','stop'])
        if stopped.returncode: raise RuntimeError('Owned cluster did not stop')
    if (cluster/'server.log').exists(): shutil.copyfile(cluster/'server.log',out/'server.log')
    shutil.rmtree(cluster)
    (out/'RESULTS.json').write_text(json.dumps(results,indent=2)+'\n')
    print(json.dumps({'passed':results['passed'],'cases':len(results['cases']),'evidence':str(out)}))
