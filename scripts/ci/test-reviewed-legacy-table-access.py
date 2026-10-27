#!/usr/bin/env python3
"""Native qualification of the reviewed grant matrix; never uses a remote database.

Fixtures isolate table ACLs and representative RLS predicates. They do not
recreate all historical schemas, extensions, triggers or business policies."""
import json, os, shutil, subprocess, tempfile, sys
from pathlib import Path
root = Path(__file__).resolve().parents[2]
pg = Path(os.environ.get('PG_BIN', '/opt/homebrew/opt/postgresql@17/bin'))
if not (pg / 'initdb').is_file():
    raise SystemExit('PG_BIN must name a PostgreSQL installation with initdb and pg_ctl')
scratch = root.parent if str(root).startswith('/Volumes/SmarterWork/agent-work/') else None
if sys.platform == 'darwin' and scratch is None:
    raise SystemExit('Run this qualification from an owned external-SSD worktree')
cluster = Path(tempfile.mkdtemp(prefix='lg-', dir=scratch))
env = {k: v for k, v in os.environ.items() if not k.startswith('PG')}
cmd = [pg/'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', cluster/'socket', '-p', '55442', '-U', 'postgres', '-d', 'postgres']
def run(args, value=None):
    return subprocess.run(list(map(str, args)), input=value, text=True, capture_output=True, timeout=60, env=env)
def sql(value):
    result = run(cmd, value)
    assert result.returncode == 0, result.stderr
    return result.stdout.strip()
def denied(value, expected='permission denied'):
    result = run(cmd, value)
    assert result.returncode != 0 and expected in result.stderr, result.stderr

# Saved direct ACL snapshot is transition evidence only, never desired grants.
LIVE_ACL_SNAPSHOT = {'anti_farming_ips': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'arena_sessions': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'bankroll_assistant_memory': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'bankroll_sessions': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'bus_event_log': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'club_announcements': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'club_challenges': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'club_chat': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'commander_home_game_tables': '{postgres=arwdDxtm/postgres,anon=arwdm/postgres,authenticated=arwdm/postgres,service_role=arwdDxtm/postgres}', 'credit_requests': '{postgres=arwdDxtm/postgres,anon=arxm/postgres,authenticated=arxm/postgres,service_role=arxm/postgres}', 'crew_members': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'crews': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'cron_health_log': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'engine_maintenance_thaws': '{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres}', 'friend_challenges': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'home_game_vouches': '{postgres=arwdDxtm/postgres,anon=arwdm/postgres,authenticated=arwdm/postgres,service_role=arwdDxtm/postgres}', 'live_ban_audit': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'live_comments': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'live_gifts': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'live_reactions': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'live_sessions': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'messages': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'messenger_admin_messages': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'messenger_bookmarks': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'messenger_call_signals': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'messenger_conversation_labels': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'messenger_conversations': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'messenger_favorites': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'messenger_labels': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'messenger_messages': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'messenger_participants': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'messenger_reactions': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'messenger_reminders': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'messenger_reports': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'messenger_scheduled': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'messenger_templates': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'messenger_themes': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'notification_preferences': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'notifications': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'pb_calibration_profiles': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'pb_hands': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'pb_sessions': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'player_notes': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'poker_seat_preferences': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'poker_session_stats': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'poker_sessions': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'poker_table_layouts': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'promotion_claims': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'referral_codes': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'referrals': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'scraper_runs': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'session_chat_messages': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'session_history': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'social_follows': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'social_page_comment_likes': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'table_chat': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'table_templates': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'throw_usage': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'tour_stop_events': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'tournament_deal_votes': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'tournament_registration_approvals': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'training_custom_drills': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'training_events': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'training_hand_history': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'training_user_achievements': '{postgres=arwdDxtm/postgres,anon=rxtm/postgres,authenticated=rxtm/postgres,service_role=arwdDxtm/postgres}', 'trips': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'union_applications': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'union_clubs': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'union_leave_requests': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'unions': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'user_blocks': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'user_feedback': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'user_leaks': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'user_reports': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'user_table_settings': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'user_venue_checkins': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'venue_daily_tournaments': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'venue_game_alerts': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'venue_reviews': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'video_playlist_items': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'video_playlists': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'w2g_forms': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}', 'wallets': '{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}'}

import re
manifest=json.loads((root/'scripts/ci/reviewed-legacy-table-access.json').read_text())
tables=[x for x in manifest['tables'] if x['rights']]
migration=(root/'supabase/migrations/20261020170027_explicit_reviewed_legacy_caller_access.sql').read_text()
# The independently reviewed source manifest bounds every static GRANT.
actual={}
for privileges,table,role in re.findall(r'GRANT ([A-Z, ]+) ON TABLE public\.([a-z_0-9]+) TO ([a-z_]+);',migration):
    actual.setdefault(table,{})[role]=sorted(v.strip() for v in privileges.split(','))
