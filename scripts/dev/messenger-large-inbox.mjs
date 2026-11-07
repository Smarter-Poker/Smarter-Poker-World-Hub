#!/usr/bin/env node
// Repeatable large-inbox Messenger fixture for the designated test account.
//
// 2026-11-06: an inbox of 673 threads could not mark anything read because one
// IN list grew past the database gateway's ~25KB URL limit. The live checks
// (e2e-tests.yml suites messenger-live and messenger-send-live) only prove the
// batching on an inbox that is actually large, and the designated account's
// own inbox is not. This prints the SQL that gives it one, and the SQL that
// removes exactly what was added.
//
//   node scripts/dev/messenger-large-inbox.mjs seed    --tag 20261106 --count 720
//   node scripts/dev/messenger-large-inbox.mjs cleanup --tag 20261106 --count 720
//
// It prints SQL and nothing else: no database connection, no environment
// file, no credentials. Run the output through one execute_sql call (one
// call = one transaction). Every ID is derived from the tag, so a seed refuses
// to run twice, and cleanup removes only rows it can prove it owns. Cleanup
// raises instead of deleting when a fixture thread has acquired anything a
// person could have added (another participant, reactions, a ticket, an
// accounting link, foreign reads or notifications). It is DML only, so the
// :50-:03 UTC DDL window does not refuse it.
//
// Never point this at a person's account. The test identity is the platform
// service account "Smarter.Poker Official"; the sender is the reserved
// certification fixture account. Both are re-verified inside the SQL.

export const TEST_ACCOUNT_ID = '2d1cd6c3-5700-4af9-a271-d4863fdab20d';
export const TEST_ACCOUNT_USERNAME = 'smarterpoker';
export const TEST_ACCOUNT_NAME = 'Smarter.Poker Official';
export const FIXTURE_SENDER_ID = '00000000-0000-0000-0000-000000000069';
export const SEND_FIXTURE_TITLE = 'Messenger Verification Only';
export const MAX_COUNT = 2000;

const TAG = /^[0-9]{8}(?:-[a-z0-9]{1,16})?$/;

export function fixtureNames(tag) {
  if (!TAG.test(String(tag || ''))) throw new Error('tag must be YYYYMMDD or YYYYMMDD-suffix (lowercase letters and digits)');
  return {
    conversationSeed: `wh-large-inbox-${tag}-`,
    messageSeed: `wh-large-inbox-msg-${tag}-`,
    sendFixtureSeed: `wh-send-fixture-${tag}`,
    groupName: `Verification Only: Large Inbox ${tag}`,
    marker: `wh-messenger-large-inbox-${tag}`,
  };
}

function checkCount(count) {
  const n = Number(count);
  if (!Number.isInteger(n) || n < 1 || n > MAX_COUNT) throw new Error(`count must be an integer from 1 to ${MAX_COUNT}`);
  return n;
}

