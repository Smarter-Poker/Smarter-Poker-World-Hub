// Natural keys of the per-user bankroll tables.
//
// bankroll_segments and bankroll_rules have a surrogate primary key ("id") and
// a real identity of (user_id, segment_type) / (user_id, rule_type). An upsert
// without onConflict makes PostgREST emit ON CONFLICT ("id"), which no client
// payload carries, so the write falls through to the natural unique key and is
// refused with 23505. Every upsert into these tables names the natural key.
// __tests__/a-bankroll-upsert-names-its-natural-key.law.test.mjs enforces it.

export const BANKROLL_SEGMENT_KEY = 'user_id,segment_type';
export const BANKROLL_RULE_KEY = 'user_id,rule_type';

// Create the row if it is missing, leave an existing row untouched
// (INSERT ... ON CONFLICT (natural key) DO NOTHING). Needs INSERT only.
export const BANKROLL_SEGMENT_CREATE_ONLY = Object.freeze({
  onConflict: BANKROLL_SEGMENT_KEY,
  ignoreDuplicates: true,
});
export const BANKROLL_RULE_CREATE_ONLY = Object.freeze({
  onConflict: BANKROLL_RULE_KEY,
  ignoreDuplicates: true,
});

// Create or overwrite the user's row for that rule type
// (INSERT ... ON CONFLICT (natural key) DO UPDATE).
export const BANKROLL_RULE_UPSERT = Object.freeze({
  onConflict: BANKROLL_RULE_KEY,
});