assert actual == {x['table']:x['rights'] for x in tables},'Migration grants differ from reviewed source decisions'
assert re.findall(r'GRANT ([A-Z, ]+) ON SEQUENCE public\.([a-z_0-9]+) TO ([a-z_]+);',migration) == [('USAGE','scraper_runs_id_seq','service_role')]
assert not re.search(r'\b(?:INSERT INTO|UPDATE public|DELETE FROM|ALTER POLICY|DROP POLICY|CREATE POLICY|ALTER DEFAULT|REVOKE)\b',re.sub(r'--[^\n]*','',migration),re.I),'Grant migration must not change data/policies/defaults or revoke rights'
try:
    result=run([pg/'initdb','-D',cluster/'data','-U','postgres','--auth-local=trust','--no-locale','--encoding=UTF8'])
    assert result.returncode == 0,result.stderr
    (cluster/'socket').mkdir()
    with (cluster/'data/postgresql.conf').open('a') as f:
        f.write(f"\nlisten_addresses=''\nunix_socket_directories='{cluster/'socket'}'\nport=55442\nshared_buffers='16MB'\n")
    result=run([pg/'pg_ctl','-D',cluster/'data','-l',cluster/'server.log','-w','start'])
    assert result.returncode == 0,result.stderr
    sql("""CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO anon,authenticated;""")
    for row in tables:
        t=row['table'];idtype='bigserial' if t=='scraper_runs' else 'bigint GENERATED BY DEFAULT AS IDENTITY'
        # Exact row shapes and business triggers are deliberately outside this ACL fixture.
        sql(f"CREATE TABLE public.{t}(id {idtype} PRIMARY KEY,user_id uuid,payload text UNIQUE); ALTER TABLE public.{t} ENABLE ROW LEVEL SECURITY;")
        if any(role in row['rights'] for role in ['anon','authenticated']):
            own="user_id=(SELECT auth.uid())"
            if t=='bus_event_log':own+=' OR user_id IS NULL'
            if t in ['social_follows','messenger_reactions']:
                sql(f"CREATE POLICY fixture_read ON {t} FOR SELECT TO authenticated USING({own}); CREATE POLICY fixture_insert ON {t} FOR INSERT TO authenticated WITH CHECK({own}); CREATE POLICY fixture_delete ON {t} FOR DELETE TO authenticated USING({own});")
            else:
                sql(f"CREATE POLICY fixture_owner ON {t} TO authenticated USING({own}) WITH CHECK({own});")
            if 'anon' in row['rights']:
                if 'SELECT' in row['rights']['anon']:sql(f'CREATE POLICY fixture_public_read ON {t} FOR SELECT TO anon USING(true);')
                if 'INSERT' in row['rights']['anon']:sql(f'CREATE POLICY fixture_null_writer ON {t} FOR INSERT TO anon WITH CHECK(user_id IS NULL);')
        sql(f"INSERT INTO {t}(user_id,payload) VALUES('11111111-1111-1111-1111-111111111111','seed-own'),('22222222-2222-2222-2222-222222222222','seed-other');")
    auth="SET ROLE authenticated; SET request.jwt.claim.sub='11111111-1111-1111-1111-111111111111'; "
    denied(auth+'SELECT * FROM training_custom_drills;','permission denied for table training_custom_drills')
    denied("SET ROLE service_role; INSERT INTO scraper_runs(payload) VALUES('before');",'permission denied for table scraper_runs')
    denied("BEGIN; GRANT INSERT ON scraper_runs TO service_role; SET ROLE service_role; INSERT INTO scraper_runs(payload) VALUES('before');",'permission denied for sequence scraper_runs_id_seq')
    metadata="""SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,
      coalesce((SELECT string_agg(p.polname||p.polcmd::text||coalesce(pg_get_expr(p.polqual,p.polrelid),'')||coalesce(pg_get_expr(p.polwithcheck,p.polrelid),''),'|' ORDER BY p.polname) FROM pg_policy p WHERE p.polrelid=c.oid),''),
      coalesce((SELECT string_agg(a.attname||coalesce(a.attacl::text,''),'|' ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),'')
      FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind='r' ORDER BY c.relname;"""
    before=sql(metadata)
    sql(migration)
    assert before == sql(metadata),'RLS, policies or column ACLs changed'
    allops=['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']
    expected=[]
    for row in tables:
        for role in ['anon','authenticated','service_role']:
            for op in allops:expected.append((row['table'],role,op,op in row['rights'].get(role,[])))
    values=','.join(f"('{t}','{role}','{op}')" for t,role,op,_ in expected)
    observed=sql("SELECT tbl,role_name,op,has_table_privilege(role_name,'public.'||tbl,op) FROM (VALUES "+values+") AS matrix(tbl,role_name,op);").splitlines()
    assert observed == [f"{t}|{role}|{op}|{'t' if allowed else 'f'}" for t,role,op,allowed in expected]
    assert sql(auth+'SELECT count(*) FROM training_custom_drills;')=='1'
    sql(auth+"INSERT INTO training_custom_drills(user_id,payload) VALUES('11111111-1111-1111-1111-111111111111','own-after');")
    denied(auth+"INSERT INTO training_custom_drills(user_id,payload) VALUES('22222222-2222-2222-2222-222222222222','forbidden');",'row-level security')
    denied(auth+"INSERT INTO notifications(user_id,payload) VALUES('11111111-1111-1111-1111-111111111111','forbidden');")
    denied(auth+"INSERT INTO session_chat_messages(user_id,payload) VALUES('11111111-1111-1111-1111-111111111111','forbidden');")
    assert sql(auth+'SELECT count(*) FROM session_chat_messages;')=='1'
    assert sql('SET ROLE anon; SELECT count(*) FROM live_comments;')=='2'
    denied('SET ROLE anon; DELETE FROM live_comments;')
    sql("SET ROLE anon; INSERT INTO bus_event_log(payload) VALUES('anonymous-event');")
    denied('SET ROLE anon; SELECT * FROM bus_event_log;')
    denied(auth+"INSERT INTO video_playlist_items(payload) VALUES('forbidden');")
    assert sql(auth+'SELECT count(*) FROM video_playlist_items;')=='1'
    sql("SET ROLE service_role; INSERT INTO scraper_runs(payload) VALUES('service-after');")
    denied('SET ROLE service_role; DELETE FROM scraper_runs;')
    # UPSERT needs UPDATE privilege before conflict, while its missing UPDATE
    # row policy still denies conflicting updates. No new row authority is added.
    upsert=auth+"INSERT INTO social_follows(user_id,payload) VALUES('11111111-1111-1111-1111-111111111111','first-upsert') ON CONFLICT(payload) DO UPDATE SET user_id=EXCLUDED.user_id;"
    sql(upsert)
    denied(upsert,'row-level security')
    # Reconstruct existing direct ACLs only to prove the migration does not widen
    # the observed live rights. This is not a desired-state/reset grant baseline.
    chars={'r':'SELECT','a':'INSERT','w':'UPDATE','d':'DELETE','D':'TRUNCATE','x':'REFERENCES','t':'TRIGGER','m':'MAINTAIN'}
    for table,acl in LIVE_ACL_SNAPSHOT.items():
        for role,privs in re.findall(r'(?:[,{])(anon|authenticated|service_role)=([^/]+)',acl):
            sql('GRANT '+','.join(chars[c] for c in privs if c in chars)+f' ON {table} TO {role};')
    def aclstate():return sql("SELECT relname,relacl FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind IN ('r','S') ORDER BY 1;")
    before=aclstate();policies=sql(metadata);sql(migration)
    assert before==aclstate() and policies==sql(metadata),'Existing live ACL/RLS fixture changed'
    # The live catalog uses UUID while the original source used bigserial.
    # Admit those exact independent shapes without inventing a sequence live.
    sql('ALTER TABLE scraper_runs DROP COLUMN id; ALTER TABLE scraper_runs ADD COLUMN id uuid DEFAULT gen_random_uuid();')
    before=aclstate();sql(migration)
    assert before==aclstate() and sql("SELECT to_regclass('public.scraper_runs_id_seq') IS NULL;")=='t'
    sql("SET ROLE service_role; INSERT INTO scraper_runs(payload) VALUES('live-uuid-after');")
    sql('ALTER TABLE scraper_runs ALTER COLUMN id DROP DEFAULT;')
    denied(migration,'Expected reviewed UUID or historical bigserial scraper_runs.id')
    sql('ALTER TABLE scraper_runs ALTER COLUMN id SET DEFAULT gen_random_uuid();')
    sql('REVOKE INSERT ON arena_sessions FROM authenticated; ALTER TABLE w2g_forms DISABLE ROW LEVEL SECURITY;')
    denied(migration,'Expected postgres-owned public.w2g_forms base table with RLS')
    assert sql("SELECT has_table_privilege('authenticated','arena_sessions','INSERT');")=='f','Drift refusal was not atomic'
    sql('ALTER TABLE w2g_forms ENABLE ROW LEVEL SECURITY; GRANT SELECT(user_id) ON arena_sessions TO anon;')
    denied(migration,'Column ACL on public.arena_sessions requires a separate per-column review')
    assert sql("SELECT has_table_privilege('authenticated','arena_sessions','INSERT');")=='f'
    print(json.dumps({'passed':True,'tables':len(tables),'roleTablePairs':sum(len(t['rights']) for t in tables),'privilegeBoundaries':len(expected),'cases':['native-no-defaults-before-denials','serial-sequence-independent-before-denial','exact-reviewed-allow-deny-matrix','own-row-read-write-and-other-row-denial','embedded-playlist-child-read-no-direct-insert','session-chat-browser-read-service-write','notification-browser-insert-denied','anonymous-public-read-not-write','null-user-event-insert-no-read','service-serial-insert-no-delete','upsert-privilege-with-row-policy-denial-preserved','all-rls-policies-column-acls-unchanged','existing-live-direct-acls-unchanged','rls-drift-refused-atomically','column-privacy-drift-refused-atomically'],'limitation':'ACL fixtures and representative RLS predicates, not full historical schema restore or complete business-policy certification'}))
finally:
    if (cluster/'data/postmaster.pid').exists():
        result=run([pg/'pg_ctl','-D',cluster/'data','-m','fast','-w','stop'])
        assert result.returncode==0,result.stderr
    shutil.rmtree(cluster)