// Every interpolated value is either validated against TAG, a fixed constant,
// or an integer, so no quoting of untrusted input happens here.
export function seedSql({ tag, count }) {
  const f = fixtureNames(tag);
  const n = checkCount(count);
  const conv = `md5('${f.conversationSeed}'||g)::uuid`;
  const msg = `md5('${f.messageSeed}'||g)::uuid`;
  const send = `md5('${f.sendFixtureSeed}')::uuid`;
  return `DO $$
DECLARE before_profiles text; after_profiles text; n int := ${n}; listed int; unread int;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM profiles WHERE id='${TEST_ACCOUNT_ID}' AND username='${TEST_ACCOUNT_USERNAME}' AND full_name='${TEST_ACCOUNT_NAME}' AND NOT COALESCE(is_horse,false))
 OR NOT EXISTS (SELECT 1 FROM profiles p JOIN ca_cert_accounts c ON c.user_id=p.id WHERE p.id='${FIXTURE_SENDER_ID}' AND c.active AND NOT COALESCE(p.is_horse,false) AND fn_ca_is_fixture_account(p.id) AND fn_ca_is_cert_account(p.id))
 THEN RAISE EXCEPTION 'Designated test identities changed'; END IF;
 IF EXISTS (SELECT 1 FROM social_conversations WHERE id IN (SELECT ${conv} FROM generate_series(1,n) g) OR id=${send})
 OR EXISTS (SELECT 1 FROM social_messages WHERE id IN (SELECT ${msg} FROM generate_series(1,n) g))
 THEN RAISE EXCEPTION 'Owned IDs already exist; inspect durable outcome before retry'; END IF;
 SELECT md5(string_agg(to_jsonb(p)::text,',' ORDER BY id)) INTO before_profiles FROM profiles p WHERE id IN ('${TEST_ACCOUNT_ID}','${FIXTURE_SENDER_ID}');
 INSERT INTO social_conversations(id,is_group,group_name,is_request,context_entity_id,context_entity_type)
   SELECT ${conv},true,'${f.groupName}',false,NULL,NULL FROM generate_series(1,n) g;
 INSERT INTO social_conversations(id,is_group,group_name,is_request,context_entity_id,context_entity_type)
   VALUES (${send},true,'${SEND_FIXTURE_TITLE}',false,NULL,NULL);
 INSERT INTO social_conversation_participants(conversation_id,user_id,context_entity_id,context_entity_type)
   SELECT ${conv},'${TEST_ACCOUNT_ID}'::uuid,NULL::uuid,NULL::text FROM generate_series(1,n) g
   UNION ALL SELECT ${send},'${TEST_ACCOUNT_ID}'::uuid,NULL::uuid,NULL::text;
 INSERT INTO social_messages(id,conversation_id,sender_id,content,message_type,media_metadata,created_at)
   SELECT ${msg}, ${conv},'${FIXTURE_SENDER_ID}'::uuid,
     'Technical verification fixture ${tag}. Large-inbox read-state check only; no reply requested.','text',
     '{"verification_fixture":"${f.marker}"}'::jsonb, now() - make_interval(secs => g)
   FROM generate_series(1,n) g;
 SELECT count(*), count(*) FILTER (WHERE unread_count=1) INTO listed, unread
   FROM fn_get_user_conversations('${TEST_ACCOUNT_ID}',NULL)
   WHERE conversation_id IN (SELECT ${conv} FROM generate_series(1,n) g);
 IF listed <> n OR unread <> n THEN RAISE EXCEPTION 'Fixture not reachable or unread: listed %, unread %', listed, unread; END IF;
 IF EXISTS (SELECT 1 FROM fn_get_user_conversations('${TEST_ACCOUNT_ID}',NULL) WHERE conversation_id=${send})
 THEN RAISE EXCEPTION 'Empty send fixture must not be listed before its first message'; END IF;
 IF EXISTS (SELECT 1 FROM notifications WHERE user_id='${TEST_ACCOUNT_ID}' AND created_at > now() - interval '1 minute' AND data->>'conversationId' IN (SELECT ${conv}::text FROM generate_series(1,n) g))
 THEN RAISE EXCEPTION 'Unexpected notification side effect'; END IF;
 SELECT md5(string_agg(to_jsonb(p)::text,',' ORDER BY id)) INTO after_profiles FROM profiles p WHERE id IN ('${TEST_ACCOUNT_ID}','${FIXTURE_SENDER_ID}');
 IF before_profiles IS DISTINCT FROM after_profiles THEN RAISE EXCEPTION 'Unexpected profile side effect'; END IF;
 RAISE NOTICE 'seed ok: % conversations listed and unread', listed;
END $$;
SELECT 'seeded' AS status, ${n} AS conversations, ${send} AS send_fixture_conversation_id;
`;
}

