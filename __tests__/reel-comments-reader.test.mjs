import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { readReelComments, REEL_COMMENT_FIELDS } from '../src/lib/reelCommentsReader.mjs';

const reelId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const authorId = '11111111-1111-4111-8111-111111111111';
const rows = [{ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', post_id: reelId, author_id: authorId, parent_id: null, content: 'Persisted comment', created_at: '2026-10-13T00:00:00Z' }];
function client({ commentError, profileError, profiles = [{id: authorId, username: 'Creator', avatar_url: null}] } = {}) {
  const calls = [];
  return { calls, from(table) {
    const query = { select(fields) { calls.push([table, 'select', fields]); if (fields.includes(':')) throw Object.assign(new Error('No relationship found'), {code:'PGRST200'}); return this; }, eq(...args) { calls.push([table,'eq',...args]); return this; }, in(...args) { calls.push([table,'in',...args]); return this; }, order(...args) { calls.push([table,'order',...args]); return this; }, range(...args) { calls.push([table,'range',...args]); return this; }, then(resolve, reject) { return Promise.resolve(table === 'social_comments' ? {data:rows,error:commentError} : {data:profiles,error:profileError}).then(resolve,reject); } };
    return query;
  }};
}
test('all three initial and pagination callers use the FK-independent reader', () => {
  for (const path of ['../pages/hub/reels.js','../src/components/social/Reels.jsx','../src/components/social/ReelsFeedCarousel.jsx']) {
    const source = readFileSync(new URL(path, import.meta.url),'utf8');
    assert.equal((source.match(/await readReelComments\(/g) || []).length, 2, path);
    assert.doesNotMatch(source, /profiles:author_id/);
    assert.match(source, /commentLoadError/);
  }
});
test('actual explicit reader retains persisted identity and hydrates author without a foreign key', async () => {
  const db = client();
  const result = await readReelComments(db,reelId,{page:1,oldest:true});
  assert.equal(result[0].content, rows[0].content);
  assert.equal(result[0].author_id,authorId);
  assert.equal(result[0].parent_id,null);
  assert.equal(result[0].profiles.username,'Creator');
  for (const field of ['author_id','parent_id']) assert.ok(REEL_COMMENT_FIELDS.split(',').includes(field));
  assert.deepEqual(db.calls.find(call=>call[1]==='range'), ['social_comments','range',50,99]);
  assert.deepEqual(db.calls.find(call=>call[1]==='in'), ['profiles','in','id',[authorId]]);
});
test('missing or denied profiles preserve comments; comment permission failures stay failures', async () => {
  for (const options of [{profiles:[]},{profileError:{code:'42501'}}]) {
    const result = await readReelComments(client(options),reelId);
    assert.equal(result.length,1);
    assert.equal(result[0].profiles,null);
  }
  await assert.rejects(readReelComments(client({commentError:new Error('permission denied')}),reelId),/permission denied/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(readReelComments(client(),reelId,{signal:controller.signal}),/abort/i);
});

test('actual opening handlers display persisted comments and surface read failures on all three viewers', async () => {
  const { createLatestRequestGuard } = await import('../src/lib/latestRequestGuard.mjs');
  const { createReelAccountScope } = await import('../src/lib/reelAccountScope.mjs');
  for (const [path, name] of [
    ['../pages/hub/reels.js','handleComment'],
    ['../src/components/social/Reels.jsx','handleOpenComments'],
    ['../src/components/social/ReelsFeedCarousel.jsx','handleToggleComments'],
  ]) {
    const source = readFileSync(new URL(path, import.meta.url),'utf8');
    const start = source.indexOf(`  const ${name} = async () => {`);
    const end = source.indexOf('  // #6 Comment Pagination',start);
    assert.ok(start >= 0 && end > start);
    for (const fails of [false,true]) {
      const populated = [];
      const errors = [];
      const scope = createReelAccountScope(authorId);
      const bindings = {
        currentReel: {id:reelId}, showCommentPanel:false, showCommentInput:false, showComments:false,
        setShowCommentPanel(){},setShowCommentInput(){},setShowComments(){},
        commentRequestGuardRef:{current:createLatestRequestGuard()},accountScopeRef:{current:scope},
        activeUserIdRef:{current:authorId},activeCommentReelIdRef:{current:reelId},
        setCommentPage(){},setLoadingMoreComments(){},setCommentLoadError(value){errors.push(value);},
        supabase:client(fails ? {commentError:new Error('permission denied')} : {}),readReelComments,
        commentSort:'newest',setComments(value){populated.push(value);},setReelComments(value){populated.push(value);},
        setHasMoreComments(){},setCommentCounts(){},setCommentLikeCounts(){},setCommentLikes(){},
        commentFocusTimerRef:{current:null},commentInputRef:{current:null},setTimeout(){return 1;},clearTimeout(){},
        console:{warn(){}},
      };
      const handler = new Function(...Object.keys(bindings), source.slice(start,end)+`\nreturn ${name};`)(...Object.values(bindings));
      await handler();
      if (fails) {
        assert.ok(errors.some(value=>value.includes('Could Not Be Loaded')),path);
        assert.ok(!populated.some(value=>value?.[0]?.id === rows[0].id));
      } else {
        assert.equal(populated[0]?.[0]?.id,rows[0].id,path);
        assert.equal(populated[0]?.[0]?.author_id,authorId,path);
      }
    }
  }
});
