-- APPLIED: 2026-09-09 to PokerIQ-Production (kuklfnapbkmacvwxktbh) via the
-- Supabase MCP, after a dry run in a rolled-back transaction that also proved
-- the CHECK refuses a value the code cannot emit.
--
-- WHAT THE READER DID, RECORDED WHERE WE CAN COUNT IT.
--
-- On 2026-09-09 the vision model was replaced by an engine that runs on the
-- player's own device. The failure path in ReceiptScanner is a bare catch: if
-- the reader fails for a real person, nothing anywhere records that it
-- happened. PostHog is dark in production, so analytics would report nothing
-- either. This table is written on every completed scan and we own it, so it
-- is the one channel that works today.
--
-- read_outcome separates the failures that mean different things:
--   read           text came back and the parser ran
--   no_text        the engine ran and found nothing legible: the photograph
--                  or its preprocessing is the problem
--   engine_failed  the engine could not start: the DEPLOY is the problem,
--                  which is exactly how #1666 shipped with 404 assets
--   route_refused  the server said no (the entitlement gate or a rate limit)
--   not_attempted  no session, so the read was never tried
--
-- ocr_confidence is the engine's own average word confidence, which answers
-- "was the photograph legible" - a different question from the existing
-- `confidence` column, which is how sure the parser is about the document.

ALTER TABLE public.bankroll_receipts
    ADD COLUMN IF NOT EXISTS read_outcome   text,
    ADD COLUMN IF NOT EXISTS ocr_confidence smallint;

ALTER TABLE public.bankroll_receipts
    DROP CONSTRAINT IF EXISTS bankroll_receipts_read_outcome_check;
ALTER TABLE public.bankroll_receipts
    ADD CONSTRAINT bankroll_receipts_read_outcome_check
    CHECK (read_outcome IS NULL OR read_outcome IN
        ('read', 'no_text', 'engine_failed', 'route_refused', 'not_attempted'));

ALTER TABLE public.bankroll_receipts
    DROP CONSTRAINT IF EXISTS bankroll_receipts_ocr_confidence_range;
ALTER TABLE public.bankroll_receipts
    ADD CONSTRAINT bankroll_receipts_ocr_confidence_range
    CHECK (ocr_confidence IS NULL OR (ocr_confidence >= 0 AND ocr_confidence <= 100));

COMMENT ON COLUMN public.bankroll_receipts.read_outcome IS
    'What the on-device reader did: read | no_text | engine_failed | route_refused | not_attempted. engine_failed means the deploy is broken; no_text means the photograph or its preprocessing is.';
COMMENT ON COLUMN public.bankroll_receipts.ocr_confidence IS
    'The OCR engine average word confidence 0-100: how legible the photograph was, which is a different question from how sure the parser is about the document type (see confidence).';

CREATE INDEX IF NOT EXISTS bankroll_receipts_read_outcome_idx
    ON public.bankroll_receipts (read_outcome, created_at DESC)
    WHERE read_outcome IS NOT NULL;

NOTIFY pgrst, 'reload schema';