export function cleanupSql({ tag, count }) {
  const f = fixtureNames(tag);
  const n = checkCount(count);
  return `DO $$
DECLARE n int := ${n}; owned uuid[]; official uuid := '${TEST_ACCOUNT_ID}'; sender uuid := '${FIXTURE_SENDER_ID}'; send_fixture uuid := md5('${f.sendFixtureSeed}')::uuid; removed int;
BEGIN
 PERFORM set_config('lock_timeout','3s',true);
 owned := array(SELECT md5('${f.conversationSeed}'||g)::uuid FROM generate_series(1,n) g) || send_fixture;
 PERFORM 1 FROM social_conversations WHERE id = ANY(owned) FOR UPDATE;
 IF EXISTS (SELECT 1 FROM social_conversations WHERE id = ANY(owned) AND NOT (is_group AND group_name IN ('${f.groupName}','${SEND_FIXTURE_TITLE}')))
 OR EXISTS (SELECT 1 FROM social_conversation_participants WHERE conversation_id = ANY(owned) AND user_id IS DISTINCT FROM official)
 OR EXISTS (SELECT 1 FROM social_messages WHERE conversation_id = ANY(owned) AND NOT (
      (sender_id = sender AND conversation_id <> send_fixture AND media_metadata->>'verification_fixture' = '${f.marker}')
   OR (conversation_id = send_fixture AND sender_id = official AND content LIKE '${SEND_FIXTURE_TITLE}: Idempotent Send %' AND message_type = 'text')))
 OR EXISTS (SELECT 1 FROM social_message_reads r JOIN social_messages m ON m.id = r.message_id WHERE m.conversation_id = ANY(owned) AND r.user_id IS DISTINCT FROM official)
 OR EXISTS (SELECT 1 FROM message_reactions x JOIN social_messages m ON m.id = x.message_id WHERE m.conversation_id = ANY(owned))
 OR EXISTS (SELECT 1 FROM live_help_tickets WHERE conversation_id = ANY(owned))
 OR EXISTS (SELECT 1 FROM accounting_conversations WHERE conversation_id = ANY(owned))
 OR EXISTS (SELECT 1 FROM accounting_invoice_deliveries d JOIN social_messages m ON m.id = d.message_id WHERE m.conversation_id = ANY(owned))
 OR EXISTS (SELECT 1 FROM notifications WHERE data->>'conversationId' IN (SELECT unnest(owned)::text) AND user_id IS DISTINCT FROM official)
 THEN RAISE EXCEPTION 'Fixture changed or acquired other data; preserve and inspect'; END IF;
 DELETE FROM notifications WHERE user_id = official AND data->>'conversationId' IN (SELECT unnest(owned)::text);
 DELETE FROM social_conversations WHERE id = ANY(owned);
 GET DIAGNOSTICS removed = ROW_COUNT;
 IF EXISTS (SELECT 1 FROM social_messages WHERE conversation_id = ANY(owned))
 OR EXISTS (SELECT 1 FROM social_conversation_participants WHERE conversation_id = ANY(owned))
 OR EXISTS (SELECT 1 FROM social_message_reads WHERE message_id IN (SELECT md5('${f.messageSeed}'||g)::uuid FROM generate_series(1,n) g))
 THEN RAISE EXCEPTION 'Owned fixture cleanup incomplete'; END IF;
 RAISE NOTICE 'cleanup removed % conversations', removed;
END $$;
SELECT count(*) AS remaining FROM social_conversations
 WHERE id IN (SELECT md5('${f.conversationSeed}'||g)::uuid FROM generate_series(1,${n}) g) OR id = md5('${f.sendFixtureSeed}')::uuid;
`;
}

function parseArgs(argv) {
  const [mode, ...rest] = argv;
  const opts = {};
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i];
    if (key !== '--tag' && key !== '--count') throw new Error(`unknown option ${key}`);
    opts[key.slice(2)] = rest[i + 1];
  }
  if (mode !== 'seed' && mode !== 'cleanup') throw new Error('usage: messenger-large-inbox.mjs seed|cleanup --tag YYYYMMDD --count N');
  return { mode, tag: opts.tag, count: opts.count ?? 720 };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const { mode, tag, count } = parseArgs(process.argv.slice(2));
    process.stdout.write(mode === 'seed' ? seedSql({ tag, count }) : cleanupSql({ tag, count }));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(2);
  }
}
