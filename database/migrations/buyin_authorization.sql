-- ═══════════════════════════════════════════════════════════════
-- 🎫 BUY-IN AUTHORIZATION — Request/Approve workflow
-- When buy_in_authorization is enabled on a table, players must
-- get admin approval before sitting down.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS buyin_requests (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  player_id       UUID NOT NULL,
  table_id        UUID NOT NULL,
  club_id         UUID NOT NULL,
  seat_index      SMALLINT NOT NULL,
  requested_amount DOUBLE PRECISION NOT NULL,
  approved_amount  DOUBLE PRECISION,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'used', 'expired')),
  reviewed_by     UUID,
  reviewed_at     TIMESTAMPTZ,
  review_notes    TEXT,
  used_at         TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '15 minutes'),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one pending request per player per table
CREATE UNIQUE INDEX IF NOT EXISTS idx_br_pending_player_table
  ON buyin_requests(player_id, table_id) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_br_table_status ON buyin_requests(table_id, status);
CREATE INDEX IF NOT EXISTS idx_br_club_status ON buyin_requests(club_id, status);
CREATE INDEX IF NOT EXISTS idx_br_player ON buyin_requests(player_id);
CREATE INDEX IF NOT EXISTS idx_br_created ON buyin_requests(created_at DESC);

-- RLS
ALTER TABLE buyin_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY br_service_all ON buyin_requests FOR ALL USING (true) WITH CHECK (true);

-- Helper: auto-expire old pending requests (call periodically or rely on seat.js check)
CREATE OR REPLACE FUNCTION expire_old_buyin_requests()
RETURNS integer LANGUAGE sql AS $$
  WITH expired AS (
    UPDATE buyin_requests
    SET status = 'expired'
    WHERE status = 'pending' AND expires_at < NOW()
    RETURNING id
  )
  SELECT count(*)::integer FROM expired;
$$;
