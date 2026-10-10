import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import net from 'node:net';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const migration = join(root, 'supabase/migrations/20261010044700_horse_news_atomic_publisher.sql');
const signature = 'public.publish_horse_news_post(uuid,text,text,text,text,text,text,text,text,text,text,text,jsonb)';
const tool = (name) => [process.env.PG17_BINDIR && join(process.env.PG17_BINDIR,name),
  join('/opt/homebrew/opt/postgresql@17/bin',name),join('/usr/lib/postgresql/17/bin',name)]
  .filter(Boolean).find(existsSync);
const horse = (n) => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const quote = (x) => `'${String(x).replaceAll("'","''")}'`;
function call(n=1, asset='one', caption='Complete truthful headline', options={}) {
  const type=options.type ?? 'poker';
  const brief={kind:'link',domain:type,title:'Complete truthful headline',source:'Publisher',
    people:[],teams:[],concepts:['poker'],amounts:[],tone:'neutral',isQuestion:false,
    confidence:1,builtFrom:['asset_title'],...options.brief};
  const phrase=caption.split('\n')[0].toLowerCase().replace(/https?:\/\/\S+/g,'')
    .replace(/[^a-z0-9\s]/g,'').replace(/\s+/g,' ').trim();
  const values=[horse(n),caption,`https://publisher.example/${asset}?rss=true`,
    'Complete truthful headline',null,'https://cdn.example/story.jpg','Publisher',type,
    `fleet:${horse(n)}:${options.slot ?? '2026-10-10T04'}`,
    options.assetKey ?? `url:publisher.example/${asset}`,options.phrase ?? phrase,
    options.semantic ?? `semantic:${asset}`,JSON.stringify(brief)];
  return `SELECT coalesce(social_post_id::text,'')||'|'||created||'|'||reason FROM public.publish_horse_news_post(${values.map(x=>x===null?'NULL':quote(x)).join(',')});`;
}

test('news transaction remains source-owned and required PG qualification is wired', () => {
  const sql=readFileSync(migration,'utf8');
  assert.match(sql,/SECURITY DEFINER SET search_path = public, extensions/);
  assert.match(sql,/FROM PUBLIC,anon,authenticated/);
  assert.match(sql,/publish-horse-video-author:/);
  assert.doesNotMatch(sql,/cron\.schedule|CASCADE|UPDATE public\.horse_post_modes/);
  assert.match(readFileSync(join(root,'.github/workflows/build-safety-gate.yml'),'utf8'),
    /node --test __tests__\/horse-news-atomic-publisher-postgres\.test\.mjs/);
});

