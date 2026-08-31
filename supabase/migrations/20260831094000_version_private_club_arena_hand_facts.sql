-- Version the private Club Arena fact store used by Leak Finder. The table
-- already exists in production; every statement is idempotent so new/local
-- environments receive the same privacy boundary.
CREATE TABLE IF NOT EXISTS public.ca_hand_facts (
  hand_id uuid NOT NULL,
  user_id uuid NOT NULL,
  club_id uuid,
  table_id uuid,
  tournament_id uuid,
  played_at timestamptz NOT NULL,
  game_variant text NOT NULL,
  big_blind numeric NOT NULL,
  seat smallint,
  position text NOT NULL,
  players_dealt smallint NOT NULL,
  hole_cards jsonb,
  hand_class text,
  invested numeric NOT NULL,
  returned numeric NOT NULL,
  net numeric NOT NULL,
  net_bb numeric NOT NULL,
  rake_paid numeric NOT NULL DEFAULT 0,
  vpip boolean NOT NULL DEFAULT false,
  pfr boolean NOT NULL DEFAULT false,
  three_bet boolean NOT NULL DEFAULT false,
  four_bet boolean NOT NULL DEFAULT false,
  faced_three_bet boolean NOT NULL DEFAULT false,
  folded_to_three_bet boolean NOT NULL DEFAULT false,
  had_cbet_flop_opp boolean NOT NULL DEFAULT false,
  cbet_flop boolean NOT NULL DEFAULT false,
  saw_flop boolean NOT NULL DEFAULT false,
  went_to_showdown boolean NOT NULL DEFAULT false,
  won_at_showdown boolean NOT NULL DEFAULT false,
  aggressive_actions smallint NOT NULL DEFAULT 0,
  passive_actions smallint NOT NULL DEFAULT 0,
  was_all_in boolean NOT NULL DEFAULT false,
  all_in_street text,
  all_in_at_risk numeric,
  all_in_equity numeric CHECK (all_in_equity IS NULL OR all_in_equity BETWEEN 0 AND 1),
  ev_returned numeric,
  ev_net numeric NOT NULL,
  ev_net_bb numeric NOT NULL,
  opponent_ids uuid[],
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hand_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_ca_hand_facts_user_time ON public.ca_hand_facts (user_id, played_at DESC);
CREATE INDEX IF NOT EXISTS idx_ca_hand_facts_user_pos ON public.ca_hand_facts (user_id, position);
CREATE INDEX IF NOT EXISTS idx_ca_hand_facts_user_class ON public.ca_hand_facts (user_id, hand_class) WHERE hand_class IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ca_hand_facts_allin ON public.ca_hand_facts (user_id, played_at DESC) WHERE was_all_in = true;
CREATE INDEX IF NOT EXISTS idx_ca_hand_facts_opponents ON public.ca_hand_facts USING gin (opponent_ids);

ALTER TABLE public.ca_hand_facts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ca_hand_facts_own_read ON public.ca_hand_facts;
CREATE POLICY ca_hand_facts_own_read ON public.ca_hand_facts
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.ca_hand_facts FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.ca_hand_facts FROM authenticated;
GRANT SELECT ON TABLE public.ca_hand_facts TO authenticated;
GRANT ALL ON TABLE public.ca_hand_facts TO service_role;

COMMENT ON TABLE public.ca_hand_facts IS
  'Private per-user Club Arena hand facts. hole_cards are protected by owner-only RLS; writes are service-role only.';
