-- ═══════════════════════════════════════════════════════════════════════════════
-- CHIP LEDGER — Immutable, append-only transaction log for ALL chip movements
-- ═══════════════════════════════════════════════════════════════════════════════
-- Every chip transaction across the entire system MUST be recorded here.
-- This table is APPEND-ONLY. No updates, no deletes. Ever.
-- RLS enforces: users can only READ their own transactions.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.chip_ledger (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,

    -- WHO performed the transaction
    performed_by    UUID NOT NULL REFERENCES auth.users(id),

    -- SOURCE wallet (where chips came from)
    from_type       TEXT NOT NULL CHECK (from_type IN ('union_bank', 'club_treasury', 'agent_wallet', 'player_wallet', 'system_mint', 'promo_wallet')),
    from_entity_id  UUID,          -- union_id, club_id, agent_id, or user_id
    from_label      TEXT,           -- Human-readable: "Midway Union Bank", "Shark Club Treasury", "AgentName wallet"

    -- DESTINATION wallet (where chips went)
    to_type         TEXT NOT NULL CHECK (to_type IN ('union_bank', 'club_treasury', 'agent_wallet', 'player_wallet', 'system_burn', 'promo_wallet')),
    to_entity_id    UUID,           -- union_id, club_id, agent_id, or user_id
    to_label        TEXT,           -- Human-readable

    -- AMOUNT
    amount          NUMERIC(15,2) NOT NULL CHECK (amount > 0),

    -- CONTEXT
    category        TEXT NOT NULL DEFAULT 'transfer',  -- mint, transfer, clawback, buyin, cashout, commission, rake, settlement, promo, etc.
    description     TEXT,
    notes           TEXT,

    -- CLUB/UNION context
    club_id         UUID,
    union_id        UUID,

    -- RELATED entities
    table_id        UUID,
    hand_id         UUID,
    tournament_id   UUID,

    -- TIMESTAMP (immutable)
    created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,

    -- INDEXES for fast queries
    CONSTRAINT chip_ledger_positive_amount CHECK (amount > 0)
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_chip_ledger_performed_by ON public.chip_ledger(performed_by);
CREATE INDEX IF NOT EXISTS idx_chip_ledger_from_entity ON public.chip_ledger(from_entity_id);
CREATE INDEX IF NOT EXISTS idx_chip_ledger_to_entity ON public.chip_ledger(to_entity_id);
CREATE INDEX IF NOT EXISTS idx_chip_ledger_club ON public.chip_ledger(club_id);
CREATE INDEX IF NOT EXISTS idx_chip_ledger_union ON public.chip_ledger(union_id);
CREATE INDEX IF NOT EXISTS idx_chip_ledger_created ON public.chip_ledger(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chip_ledger_category ON public.chip_ledger(category);

-- RLS: Users can only see transactions they performed or are involved in
ALTER TABLE public.chip_ledger ENABLE ROW LEVEL SECURITY;

-- Read policy: see your own transactions (as performer, sender, or receiver)
CREATE POLICY "Users can view their own transactions" ON public.chip_ledger
    FOR SELECT USING (
        auth.uid() = performed_by
        OR auth.uid() = from_entity_id
        OR auth.uid() = to_entity_id
    );

-- Insert policy: any authenticated user can insert (transaction logging)
CREATE POLICY "Authenticated users can log transactions" ON public.chip_ledger
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- NO update or delete policies — the ledger is immutable
-- Service role can still read all for admin/audit purposes

-- Enable realtime for transaction notifications
ALTER PUBLICATION supabase_realtime ADD TABLE chip_ledger;

-- Also create union_transactions if needed for the existing RPC
CREATE TABLE IF NOT EXISTS public.union_transactions (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    union_id        UUID NOT NULL,
    wallet_type     TEXT NOT NULL DEFAULT 'chip',
    direction       TEXT NOT NULL CHECK (direction IN ('in', 'out')),
    amount          NUMERIC(15,2) NOT NULL,
    club_id         UUID,
    notes           TEXT,
    performed_by    UUID,
    created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_union_transactions_union ON public.union_transactions(union_id);
CREATE INDEX IF NOT EXISTS idx_union_transactions_created ON public.union_transactions(created_at DESC);

ALTER TABLE public.union_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Union members can view transactions" ON public.union_transactions
    FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can log union transactions" ON public.union_transactions
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
