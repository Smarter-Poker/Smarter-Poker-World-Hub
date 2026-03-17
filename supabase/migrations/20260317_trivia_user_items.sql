-- ═══════════════════════════════════════════════════════════════════════════
-- Trivia User Items — Persist streak shields & arcade tickets from PrizeWheel
-- ═══════════════════════════════════════════════════════════════════════════
-- Previously PrizeWheel could award streak_shield and arcade_ticket items
-- but they were never stored — they vanished after the modal closed.
-- This table stores user inventory items so they can be redeemed later.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS trivia_user_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    item_type text NOT NULL CHECK (item_type IN ('streak_shield', 'arcade_ticket', 'mystery_box')),
    quantity int NOT NULL DEFAULT 1 CHECK (quantity >= 0),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(user_id, item_type)
);

-- RLS
ALTER TABLE trivia_user_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own items"
    ON trivia_user_items FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own items"
    ON trivia_user_items FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own items"
    ON trivia_user_items FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Index
CREATE INDEX IF NOT EXISTS idx_trivia_user_items_user ON trivia_user_items(user_id);
