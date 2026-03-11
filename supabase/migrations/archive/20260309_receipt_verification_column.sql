-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 8: Receipt Verification Enhancement
-- Adds verified/confidence columns to expense_receipts for AI OCR hardening
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE expense_receipts ADD COLUMN IF NOT EXISTS verified boolean DEFAULT false;
ALTER TABLE expense_receipts ADD COLUMN IF NOT EXISTS confidence_score integer DEFAULT 0;
ALTER TABLE expense_receipts ADD COLUMN IF NOT EXISTS verified_at timestamptz;
ALTER TABLE expense_receipts ADD COLUMN IF NOT EXISTS verified_by text; -- 'user' or 'ai'

-- Index for filtering verified vs unverified receipts
CREATE INDEX IF NOT EXISTS idx_expense_receipts_verified ON expense_receipts(verified);
