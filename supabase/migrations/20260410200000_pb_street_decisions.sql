-- =========================================================================
-- Poker Brain — Add street_decisions column to pb_hands
-- Stores per-street decision data as JSONB:
--   { "preflop": { "action": "RAISE", "equity": 72.5, ... }, "flop": { ... } }
-- Also updates pb_log_hand RPC to accept and persist the new column.
-- =========================================================================

-- 1. Add the column (idempotent)
alter table public.pb_hands
  add column if not exists street_decisions jsonb;

-- 2. Replace pb_log_hand to accept the new parameter
create or replace function public.pb_log_hand(
  p_session_id       uuid,
  p_hand_number      int,
  p_position         text,
  p_hole_cards       text[],
  p_board            text[],
  p_game_type        text,
  p_pot_size         numeric,
  p_bet_to_call      numeric,
  p_stack_size       numeric,
  p_equity           numeric,
  p_pot_odds         numeric,
  p_decision         text,
  p_raise_amount     numeric,
  p_confidence       numeric,
  p_reasoning        text,
  p_detected_auto    boolean default false,
  p_street_decisions jsonb default null
) returns uuid
language plpgsql security definer as $$
declare v_id uuid;
begin
  insert into public.pb_hands (
    session_id, user_id, hand_number, position, hole_cards, board, game_type,
    pot_size, bet_to_call, stack_size, equity, pot_odds, decision, raise_amount,
    confidence, reasoning, detected_auto, street_decisions
  ) values (
    p_session_id, auth.uid(), p_hand_number, p_position, p_hole_cards, p_board, p_game_type,
    p_pot_size, p_bet_to_call, p_stack_size, p_equity, p_pot_odds, p_decision, p_raise_amount,
    p_confidence, p_reasoning, p_detected_auto, p_street_decisions
  ) returning id into v_id;

  update public.pb_sessions
    set hands_played = hands_played + 1,
        total_decisions = total_decisions + 1
    where id = p_session_id and user_id = auth.uid();

  insert into public.pb_stats (user_id, total_hands, total_decisions, last_played_at)
    values (auth.uid(), 1, 1, now())
  on conflict (user_id) do update
    set total_hands = public.pb_stats.total_hands + 1,
        total_decisions = public.pb_stats.total_decisions + 1,
        last_played_at = now(),
        updated_at = now();

  return v_id;
end $$;

-- 3. Update grant to match new signature (17 params instead of 16)
grant execute on function public.pb_log_hand(uuid,int,text,text[],text[],text,numeric,numeric,numeric,numeric,numeric,text,numeric,numeric,text,boolean,jsonb) to authenticated;
