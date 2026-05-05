-- ══════════════════════════════════════════════════════════════════════════
-- MIGRATION: Fast lifetime source tier RPC
-- ══════════════════════════════════════════════════════════════════════════
-- BUG FOUND (Pass 4 Edge Cases/Adversarial Audit):
--   The API routes `diamond-transfer.js` and `live/gift.js` were paginating
--   through the user's ENTIRE LIFETIME history of transactions over HTTP
--   (fetching 1000 rows per request) to calculate `purchased_won_available`.
--   For older accounts that play daily and accumulate thousands of `game_reward`
--   transactions, this would trigger hundreds of HTTP requests, exceeding the 
--   Vercel Serverless Function timeout and causing a permanent denial of service.
--
-- FIX:
--   Migrate the aggregation logic to a Supabase RPC. PostgreSQL can aggregate
--   100,000 rows in milliseconds using the `user_id` index.
-- ══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.get_source_tier_available(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_purchased_won_total BIGINT := 0;
    v_free_earned_total BIGINT := 0;
    v_outbound_gifts_total BIGINT := 0;
    v_purchased_won_available BIGINT := 0;
BEGIN
    -- Sum all inbound purchased/won diamonds (excluding escrowed ones within last 72 hours)
    SELECT COALESCE(SUM(amount), 0) INTO v_purchased_won_total
    FROM diamond_transactions
    WHERE user_id = p_user_id
      AND amount > 0
      AND transaction_type IN ('purchase', 'stripe_purchase', 'diamond_purchase', 'tournament_prize', 'tournament_win', 'prize_pool', 'promo_purchased')
      AND NOT (transaction_type LIKE '%purchase%' AND created_at > now() - interval '72 hours');

    -- Sum all inbound free/earned diamonds (including escrowed purchased diamonds)
    SELECT COALESCE(SUM(amount), 0) INTO v_free_earned_total
    FROM diamond_transactions
    WHERE user_id = p_user_id
      AND amount > 0
      AND (
          transaction_type NOT IN ('purchase', 'stripe_purchase', 'diamond_purchase', 'tournament_prize', 'tournament_win', 'prize_pool', 'promo_purchased')
          OR (transaction_type LIKE '%purchase%' AND created_at > now() - interval '72 hours')
      );

    -- Sum all outbound gifts
    SELECT COALESCE(SUM(ABS(amount)), 0) INTO v_outbound_gifts_total
    FROM diamond_transactions
    WHERE user_id = p_user_id
      AND transaction_type IN ('diamond_gift_sent', 'live_gift_sent');

    -- Calculate available
    v_purchased_won_available := GREATEST(0, v_purchased_won_total - v_outbound_gifts_total);

    RETURN jsonb_build_object(
        'purchasedWonTotal', v_purchased_won_total,
        'freeEarnedTotal', v_free_earned_total,
        'purchasedWonAvailable', v_purchased_won_available
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_source_tier_available(uuid) TO authenticated, service_role;

COMMIT;