test('PG17 proves atomic horse news, service gates, idempotency and concurrent reuse authority', async(t) => {
  const found=['initdb','pg_ctl','postgres','psql'].map(tool);
  const base=process.env.HORSE_NEWS_POSTGRES_ROOT;
  if(found.some(x=>!x)||!base||!existsSync(base)) {
    if(process.env.CI==='true') throw Error('Required PG17 tools and HORSE_NEWS_POSTGRES_ROOT missing');
    t.skip('isolated PG17 scratch required');return;
  }
  const [initdb,pgCtl,postgres,psql]=found;
  assert.match(execFileSync(postgres,['--version'],{encoding:'utf8'}),/\b17\./);
  const listener=net.createServer();
  await new Promise((ok,fail)=>{listener.once('error',fail);listener.listen(0,'127.0.0.1',ok);});
  const port=listener.address().port;
  await new Promise((ok,fail)=>listener.close(err=>err?fail(err):ok()));
  const scratch=mkdtempSync(join(base,'run-')), data=join(scratch,'data');
  const args=['-h','127.0.0.1','-p',String(port),'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'];
  const query=q=>execFileSync(psql,[...args,'-c',q],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  const publish=q=>query(`SET request.jwt.claim.role='service_role'; ${q}`);
  const concurrent=async(q)=> (await promisify(execFile)(psql,[...args,'-c',`SET request.jwt.claim.role='service_role'; ${q}`],{encoding:'utf8'})).stdout.trim();
  const counts=()=>query(`SELECT jsonb_build_array((SELECT count(*) FROM social_posts),
    (SELECT count(*) FROM content_asset_use),(SELECT count(*) FROM horse_phrase_ledger),
    (SELECT count(*) FROM post_briefs))`);
  const reset=()=>query(`TRUNCATE social_posts,content_asset_use,horse_phrase_ledger,post_briefs;
    UPDATE content_settings SET engine_enabled=true,auto_publish=true;
    UPDATE horse_post_modes SET enabled=true,approved_by='owner',approved_at=now();
    UPDATE profiles SET status='active',horse_status='available';`);
  let started=false;
  try {
    execFileSync(initdb,['-D',data,'-U','postgres','--no-locale','--encoding=UTF8'],{stdio:'ignore'});
    execFileSync(pgCtl,['-D',data,'-l',join(scratch,'postgres.log'),'-o',
      `-F -p ${port} -c listen_addresses=127.0.0.1 -c unix_socket_directories=''`,'-w','start'],{stdio:'ignore'});started=true;
    query(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; CREATE SCHEMA extensions;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
      CREATE TABLE profiles(id uuid PRIMARY KEY,is_horse boolean,status text,horse_status text);
      CREATE TABLE content_authors(profile_id uuid PRIMARY KEY,is_active boolean);
      CREATE TABLE content_settings(engine_enabled boolean,auto_publish boolean);
      CREATE TABLE horse_post_modes(mode text PRIMARY KEY,enabled boolean,approved_at timestamptz,approved_by text);
      INSERT INTO profiles VALUES (${quote(horse(1))},true,'active','available'),(${quote(horse(2))},true,'active','available'),(${quote(horse(3))},false,'active',NULL);
      INSERT INTO content_authors SELECT id,true FROM profiles;
      INSERT INTO content_settings VALUES(true,true);
      INSERT INTO horse_post_modes VALUES('poker_news',true,now(),'owner'),('sports_news',true,now(),'owner');
      CREATE TABLE social_posts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),author_id uuid NOT NULL REFERENCES profiles,
        content text NOT NULL CHECK(length(content)<=2000),content_type text,media_urls jsonb,visibility text,
        audience_mode text,link_url text,link_title text,link_description text,link_image text,link_site_name text,
        topic text,topics text[],origin_type text NOT NULL DEFAULT 'user_upload',metadata jsonb,
        created_at timestamptz DEFAULT now(),is_deleted boolean DEFAULT false);
      CREATE UNIQUE INDEX uq_social_posts_metadata_publication_key ON social_posts((metadata->>'publication_key'))
        WHERE metadata->>'publication_key' IS NOT NULL;
      CREATE TABLE content_asset_use(id bigint GENERATED ALWAYS AS IDENTITY,asset_key text NOT NULL,horse_id uuid NOT NULL,
        post_id uuid REFERENCES social_posts,used_at timestamptz NOT NULL DEFAULT now(),UNIQUE(asset_key,horse_id));
      CREATE TABLE horse_phrase_ledger(id bigint GENERATED ALWAYS AS IDENTITY,phrase_norm text NOT NULL,horse_id uuid NOT NULL,
        post_id uuid REFERENCES social_posts,used_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE post_briefs(post_id uuid PRIMARY KEY REFERENCES social_posts,kind text NOT NULL,domain text NOT NULL,
        sport text,title text,source text,people text[] NOT NULL,teams text[] NOT NULL,concepts text[] NOT NULL,
        amounts text[] NOT NULL,topic text,tone text NOT NULL,is_question boolean NOT NULL,confidence numeric NOT NULL,
        summary text,built_from text[] NOT NULL);`);
    execFileSync(psql,[...args,'-f',migration],{stdio:['ignore','pipe','pipe']});
    for(const role of ['anon','authenticated']) {
      assert.equal(query(`SELECT has_function_privilege('${role}','${signature}','EXECUTE')`),'f');
      assert.throws(()=>query(`SET ROLE ${role}; ${call()}`),/permission denied/);
    }
    assert.throws(()=>query(call()),/requires service role/);
    assert.throws(()=>publish(call(3)),/author inactive/);
    assert.throws(()=>publish(call(1,'one','Headline',{assetKey:'url:wrong.example/one'})),/asset does not match/);
    assert.throws(()=>publish(call(1,'one','Headline',{phrase:'wrong'})),/invalid horse news publication input/);
    assert.throws(()=>publish(call(1,'one','Headline',{brief:{people:[true]}})),/invalid horse news brief array member/);
    assert.equal(counts(),'[0, 0, 0, 0]');
    for(const fault of ["UPDATE content_settings SET engine_enabled=false", "UPDATE content_settings SET auto_publish=false",
      "UPDATE horse_post_modes SET enabled=false", "UPDATE horse_post_modes SET approved_at=NULL",
      "UPDATE profiles SET horse_status='disabled' WHERE is_horse"]) {
      reset();query(fault);assert.throws(()=>publish(call()),/gate disabled|not approved\/enabled|author inactive/);
      assert.equal(counts(),'[0, 0, 0, 0]');
    }
    reset();
    const first=publish(call());assert.match(first,/\|true\|published$/);
    assert.equal(counts(),'[1, 1, 2, 1]');
    assert.equal(publish(call()),first.replace('|true|published','|false|already_published'));
    assert.equal(publish(call(1,'different','Different truthful headline')),'|false|duplicate_slot');
    assert.equal(publish(call(1,'different','Different truthful headline',{slot:'2026-10-10T05'})),'|false|posted_recently');
    assert.equal(query("SELECT link_image||'|'||topic||'|'||array_to_string(topics,',') FROM social_posts"),
      'https://cdn.example/story.jpg|poker|poker,news');
    assert.equal(query("SELECT kind||'|'||domain||'|'||array_to_string(built_from,',') FROM post_briefs"),'link|poker|asset_title');
    assert.equal(publish(call(2)),'|false|asset_used');
    assert.equal(publish(call(2,'different')),'|false|phrase_used');
    assert.equal(publish(call(2,'different','Different headline',{semantic:'semantic:one'})),'|false|phrase_used');
    // Window expiry: another horse can use an old asset, never the original horse.
    query("UPDATE social_posts SET created_at=now()-interval '100 days'; UPDATE content_asset_use SET used_at=now()-interval '31 days'; UPDATE horse_phrase_ledger SET used_at=now()-interval '91 days'");
    assert.equal(publish(call(1,'one','Different headline',{slot:'2026-10-11T04'})),'|false|asset_used');
    assert.match(publish(call(2)),/\|true\|published$/);
    reset();
    // Later brief failure rolls back the earlier post and both ledgers.
    query(`CREATE FUNCTION fixture_brief_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture brief failed'; END $$;
      CREATE TRIGGER fixture_brief_failure BEFORE INSERT ON post_briefs FOR EACH ROW EXECUTE FUNCTION fixture_brief_failure();`);
    assert.throws(()=>publish(call()),/fixture brief failed/);assert.equal(counts(),'[0, 0, 0, 0]');
    query('DROP TRIGGER fixture_brief_failure ON post_briefs');
    const raced=await Promise.all([concurrent(call(1,'same','First headline')),concurrent(call(2,'same','Second headline'))]);
    assert.equal(raced.filter(x=>x.endsWith('|true|published')).length,1);
    assert.equal(raced.filter(x=>x==='|false|asset_used').length,1);assert.equal(counts(),'[1, 1, 2, 1]');
    reset();
    const cadence=await Promise.all([concurrent(call(1,'a','First headline')),concurrent(call(1,'b','Second headline',{slot:'2026-10-10T05'}))]);
    assert.equal(cadence.filter(x=>x.endsWith('|true|published')).length,1);
    assert.equal(cadence.filter(x=>x==='|false|posted_recently').length,1);
    reset();
    const phrases=await Promise.all([concurrent(call(1,'a','Same truthful headline')),concurrent(call(2,'b','Same truthful headline'))]);
    assert.equal(phrases.filter(x=>x.endsWith('|true|published')).length,1);
    assert.equal(phrases.filter(x=>x==='|false|phrase_used').length,1);
    reset();assert.match(publish(call(2,'sport','Sports headline',{type:'sports'})),/\|true\|published$/);
    assert.equal(query("SELECT topic||'|'||array_to_string(topics,',') FROM social_posts"),'sports|sports,news');
    assert.throws(()=>execFileSync(psql,[...args,'-f',migration],{stdio:['ignore','pipe','pipe']}),/already exists/);
  } finally {
    if(started) execFileSync(pgCtl,['-D',data,'-m','fast','-w','stop'],{stdio:'ignore'});
    rmSync(scratch,{recursive:true,force:true});
  }
});
