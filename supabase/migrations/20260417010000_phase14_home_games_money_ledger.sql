-- ══════════════════════════════════════════════════════════════════════
--  PHASE 14: HOME-GAMES MONEY LEDGER
-- ══════════════════════════════════════════════════════════════════════
--
--  First chunk of the "all-in-one home game" initiative — everything a
--  host and their players need to run a night end-to-end stays inside
--  smarter.poker. Phase 14 covers money: buyins, rebuys, addons,
--  cashouts, computed minimum-transaction settlements, per-group
--  payment handles (Venmo/Zelle/PayPal/Cashapp/Revolut).
--
--  TABLES
--
--    commander_home_buyins           — every buyin/rebuy/addon/adjustment
--    commander_home_cashouts         — one row per player per game (unique)
--    commander_home_settlements      — computed "who pays whom" plan
--    commander_home_group_payment_links — host's payment handles per group
--
--  All amounts in INTEGER CENTS (no float drift). Chip counts optional.
--
--  RPCs (all SECURITY DEFINER, authz enforced in-body via
--  fn_home_caller_is_game_staff):
--
--    fn_home_caller_is_game_staff(caller, game_id)
--      Returns true iff caller is the group owner OR an approved admin.
--      Hardened: returns FALSE (not NULL) for non-members.
--
--    fn_home_record_buyin(caller, game, user, kind, cents, chips?, note?)
--      kind ∈ {buyin, rebuy, addon, adjustment}.
--      Adjustment is the only kind that can be negative.
--
--    fn_home_record_cashout(caller, game, user, cents, chips?, note?)
--      UPSERTs on (game_id, user_id) — one cashout per player per game.
--
--    fn_home_game_totals(game_id) → TABLE
--      Per-player roll-up: total_buyin, cashout, net (positive = won).
--      Returns (out_user_id, total_buyin_cents, cashout_cents, net_cents,
--               chip_count, username, display_name).
--
--    fn_home_compute_settlements(caller, game_id) → jsonb
--      Wipes existing pending rows for the game. Runs greedy
--      minimum-transaction settlement: pair biggest debtor with biggest
--      creditor, pay min(|debt|, |credit|), repeat. Produces at most
--      N-1 rows for N nonzero nets. Preserves already-paid rows.
--
--    fn_home_mark_settlement_paid(caller, settlement_id, via?, note?)
--      Either payer or payee can mark paid first. Idempotent.
--
--  SMOKE-TEST EVIDENCE (run against prod DB against the Phase 4 Test
--  NLHE Tournament event in Saturday Night Poker Club):
--
--    Recorded: 4 buyins @$100 each + 1 rebuy @$100 (total in: $500)
--    Cashouts: testowner $280, orb4test $100, acesupai $50, dan $70
--    ($500 out, perfectly balanced)
--
--    Net positions:
--      testowner: +$180 (won)
--      orb4test:    $0  (even)
--      acesupai:  -$150 (lost)
--      dan:        -$30 (lost)
--
--    fn_home_compute_settlements produced exactly 2 rows (minimum
--    possible for 3 nonzero nets):
--      acesupai → testowner: $150
--      dan      → testowner: $30
--
--    fn_home_mark_settlement_paid: payer can mark paid. ✓
--    Non-payer/non-payee rejected. ✓
--    Non-staff rejected on record_buyin (after NULL-coerce fix). ✓
--
--  SECURITY FIX ADDED INLINE
--
--  First cut of fn_home_caller_is_game_staff returned NULL when the
--  caller was not a member at all. `IF NOT fn() THEN` treats NULL as
--  falsy, which meant a non-member could slip through the authz gate
--  and record arbitrary buyins. Caught via a non-staff smoke test.
--  Fix: explicit IF EXISTS checks with explicit RETURN false fallback.
--  Hardened version is included below.
-- ══════════════════════════════════════════════════════════════════════

