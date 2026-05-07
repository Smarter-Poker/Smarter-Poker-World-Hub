-- ═══════════════════════════════════════════════════════════════════════
-- 20260507180000_regenerate_herocards_from_herohand.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:         3   (UPDATE ~7,533 PIO+CHART rows — heroCards regeneration)
-- AUTHOR:       claude (Phase 95 — root-cause fix for Phase 93 symptom)
--
-- WHY:
--   Phase 95 audit found:
--     - PIO:   7,069 of 20,950 rows (33.7%) have heroCards mismatching scenario.heroHand
--     - CHART:   214 of 1,000 rows (21.4%) have heroCards mismatching
--     - CHART:   250 of 1,000 rows have NO heroCards field at all
--
--   Root cause: Phase 77/78/79/80 swap migrations updated scenario.heroHand
--   but not heroCards. So a row with scenario.heroHand="AA" might still have
--   heroCards=["Ts","2h"] from before the swap, surfacing as visible UI
--   mismatch ("you hold AA" prose, but Ts2h cards rendered).
--
--   Phase 93 fixed the response-time symptom (collision branch + hand-of-the-day
--   field selection) but didn't clean the underlying data. This migration is
--   the durable fix: derive heroCards from scenario.heroHand for every row.
--
-- HOW:
--   fn_derive_herocards_from_heroHand(heroHand text) returns jsonb array:
--     - 4-char specific (e.g. "AhKs"):     ["Ah","Ks"]      (use as-is)
--     - 5-char specific (e.g. "Ah Ks"):    ["Ah","Ks"]      (split on space)
--     - 2-char pair (e.g. "AA"):           ["Ah","As"]      (hearts + spades)
--     - 3-char suited (e.g. "AKs"):        ["Ah","Kh"]      (both hearts)
--     - 3-char offsuit (e.g. "AKo"):       ["Ah","Kd"]      (hearts + diamonds)
--     - Other / null / malformed:           NULL            (caller leaves as-is)
--
--   Canonical suits chosen for simplicity. Board-collision case is rare and
--   already handled by enrichLegacyCachedQuestion's collision branch (which
--   regenerates from a non-board seed at request time).
--
-- IDEMPOTENT: Re-running this migration on already-fixed rows yields the same
-- canonical heroCards (deterministic from heroHand text). No-op on second run.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION fn_derive_herocards_from_heroHand(hh text)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  r1 char(1);
  r2 char(1);
  is_pair boolean;
  is_suited boolean;
BEGIN
  IF hh IS NULL OR LENGTH(hh) < 2 OR LENGTH(hh) > 5 THEN
    RETURN NULL;
  END IF;

  -- Specific 4-char form like "AhKs"
  IF LENGTH(hh) = 4 AND substring(hh,2,1) IN ('h','d','s','c') AND substring(hh,4,1) IN ('h','d','s','c') THEN
    RETURN jsonb_build_array(substring(hh,1,2), substring(hh,3,2));
  END IF;

  -- Specific 5-char form like "Ah Ks" (with space)
  IF LENGTH(hh) = 5 AND substring(hh,3,1) = ' ' THEN
    RETURN jsonb_build_array(substring(hh,1,2), substring(hh,4,2));
  END IF;

  -- Range notation: 2-char pair, 3-char suited/offsuit
  r1 := upper(substring(hh,1,1));
  r2 := upper(substring(hh,2,1));
  is_pair := (r1 = r2);
  is_suited := (LENGTH(hh) = 3 AND substring(hh,3,1) IN ('s','S'));

  -- Validate ranks are real card characters
  IF r1 NOT IN ('A','K','Q','J','T','9','8','7','6','5','4','3','2')
     OR r2 NOT IN ('A','K','Q','J','T','9','8','7','6','5','4','3','2') THEN
    RETURN NULL;
  END IF;

  IF is_pair THEN
    -- Pair: hearts + spades (canonical)
    RETURN jsonb_build_array(r1 || 'h', r2 || 's');
  ELSIF is_suited THEN
    -- Suited: both hearts
    RETURN jsonb_build_array(r1 || 'h', r2 || 'h');
  ELSE
    -- Offsuit (3-char "Xo" or 2-char unsuited e.g. "AK"): hearts + diamonds
    RETURN jsonb_build_array(r1 || 'h', r2 || 'd');
  END IF;
END;
$$;

BEGIN;

UPDATE training_question_cache
SET question_data = jsonb_set(
  question_data,
  '{heroCards}',
  fn_derive_herocards_from_heroHand(question_data->'scenario'->>'heroHand')
)
WHERE engine_type IN ('PIO','CHART')
  AND question_data->'scenario'->>'heroHand' IS NOT NULL
  AND fn_derive_herocards_from_heroHand(question_data->'scenario'->>'heroHand') IS NOT NULL
  AND fn_derive_herocards_from_heroHand(question_data->'scenario'->>'heroHand')
    IS DISTINCT FROM question_data->'heroCards';

COMMIT;

-- Cleanup: drop the helper after one-shot use
DROP FUNCTION IF EXISTS fn_derive_herocards_from_heroHand(text);
