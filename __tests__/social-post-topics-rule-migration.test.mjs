// Source contract for the Phase 8 topics rule migration: one pure function derives
// [primary, facets...] for every social post, one BEFORE trigger applies it after the
// video contract trigger, and fn_p7_publish_puzzle gains topics on its INSERT and
// changes nothing else. Horses are players: the rule reads what a post carries,
// never who wrote it.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const MIGRATION_NAME = '20260930170100_social_post_topics_rule.sql';
const PUZZLE_MIGRATION_NAME = '20260930052057_phase7_puzzles_answer_once_and_reveal_once.sql';
const migrationsDir = new URL('../supabase/migrations/', import.meta.url);
const migrationUrl = new URL(MIGRATION_NAME, migrationsDir);
const source = existsSync(migrationUrl) ? readFileSync(migrationUrl, 'utf8') : '';
const sql = source
  .split('\n')
  .filter(line => !line.trimStart().startsWith('--'))
  .join('\n');

const RULE_SIGNATURE = /CREATE OR REPLACE FUNCTION public\.fn_social_post_topics\(\s*p_topic text,\s*p_topics text\[\],\s*p_content_type text,\s*p_content text,\s*p_metadata jsonb\s*\)\s*RETURNS text\[\]/;

function functionBlock(name, text = sql) {
  const match = text.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?AS \\$function\\$([\\s\\S]*?)\\$function\\$;`));
  assert.ok(match, `${MIGRATION_NAME} must define ${name}`);
  return { declaration: match[0].slice(0, match[0].indexOf('$function$')), body: match[1] };
}

test('the migration exists once, after the puzzle RPC it replaces, in one transaction', () => {
  assert.ok(existsSync(migrationUrl), `${MIGRATION_NAME} must exist`);
  assert.ok(MIGRATION_NAME > PUZZLE_MIGRATION_NAME, 'the rule must sort after the puzzle RPC it replaces');
  assert.ok(existsSync(new URL(PUZZLE_MIGRATION_NAME, migrationsDir)), 'the puzzle RPC migration must remain the prerequisite');
  assert.deepEqual(
    readdirSync(migrationsDir).filter(name => name.startsWith('20260930170100_')),
    [MIGRATION_NAME],
    'the migration ledger version must be unique',
  );
  assert.equal((sql.match(/^BEGIN;$/gm) || []).length, 1);
  assert.equal((sql.match(/^COMMIT;$/gm) || []).length, 1);
  assert.doesNotMatch(sql, /^\s*(?:DELETE FROM|TRUNCATE)(?:\s|$)/im);
  assert.doesNotMatch(sql, /CONCURRENTLY/i);
  assert.doesNotMatch(sql, /publish_horse_video_reel|publish_video_library_reel|publish_user_video_reel/, 'the video RPCs are not touched');
  assert.doesNotMatch(sql, /DROP CONSTRAINT|ALTER TABLE public\.social_posts/i, 'the CHECK on topic and the table shape stay as they are');
  assert.doesNotMatch(sql, /(?:UPDATE|INSERT INTO|DELETE FROM|ALTER TABLE|TRUNCATE)\s+(?:public\.)?(?:content_settings|horse_post_modes)\b/i, 'the engine switch and the mode rows stay as they are');
  for (const codePoint of ['–', '—']) {
    assert.ok(!source.includes(codePoint), `${MIGRATION_NAME} must not contain U+${codePoint.codePointAt(0).toString(16)}`);
  }
  assert.doesNotMatch(source, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, 'no emoji');
});

test('fn_social_post_topics is IMMUTABLE, never raises and reads only what the post carries', () => {
  const rule = functionBlock('fn_social_post_topics');
  assert.match(sql, RULE_SIGNATURE);
  assert.match(rule.declaration, /LANGUAGE plpgsql/);
  assert.match(rule.declaration, /\bIMMUTABLE\b/);
  assert.doesNotMatch(rule.body, /RAISE/i, 'a derivation must never fail a write');
  assert.match(rule.body, /EXCEPTION WHEN OTHERS THEN[\s\S]*RETURN ARRAY\['unknown'\]::text\[\];/, 'the safety net returns a legal primary');
  for (const forbidden of ['is_horse', 'origin_type', "'scheduler'", 'horse_id']) {
    assert.ok(!rule.body.includes(forbidden), `the rule must not read ${forbidden}: horses are players`);
  }
  // Step 1: the primary from p_topic; cash and tournament are facets under poker; anything else is unknown.
  assert.match(rule.body, /IF v_primary IN \('cash', 'tournament'\) THEN[\s\S]*?v_primary := 'poker';/);
  assert.match(rule.body, /NOT IN \('unknown', 'poker', 'slots', 'sports', 'other'\) THEN\s*v_primary := 'unknown';/);
  // Step 2: the supplied topics decide an unknown primary in the fn_infer_video_topic order.
  assert.match(rule.body, /v_supplied && ARRAY\['poker', 'cash', 'tournament'\] THEN\s*v_primary := 'poker';[\s\S]*?ARRAY\['slots'\] THEN\s*v_primary := 'slots';[\s\S]*?ARRAY\['sports'\] THEN\s*v_primary := 'sports';/);
  // Step 3: metadata facets.
  for (const key of ['grounded_type', 'phase7_mode', 'phase6_mode', 'news_box', 'news_type', 'source', 'video_type', 'shared_reel_topic']) {
    assert.ok(rule.body.includes(`v_meta ->> '${key}'`), `metadata.${key} is read`);
  }
  assert.match(rule.body, /v_meta \? 'puzzle' OR v_phase7_mode LIKE 'puzzle\\_%'/);
  assert.match(rule.body, /v_phase6_mode = 'club_data_digest'/);
  assert.match(rule.body, /v_phase6_mode IN \('local_event', 'seasonal_local'\)/);
  assert.match(rule.body, /v_news_box IN \('2', '4'\)/);
  assert.match(rule.body, /v_source = 'social_page_post'/);
  // Step 4: the card token regex.
  assert.ok(rule.body.includes("p_content ~ '\\[\\[sp-card:[2-9TJQKA][cdhs]\\]\\]'"), 'a card token means a real hand');
  // Step 5: content types.
  assert.match(rule.body, /v_content_type = 'tournament_tip' THEN\s*v_facets := v_facets \|\| ARRAY\['tournament', 'strategy'\]/);
  assert.match(rule.body, /IN \('article', 'gto_concept', 'poker_math', 'hand_reading', 'quick_tip', 'strategy_tip'\)/);
  // Step 6 and 7: a poker facet makes an unknown primary poker; fixed order; at most 4.
  assert.match(rule.body, /IF v_primary = 'unknown' AND cardinality\(v_facets\) > 0 THEN\s*v_primary := 'poker';/);
  assert.match(rule.body, /ARRAY\['cash', 'tournament', 'hand', 'session', 'puzzle', 'story',\s*'news', 'club', 'local', 'strategy'\]\) WITH ORDINALITY/);
  assert.match(rule.body, /RETURN v_out\[1:4\];/);
});

test('the derive trigger fills topics, mirrors topic from topics[1] and fires after the video contract', () => {
  const trigger = functionBlock('fn_social_posts_derive_topics');
  assert.match(trigger.declaration, /RETURNS trigger/);
  assert.match(trigger.body, /NEW\.topics := public\.fn_social_post_topics\(NEW\.topic, NEW\.topics, NEW\.content_type, NEW\.content, NEW\.metadata\);/);
  assert.match(trigger.body, /NEW\.topic := NEW\.topics\[1\];/);
  assert.match(trigger.body, /RETURN NEW;/);
  assert.doesNotMatch(trigger.body, /RAISE/i, 'the trigger never raises');
  assert.match(
    sql,
    /CREATE TRIGGER trg_social_posts_zz_derive_topics\s+BEFORE INSERT OR UPDATE OF topic, topics, content, metadata, content_type\s+ON public\.social_posts\s+FOR EACH ROW\s+EXECUTE FUNCTION public\.fn_social_posts_derive_topics\(\);/,
  );
  assert.ok('trg_social_posts_zz_derive_topics' > 'trg_social_posts_video_contract_defaults', 'BEFORE ROW triggers fire in name order; zz runs last');
  assert.ok('trg_social_posts_zz_derive_topics' > 'trg_social_posts_managed_visibility_guard');
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.fn_social_posts_derive_topics\(\) FROM PUBLIC, anon, authenticated;/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.fn_social_posts_derive_topics\(\) TO service_role;/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.fn_social_post_topics\(text, text\[\], text, text, jsonb\)\s+TO anon, authenticated, service_role;/);
});

test('fn_p7_publish_puzzle keeps its installed body and only gains topics on the INSERT', () => {
  const replaced = functionBlock('fn_p7_publish_puzzle', source);
  assert.match(replaced.declaration, /SECURITY DEFINER/);
  assert.match(replaced.body, /INSERT INTO public\.social_posts \(\s*author_id, content, content_type, visibility, topic, topics, metadata\s*\) VALUES \(/);
  assert.ok(replaced.body.includes("    'poker',\n    ARRAY['poker', 'hand', 'puzzle']::text[],\n    v_metadata || jsonb_build_object("), 'topics = {poker,hand,puzzle} sits between topic and metadata');
  const puzzleSource = readFileSync(new URL(PUZZLE_MIGRATION_NAME, migrationsDir), 'utf8');
  const installed = puzzleSource.match(/CREATE OR REPLACE FUNCTION public\.fn_p7_publish_puzzle\([\s\S]*?AS \$function\$([\s\S]*?)\$function\$;/);
  assert.ok(installed, 'the installed body is in the puzzle migration');
  const expected = installed[1]
    .replace('    author_id, content, content_type, visibility, topic, metadata\n', '    author_id, content, content_type, visibility, topic, topics, metadata\n')
    .replace("    'poker',\n    v_metadata || jsonb_build_object(\n", "    'poker',\n    ARRAY['poker', 'hand', 'puzzle']::text[],\n    v_metadata || jsonb_build_object(\n");
  assert.notEqual(expected, installed[1], 'the two edits apply to the installed body');
  assert.equal(replaced.body, expected, 'nothing but the INSERT column and value changed');
  assert.match(sql, /md5\(p\.prosrc\) INTO v_body_md5/, 'the pre-flight refuses to replace a body it did not read');
  assert.match(sql, /3fd6a04d4d5652e486e005846a201ad3/);
});

test('pre-flight and post-apply pin the trigger, the CHECK, the RPC and the card-token derivation', () => {
  const preflight = sql.match(/DO \$preflight\$([\s\S]*?)\$preflight\$;/);
  assert.ok(preflight, 'migration must have an executable preflight');
  assert.match(preflight[1], /conname = 'social_posts_topic_check'/);
  assert.match(preflight[1], /tgname = 'trg_social_posts_zz_derive_topics'[\s\S]*?IF n <> 0 THEN/);
  assert.match(preflight[1], /to_regprocedure\('public\.fn_p7_publish_puzzle\(uuid, text, uuid, bigint, text, jsonb, text, jsonb, text, text, text, jsonb, text, boolean, integer, jsonb\)'\) IS NULL/);
  const postapply = sql.match(/DO \$postapply\$([\s\S]*?)\$postapply\$;/);
  assert.ok(postapply, 'migration must have executable post-apply assertions');
  assert.match(postapply[1], /tgname = 'trg_social_posts_zz_derive_topics'/);
  assert.match(postapply[1], /provolatile = 'i'/);
  assert.match(postapply[1], /fn_social_post_topics\('unknown', NULL, 'text', 'Board \[\[sp-card:Ac\]\]', '\{\}'::jsonb\)/);
  assert.match(postapply[1], /IS DISTINCT FROM ARRAY\['poker', 'hand'\]::text\[\]/);
  assert.match(postapply[1], /fn_social_post_topics\('bogus', NULL, NULL, NULL, NULL\)/, 'a value outside the CHECK is unknown, never an error');
  assert.match(source, /^-- DROP TRIGGER IF EXISTS trg_social_posts_zz_derive_topics ON public\.social_posts;$/m);
  assert.match(source, /^-- DROP FUNCTION IF EXISTS public\.fn_social_post_topics\(text, text\[\], text, text, jsonb\);$/m);
});