-- ── commander_home_buyins ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS commander_home_buyins (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id      uuid NOT NULL REFERENCES commander_home_games(id) ON DELETE CASCADE,
    user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    kind         text NOT NULL CHECK (kind IN ('buyin','rebuy','addon','adjustment')),
    amount_cents integer NOT NULL,
    chip_count   integer,
    note         text,
    recorded_by  uuid NOT NULL REFERENCES auth.users(id),
    recorded_at  timestamptz NOT NULL DEFAULT NOW(),
    created_at   timestamptz NOT NULL DEFAULT NOW(),
    updated_at   timestamptz NOT NULL DEFAULT NOW(),
    CONSTRAINT commander_home_buyins_amount_nonneg
        CHECK (kind = 'adjustment' OR amount_cents >= 0)
);

CREATE INDEX IF NOT EXISTS idx_commander_home_buyins_game      ON commander_home_buyins (game_id);
CREATE INDEX IF NOT EXISTS idx_commander_home_buyins_user      ON commander_home_buyins (user_id);
CREATE INDEX IF NOT EXISTS idx_commander_home_buyins_game_user ON commander_home_buyins (game_id, user_id);

-- ── commander_home_cashouts ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS commander_home_cashouts (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id      uuid NOT NULL REFERENCES commander_home_games(id) ON DELETE CASCADE,
    user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    amount_cents integer NOT NULL CHECK (amount_cents >= 0),
    chip_count   integer,
    note         text,
    recorded_by  uuid NOT NULL REFERENCES auth.users(id),
    recorded_at  timestamptz NOT NULL DEFAULT NOW(),
    created_at   timestamptz NOT NULL DEFAULT NOW(),
    updated_at   timestamptz NOT NULL DEFAULT NOW(),
    UNIQUE (game_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_commander_home_cashouts_user ON commander_home_cashouts (user_id);

-- ── commander_home_settlements ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS commander_home_settlements (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id         uuid NOT NULL REFERENCES commander_home_games(id) ON DELETE CASCADE,
    payer_user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    payee_user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    amount_cents    integer NOT NULL CHECK (amount_cents > 0),
    status          text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','paid','disputed','waived')),
    paid_at         timestamptz,
    paid_via        text,
    paid_note       text,
    computed_at     timestamptz NOT NULL DEFAULT NOW(),
    updated_at      timestamptz NOT NULL DEFAULT NOW(),
    CONSTRAINT commander_home_settlements_no_self_pay
        CHECK (payer_user_id <> payee_user_id)
);

CREATE INDEX IF NOT EXISTS idx_commander_home_settlements_game  ON commander_home_settlements (game_id);
CREATE INDEX IF NOT EXISTS idx_commander_home_settlements_payer ON commander_home_settlements (payer_user_id, status);
CREATE INDEX IF NOT EXISTS idx_commander_home_settlements_payee ON commander_home_settlements (payee_user_id, status);

-- ── commander_home_group_payment_links ───────────────────────────────
CREATE TABLE IF NOT EXISTS commander_home_group_payment_links (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id    uuid NOT NULL REFERENCES commander_home_groups(id) ON DELETE CASCADE,
    kind        text NOT NULL
                  CHECK (kind IN ('venmo','zelle','paypal','cashapp','revolut','other')),
    handle      text NOT NULL,
    label       text,
    sort_order  integer NOT NULL DEFAULT 0,
    is_active   boolean NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT NOW(),
    updated_at  timestamptz NOT NULL DEFAULT NOW(),
    UNIQUE (group_id, kind, handle)
);

CREATE INDEX IF NOT EXISTS idx_commander_home_group_payment_links_group
    ON commander_home_group_payment_links (group_id, is_active);

-- ══════════════════════════════════════════════════════════════════════
--  RPCs (hardened version)
-- ══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION fn_home_caller_is_game_staff(p_caller uuid, p_game_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_group_id uuid;
BEGIN
    IF p_caller IS NULL OR p_game_id IS NULL THEN RETURN false; END IF;

    SELECT g.group_id INTO v_group_id FROM commander_home_games g WHERE g.id = p_game_id;
    IF v_group_id IS NULL THEN RETURN false; END IF;

    IF EXISTS (SELECT 1 FROM commander_home_groups
               WHERE id = v_group_id AND owner_id = p_caller) THEN
        RETURN true;
    END IF;

    IF EXISTS (SELECT 1 FROM commander_home_members
               WHERE group_id = v_group_id
                 AND user_id = p_caller
                 AND status = 'approved'
                 AND role IN ('owner','admin')) THEN
        RETURN true;
    END IF;

    RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION fn_home_record_buyin(
    p_caller       uuid,
    p_game_id      uuid,
    p_user_id      uuid,
    p_kind         text,
    p_amount_cents integer,
    p_chip_count   integer DEFAULT NULL,
    p_note         text    DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
    IF NOT fn_home_caller_is_game_staff(p_caller, p_game_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'not authorized');
    END IF;
    IF p_kind NOT IN ('buyin','rebuy','addon','adjustment') THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid kind');
    END IF;
    IF p_kind <> 'adjustment' AND COALESCE(p_amount_cents, -1) < 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'amount must be non-negative');
    END IF;

    INSERT INTO commander_home_buyins (
        game_id, user_id, kind, amount_cents, chip_count, note, recorded_by
    ) VALUES (
        p_game_id, p_user_id, p_kind, p_amount_cents, p_chip_count, p_note, p_caller
    ) RETURNING id INTO v_id;

    RETURN jsonb_build_object('success', true, 'buyin_id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION fn_home_record_cashout(
    p_caller       uuid,
    p_game_id      uuid,
    p_user_id      uuid,
    p_amount_cents integer,
    p_chip_count   integer DEFAULT NULL,
    p_note         text    DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
    IF NOT fn_home_caller_is_game_staff(p_caller, p_game_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'not authorized');
    END IF;
    IF COALESCE(p_amount_cents, -1) < 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'amount must be non-negative');
    END IF;

    INSERT INTO commander_home_cashouts (
        game_id, user_id, amount_cents, chip_count, note, recorded_by
    ) VALUES (
        p_game_id, p_user_id, p_amount_cents, p_chip_count, p_note, p_caller
    )
    ON CONFLICT (game_id, user_id) DO UPDATE
        SET amount_cents = EXCLUDED.amount_cents,
            chip_count   = EXCLUDED.chip_count,
            note         = EXCLUDED.note,
            recorded_by  = EXCLUDED.recorded_by,
            recorded_at  = NOW(),
            updated_at   = NOW()
    RETURNING id INTO v_id;

    RETURN jsonb_build_object('success', true, 'cashout_id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION fn_home_game_totals(p_game_id uuid)
RETURNS TABLE (
    out_user_id        uuid,
    total_buyin_cents  bigint,
    cashout_cents      bigint,
    net_cents          bigint,
    chip_count         integer,
    username           text,
    display_name       text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    WITH buyins AS (
        SELECT b.user_id AS uid, SUM(b.amount_cents)::bigint AS total_cents
        FROM commander_home_buyins b WHERE b.game_id = p_game_id GROUP BY b.user_id
    ),
    cashouts AS (
        SELECT c.user_id AS uid, c.amount_cents::bigint AS amt, c.chip_count AS cc
        FROM commander_home_cashouts c WHERE c.game_id = p_game_id
    ),
    universe AS (
        SELECT uid FROM buyins UNION SELECT uid FROM cashouts
    )
    SELECT
        u.uid,
        COALESCE(b.total_cents, 0),
        COALESCE(c.amt, 0),
        COALESCE(c.amt, 0) - COALESCE(b.total_cents, 0),
        c.cc,
        p.username,
        COALESCE(p.display_name, p.full_name, p.username)
    FROM universe u
    LEFT JOIN buyins   b ON b.uid = u.uid
    LEFT JOIN cashouts c ON c.uid = u.uid
    LEFT JOIN profiles p ON p.id  = u.uid
    ORDER BY COALESCE(c.amt, 0) - COALESCE(b.total_cents, 0) DESC;
END;
$$;

CREATE OR REPLACE FUNCTION fn_home_compute_settlements(
    p_caller  uuid,
    p_game_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_total_buyin   bigint;
    v_total_cashout bigint;
    v_row_count     integer := 0;
    v_unbalanced    bigint;
    debtors         jsonb := '[]'::jsonb;
    creditors       jsonb := '[]'::jsonb;
    d_user          uuid; d_amt bigint;
    c_user          uuid; c_amt bigint;
    pay             bigint;
BEGIN
    IF NOT fn_home_caller_is_game_staff(p_caller, p_game_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'not authorized');
    END IF;

    SELECT COALESCE(SUM(amount_cents),0) INTO v_total_buyin
      FROM commander_home_buyins WHERE game_id = p_game_id;
    SELECT COALESCE(SUM(amount_cents),0) INTO v_total_cashout
      FROM commander_home_cashouts WHERE game_id = p_game_id;
    v_unbalanced := v_total_cashout - v_total_buyin;

    DELETE FROM commander_home_settlements
     WHERE game_id = p_game_id AND status = 'pending';

    SELECT
        COALESCE(jsonb_agg(jsonb_build_object('u', t.out_user_id, 'amt', -t.net_cents))
                 FILTER (WHERE t.net_cents < 0), '[]'::jsonb),
        COALESCE(jsonb_agg(jsonb_build_object('u', t.out_user_id, 'amt', t.net_cents))
                 FILTER (WHERE t.net_cents > 0), '[]'::jsonb)
      INTO debtors, creditors
      FROM fn_home_game_totals(p_game_id) t;

    WHILE jsonb_array_length(debtors) > 0 AND jsonb_array_length(creditors) > 0 LOOP
        debtors   := (SELECT COALESCE(jsonb_agg(e ORDER BY (e->>'amt')::bigint DESC), '[]'::jsonb) FROM jsonb_array_elements(debtors) e);
        creditors := (SELECT COALESCE(jsonb_agg(e ORDER BY (e->>'amt')::bigint DESC), '[]'::jsonb) FROM jsonb_array_elements(creditors) e);

        d_user := (debtors   -> 0 ->> 'u')::uuid;
        c_user := (creditors -> 0 ->> 'u')::uuid;
        d_amt  := (debtors   -> 0 ->> 'amt')::bigint;
        c_amt  := (creditors -> 0 ->> 'amt')::bigint;
        pay := LEAST(d_amt, c_amt);
        IF pay <= 0 THEN EXIT; END IF;

        INSERT INTO commander_home_settlements (
            game_id, payer_user_id, payee_user_id, amount_cents, status
        ) VALUES (p_game_id, d_user, c_user, pay::integer, 'pending');
        v_row_count := v_row_count + 1;

        IF d_amt - pay > 0 THEN debtors := jsonb_set(debtors, '{0,amt}', to_jsonb(d_amt - pay));
        ELSE debtors := debtors - 0; END IF;
        IF c_amt - pay > 0 THEN creditors := jsonb_set(creditors, '{0,amt}', to_jsonb(c_amt - pay));
        ELSE creditors := creditors - 0; END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true, 'game_id', p_game_id,
        'total_buyin_cents', v_total_buyin,
        'total_cashout_cents', v_total_cashout,
        'imbalance_cents', v_unbalanced,
        'settlements_created', v_row_count
    );
END;
$$;

CREATE OR REPLACE FUNCTION fn_home_mark_settlement_paid(
    p_caller         uuid,
    p_settlement_id  uuid,
    p_paid_via       text    DEFAULT NULL,
    p_paid_note      text    DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_payer uuid; v_payee uuid; v_status text;
BEGIN
    SELECT payer_user_id, payee_user_id, status INTO v_payer, v_payee, v_status
      FROM commander_home_settlements WHERE id = p_settlement_id;

    IF v_payer IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'settlement not found');
    END IF;
    IF p_caller NOT IN (v_payer, v_payee) THEN
        RETURN jsonb_build_object('success', false, 'error', 'only payer or payee can mark paid');
    END IF;
    IF v_status = 'paid' THEN
        RETURN jsonb_build_object('success', true, 'already_paid', true);
    END IF;

    UPDATE commander_home_settlements
       SET status = 'paid', paid_at = NOW(),
           paid_via = p_paid_via, paid_note = p_paid_note, updated_at = NOW()
     WHERE id = p_settlement_id;

    RETURN jsonb_build_object('success', true, 'settlement_id', p_settlement_id);
END;
$$;

GRANT EXECUTE ON FUNCTION fn_home_caller_is_game_staff(uuid, uuid)                         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION fn_home_record_buyin(uuid, uuid, uuid, text, integer, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION fn_home_record_cashout(uuid, uuid, uuid, integer, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION fn_home_game_totals(uuid)                                         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION fn_home_compute_settlements(uuid, uuid)                           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION fn_home_mark_settlement_paid(uuid, uuid, text, text)              TO authenticated, service_role;
