-- ═══════════════════════════════════════════════════════════════════════
-- 20260806171246_training_sessions_avg_ev_loss_per_mistake.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2                              (1 = doc-only, 2 = additive, 3 = destructive)
-- AUTHOR:      claude (GTOW parity sweep)
-- AFFECTS:     tables: public.training_sessions   rpcs: -   rls: -   triggers: -
-- IRREVERSIBLE: no
--
-- WHY:
--   GTO Wizard's post-session summary reports THREE EV-loss aggregates:
--   total cumulative loss, average loss per HAND, and average loss per
--   MISTAKE. The third one is the diagnostic that separates "I make few
--   mistakes but they are catastrophic" from "I bleed a little on many
--   hands" — two players can post an identical avg-loss-per-hand and need
--   opposite coaching. See .agent/design/GTOW-PARITY-ROADMAP.md item #28.
--
--   The value is already computed client-side (src/hooks/useGTOWScore.js
--   `avgEVLossPerMistake`), re-exported through useGTOTrainer, destructured
--   in GodModeArena, forwarded by src/components/training/utils/saveSession.js,
--   and DESTRUCTURED by pages/api/training/save-session.js at line 98 — and
--   then silently dropped, because `training_sessions` has no column to put
--   it in. Five layers of plumbing terminating in a hole. This adds the hole's
--   missing end.
--
-- HOW (high level):
--   - ADD COLUMN avg_ev_loss_per_mistake numeric NOT NULL DEFAULT 0, matching
--     the numeric type and 0-default of its sibling avg_ev_loss_per_hand.
--   - Backfill historical rows arithmetically. The metric is exactly
--     total_ev_loss / mistake_count, both of which are already stored, so no
--     history is lost — old sessions get a true value, not a placeholder.
--
-- See .agent/workflows/migration-safety.md for the full protocol.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. PRE-FLIGHT ASSERTIONS ─────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'training_sessions'
    ) THEN
        RAISE EXCEPTION 'pre-flight failed: public.training_sessions not found';
    END IF;

    -- The backfill divides total_ev_loss by mistake_count. If either sibling
    -- column is missing the whole premise of this migration is wrong.
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'training_sessions'
          AND column_name = 'total_ev_loss'
    ) THEN
        RAISE EXCEPTION 'pre-flight failed: training_sessions.total_ev_loss not found';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'training_sessions'
          AND column_name = 'mistake_count'
    ) THEN
        RAISE EXCEPTION 'pre-flight failed: training_sessions.mistake_count not found';
    END IF;
END $$;

-- ─── 2. THE ACTUAL CHANGES ────────────────────────────────────────────
ALTER TABLE public.training_sessions
    ADD COLUMN IF NOT EXISTS avg_ev_loss_per_mistake numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.training_sessions.avg_ev_loss_per_mistake IS
    'GTOW parity #28. Average EV loss in bb across only the hands that were '
    'graded a mistake, i.e. total_ev_loss / mistake_count. Distinct from '
    'avg_ev_loss_per_hand, which divides by every hand played. 0 when the '
    'session had no mistakes.';

-- Backfill: the metric is fully derivable from columns already stored, so
-- historical sessions get their real value rather than a 0 placeholder.
-- Guarded on = 0 so re-running is a no-op against rows written by the new
-- API code.
UPDATE public.training_sessions
SET avg_ev_loss_per_mistake = ROUND(total_ev_loss::numeric / mistake_count, 2)
WHERE COALESCE(mistake_count, 0) > 0
  AND COALESCE(total_ev_loss, 0) <> 0
  AND COALESCE(avg_ev_loss_per_mistake, 0) = 0;

-- ─── 3. POST-APPLY ASSERTIONS ─────────────────────────────────────────
DO $$
DECLARE
    v_bad_rows integer;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'training_sessions'
          AND column_name = 'avg_ev_loss_per_mistake'
    ) THEN
        RAISE EXCEPTION 'post-apply failed: avg_ev_loss_per_mistake was not created';
    END IF;

    -- Every row that HAS mistakes and HAS loss must now carry a non-zero
    -- per-mistake figure. A survivor here means the backfill predicate missed.
    SELECT COUNT(*) INTO v_bad_rows
    FROM public.training_sessions
    WHERE COALESCE(mistake_count, 0) > 0
      AND COALESCE(total_ev_loss, 0) <> 0
      AND COALESCE(avg_ev_loss_per_mistake, 0) = 0;

    IF v_bad_rows > 0 THEN
        RAISE EXCEPTION 'post-apply failed: % row(s) still have a zero avg_ev_loss_per_mistake despite recorded mistakes and loss', v_bad_rows;
    END IF;
END $$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK (Tier 2 — additive, but recorded for completeness)
-- ═══════════════════════════════════════════════════════════════════════
-- BEGIN;
-- ALTER TABLE public.training_sessions DROP COLUMN IF EXISTS avg_ev_loss_per_mistake;
-- COMMIT;
