-- Isolated schema fixture for exact installed cashout/ledger/receipt functions.
-- Delivery transport is a fixture boundary below; actual delivery assertions,
-- bank movement, autoledger, key ownership and invoice provenance run unchanged.
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth; CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'authenticated') $$;
GRANT USAGE ON SCHEMA auth TO authenticated,service_role;
CREATE PUBLICATION supabase_realtime;
CREATE TABLE ca_financial_epochs(id int PRIMARY KEY,is_current boolean); INSERT INTO ca_financial_epochs VALUES(1,true);
CREATE SEQUENCE chip_ledger_chain_seq;
CREATE TABLE public.accounting_cashier_events("id" uuid DEFAULT gen_random_uuid(),"contract_version" smallint,"cashout_id" uuid,"escrow_id" uuid,"source_transaction_id" uuid,"source_ledger_id" uuid,"invoice_id" uuid,"event_slot" text,"event_kind" text,"hold_event_id" uuid,"hold_invoice_id" uuid,"club_id" uuid,"player_id" uuid,"assigned_agent_id" uuid,"actor_user_id" uuid,"actor_role" text,"ledger_actor_user_id" uuid,"issuer_representative_id" uuid,"issuer_name" text,"player_name" text,"audience_user_ids" uuid[],"op_id" uuid,"operation_fingerprint" jsonb,"accepted_note" text,"transaction_note" text,"amount" numeric,"ledger_from_type" text,"ledger_from_entity_id" uuid,"ledger_to_type" text,"ledger_to_entity_id" uuid,"wallet_owner_id" uuid,"wallet_before" numeric,"wallet_after" numeric,"occurred_at" timestamp with time zone,"issued_at" timestamp with time zone);
ALTER TABLE accounting_cashier_events ADD PRIMARY KEY(id);
CREATE TABLE public.accounting_conversations("scope_id" uuid,"issuer_type" text,"issuer_id" uuid,"sender_id" uuid,"recipient_id" uuid,"conversation_id" uuid,"last_discussion_at" timestamp with time zone);
CREATE TABLE public.accounting_invoice_deliveries("invoice_id" uuid,"recipient_id" uuid,"message_id" uuid,"notification_id" uuid,"delivered_at" timestamp with time zone,"delivery_mode" text);
CREATE TABLE public.agents("id" uuid DEFAULT gen_random_uuid(),"user_id" uuid,"club_id" uuid,"membership_id" uuid,"role" text,"status" text,"parent_agent_id" uuid,"commission_rate" numeric,"player_rakeback_rate" numeric,"credit_limit" numeric,"credit_used" numeric,"is_prepaid" boolean,"business_balance" numeric,"player_balance" numeric,"promo_balance" numeric,"total_players" integer,"active_player_count" integer,"sub_agent_count" integer,"weekly_rake_generated" numeric,"lifetime_earnings" numeric,"joined_at" timestamp with time zone,"last_active_at" timestamp with time zone,"created_at" timestamp with time zone DEFAULT now(),"updated_at" timestamp with time zone DEFAULT now(),"auto_rakeback_enabled" boolean,"rakeback_percentage" numeric,"agent_wallet_balance" numeric,"player_wallet_balance" numeric,"promo_wallet_balance" numeric,"lifetime_rake_generated" numeric,"credit_control_revision" bigint);
ALTER TABLE agents ADD PRIMARY KEY(id);
CREATE TABLE public.cashout_requests("id" uuid DEFAULT gen_random_uuid(),"club_id" uuid,"player_id" uuid,"agent_id" uuid,"amount" numeric,"status" text,"player_note" text,"agent_note" text,"created_at" timestamp with time zone DEFAULT now(),"updated_at" timestamp with time zone DEFAULT now(),"acknowledged_at" timestamp with time zone,"completed_at" timestamp with time zone,"cancelled_at" timestamp with time zone);
ALTER TABLE cashout_requests ADD PRIMARY KEY(id);
CREATE TABLE public.chip_escrow("id" uuid DEFAULT gen_random_uuid(),"cashout_request_id" uuid,"player_id" uuid,"amount" numeric,"locked_at" timestamp with time zone,"released_at" timestamp with time zone,"release_type" text,"club_id" uuid,"table_id" uuid);
ALTER TABLE chip_escrow ADD PRIMARY KEY(id);
CREATE TABLE public.chip_ledger("id" uuid DEFAULT gen_random_uuid(),"performed_by" uuid,"from_type" text,"from_entity_id" uuid,"from_label" text,"to_type" text,"to_entity_id" uuid,"to_label" text,"amount" numeric,"category" text,"description" text,"notes" text,"club_id" uuid,"union_id" uuid,"table_id" uuid,"hand_id" uuid,"tournament_id" uuid,"created_at" timestamp with time zone DEFAULT now(),"idempotency_key" text,"correlation_id" uuid,"causation_id" uuid,"settlement_id" text,"epoch_id" integer,"actor_service" text,"db_role" text,"pre_from_balance" numeric,"post_from_balance" numeric,"pre_to_balance" numeric,"post_to_balance" numeric,"status" text DEFAULT 'posted',"metadata" jsonb,"chain_seq" bigint,"prev_hash" text,"row_hash" text);
ALTER TABLE chip_ledger ADD PRIMARY KEY(id);
CREATE TABLE public.chip_ledger_idem("idempotency_key" text,"leg_id" uuid,"created_at" timestamp with time zone DEFAULT now());
CREATE TABLE public.chip_transactions("id" uuid DEFAULT gen_random_uuid(),"club_id" uuid,"from_user_id" uuid,"to_user_id" uuid,"amount" numeric,"transaction_type" text,"notes" text,"related_cashout_id" uuid,"metadata" jsonb,"created_at" timestamp with time zone DEFAULT now(),"balance_after" numeric,"clawed_back" boolean,"reversible_until" timestamp with time zone,"is_reversed" boolean,"table_id" uuid);
ALTER TABLE chip_transactions ADD PRIMARY KEY(id);
CREATE TABLE public.club_members("club_id" uuid,"user_id" uuid,"role" text,"agent_id" uuid,"joined_at" timestamp with time zone,"parent_agent_id" uuid,"invited_by" uuid,"notes" text,"last_active_at" timestamp with time zone,"created_at" timestamp with time zone DEFAULT now(),"updated_at" timestamp with time zone DEFAULT now(),"is_bot" boolean,"status" text,"chip_balance" numeric,"diamonds" integer,"is_active" boolean,"orange_ball_status" text,"rank_level" integer,"credit_limit" numeric,"credit_used" numeric,"nickname" text,"last_active" timestamp with time zone,"tier" text,"trust_score" integer,"sessions_played" integer,"promo_balance" numeric,"chips_won" bigint,"chips_lost" bigint,"commission_rate" numeric,"rakeback_rate" numeric,"hands_played" integer,"total_rake_paid" bigint,"biggest_pot" bigint,"locked_chips" integer,"player_rakeback_pct" numeric,"held_chips" numeric,"display_name" text,"is_prepaid" boolean,"promo_received_total" numeric,"promo_wagered" numeric,"promo_playthrough_required" numeric,"missions_completed" integer,"membership_lifecycle_status" text,"departed_at" timestamp with time zone,"departed_by" uuid,"departure_reason" text,"player_rakeback_explicit" boolean);
CREATE TABLE public.clubs("id" uuid DEFAULT gen_random_uuid(),"name" text,"description" text,"owner_id" uuid,"created_at" timestamp with time zone DEFAULT now(),"is_union" boolean,"club_id" integer,"avatar_url" text,"is_public" boolean,"requires_approval" boolean,"gps_restricted" boolean,"settings" jsonb,"updated_at" timestamp with time zone DEFAULT now(),"union_id" uuid,"color_theme" text,"slug" text,"chip_treasury" numeric,"total_rake" numeric,"online_count" integer,"game_types" text[],"member_count" integer,"table_count" integer,"promo_balance" numeric,"code" text,"rake_percent" numeric,"rake_cap_bb" numeric,"max_tables" integer,"max_members" integer,"status" text,"hands_played" bigint,"logo_url" text,"banner_url" text,"game_variants" text[],"settlement_locked" boolean,"settlement_locked_until" timestamp with time zone,"auto_settlement_enabled" boolean,"auto_settlement_day" text,"auto_settlement_hour" integer,"club_commission_rate" numeric,"insurance_balance" numeric,"bbj_enabled" boolean,"player_level" integer,"hierarchy_level" integer,"level" integer,"player_threshold_current" integer,"player_threshold_next" integer,"hierarchy_units" numeric,"hierarchy_units_rounded_up" integer,"hierarchy_threshold_current" integer,"hierarchy_threshold_next" integer,"tags" text[],"average_rating" numeric,"game_type" text,"settlement_lock_until" timestamp with time zone,"card_image_url" text,"active_players" integer,"default_rake_percent" numeric,"rake_cap" numeric,"min_buyin_bb" integer,"max_buyin_bb" integer,"allow_straddle" boolean,"allow_run_it_twice" boolean,"allow_rabbit_hunt" boolean,"logo" text,"is_private" boolean,"min_buy_in" numeric,"max_buy_in" numeric,"default_game_type" text,"allow_insurance" boolean,"auto_approve_agents" boolean,"auto_settlement" boolean,"active_tables" integer,"admin_count" integer,"super_agent_count" integer,"agent_count" integer,"chip_pool" numeric,"bbj_rake_enabled" boolean,"spins_enabled" boolean,"spins_preseed_amount" integer,"spins_wallet_funding" text,"ticker_enabled" boolean,"guarantee_treasury_floor" numeric,"guarantee_enforcement_enabled" boolean,"tagline" text,"opening_checklist_started_at" timestamp with time zone,"lobby_message" text,"lobby_message_updated_at" timestamp with time zone,"message_revision" bigint,"lifecycle_status" text,"retired_at" timestamp with time zone,"retired_by" uuid,"retirement_reason" text,"asset" text,"is_platform" boolean,"hit_run_enabled" boolean,"hit_run_hands" integer);
ALTER TABLE clubs ADD PRIMARY KEY(id);
CREATE TABLE public.notifications("id" uuid DEFAULT gen_random_uuid(),"user_id" uuid,"type" text,"title" text,"message" text,"data" jsonb,"read" boolean,"created_at" timestamp with time zone DEFAULT now(),"updated_at" timestamp with time zone DEFAULT now(),"is_read" boolean,"action_url" text,"metadata" jsonb,"actor_id" uuid,"link" text,"read_at" timestamp with time zone);
ALTER TABLE notifications ADD PRIMARY KEY(id);
CREATE TABLE public.profiles("id" uuid DEFAULT gen_random_uuid(),"full_name" text,"display_name" text,"first_name" text,"last_name" text,"username" text,"email" text,"phone" text,"bio" text,"city" text,"state" text,"alias" text,"avatar_url" text,"role" text,"status" text,"is_vip" boolean,"is_horse" boolean,"is_admin" boolean,"is_online" boolean,"player_number" text,"diamonds" bigint,"diamond_balance" bigint,"diamond_multiplier" numeric,"level" integer,"tier" text,"skill_tier" text,"login_streak" integer,"streak_days" integer,"settings" jsonb,"preferences" jsonb,"social_page_id" uuid,"favorite_venue" uuid,"home_poker_club" uuid,"referred_by" uuid,"friends_count" integer,"hendon_total_cashes" integer,"hendon_total_earnings" numeric,"email_verified" boolean,"phone_verified" boolean,"onboarding_complete" boolean,"last_login" timestamp with time zone,"last_login_date" date,"last_seen" timestamp with time zone,"created_at" timestamp with time zone DEFAULT now(),"updated_at" timestamp with time zone DEFAULT now(),"training_view_mode" text,"last_trivia_date" date,"trivia_streak" integer,"trivia_high_score" integer,"total_hands_played" integer,"notification_token" text,"referral_code" text,"horse_status" character varying,"horse_profile" jsonb,"sounds_enabled" boolean,"vibrations_enabled" boolean,"show_stack_bb" boolean,"birth_year" integer,"favorite_hand_type" text,"card_back_preference" text,"country" text,"website" text,"twitter" text,"instagram" text,"hendon_url" text,"favorite_game" text,"favorite_hand" text,"home_casino" text,"cover_photo_url" text,"favorite_hand_plo" text,"app_settings" jsonb,"display_name_preference" text,"cover_photo_position" text,"tiktok" text,"telegram" text,"birthday" date,"hendon_biggest_cash" numeric,"use_real_name" boolean,"streak_count" integer,"access_tier" text,"vip_tier" text,"vip_expires_at" timestamp with time zone,"last_active" timestamp with time zone,"poker_near_me_preferences" jsonb,"can_review" boolean,"deleted_reviews_count" integer,"kyc_status" text,"kyc_provider" text,"kyc_inquiry_id" text,"kyc_completed_at" timestamp with time zone,"kyc_rejection_reason" text,"age_verified" boolean,"age_verified_at" timestamp with time zone,"jurisdiction_country" text,"mfa_required" boolean,"hub_preferences" jsonb,"friend_preferences" jsonb,"store_preferences" jsonb,"messenger_preferences" jsonb,"reels_preferences" jsonb,"over_18_attested_at" timestamp with time zone,"jurisdiction_region" text,"jurisdiction_acknowledged_at" timestamp with time zone,"home_games_onboarded_at" timestamp with time zone,"social_profile_completed" boolean,"is_farming_flagged" boolean,"stripe_customer_id" text,"club_arena_tos_accepted_at" timestamp with time zone,"bankroll_preferences" jsonb,"memory_games_preferences" jsonb,"news_preferences" jsonb,"video_library_preferences" jsonb,"memory_elo" integer,"arena_avatar_url" text,"equipped_frame" text,"equipped_aura" text,"use_avatar_as_profile_pic" boolean,"status_text" text,"player_tags" text[],"vip_lifetime_card_purchase_id" uuid,"lifetime_vip_since" timestamp with time zone,"trivia_preferences" jsonb,"trivia_preferences_revision" bigint,"vip_gift_id" uuid,"club_arena_tos_revision" text);
ALTER TABLE profiles ADD PRIMARY KEY(id);
CREATE TABLE public.settlement_invoices("id" uuid DEFAULT gen_random_uuid(),"club_id" uuid,"period_id" uuid,"invoice_type" text,"from_entity_type" text,"from_entity_id" text,"to_entity_type" text,"to_entity_id" text,"gross_amount" numeric,"net_amount" numeric,"deductions" numeric,"breakdown" jsonb,"status" text,"chip_transfer_id" uuid,"chips_transferred" boolean,"transferred_at" timestamp with time zone,"message_sent" boolean,"message_sent_at" timestamp with time zone,"notes" text,"created_at" timestamp with time zone DEFAULT now(),"updated_at" timestamp with time zone DEFAULT now(),"due_at" timestamp with time zone,"invoice_number" text,"adjusts_invoice_id" uuid,"overdue_at" timestamp with time zone,"reminders_sent" integer,"last_reminder_at" timestamp with time zone,"source_ledger_id" uuid,"source_credit_invoice_id" uuid,"source_credit_payment_id" uuid,"source_credit_reduction_operation_id" uuid,"source_union_presettlement_id" uuid);
ALTER TABLE settlement_invoices ADD PRIMARY KEY(id);
CREATE TABLE public.social_conversation_participants("id" uuid DEFAULT gen_random_uuid(),"conversation_id" uuid,"user_id" uuid,"joined_at" timestamp with time zone,"last_read_at" timestamp with time zone,"is_muted" boolean,"read_receipts_enabled" boolean,"is_pinned" boolean,"context_entity_id" uuid,"context_entity_type" text);
ALTER TABLE social_conversation_participants ADD PRIMARY KEY(id);
CREATE TABLE public.social_conversations("id" uuid DEFAULT gen_random_uuid(),"created_at" timestamp with time zone DEFAULT now(),"updated_at" timestamp with time zone DEFAULT now(),"last_message_at" timestamp with time zone,"last_message_preview" text,"is_group" boolean,"group_name" text,"is_request" boolean,"request_sender_id" uuid,"context_entity_id" uuid,"context_entity_type" text);
ALTER TABLE social_conversations ADD PRIMARY KEY(id);
CREATE TABLE public.social_messages("id" uuid DEFAULT gen_random_uuid(),"conversation_id" uuid,"sender_id" uuid,"content" text,"message_type" text,"created_at" timestamp with time zone DEFAULT now(),"updated_at" timestamp with time zone DEFAULT now(),"is_edited" boolean,"is_deleted" boolean,"read_at" timestamp with time zone,"media_metadata" jsonb,"request_id" uuid);
ALTER TABLE social_messages ADD PRIMARY KEY(id);
CREATE TABLE public.union_clubs("id" uuid DEFAULT gen_random_uuid(),"union_id" uuid,"club_id" uuid,"joined_at" timestamp with time zone,"club_commission_rate" numeric,"rate_cash" numeric,"rate_mtt" numeric,"rate_sng" numeric,"rate_spin" numeric,"rate_satellite" numeric);
ALTER TABLE union_clubs ADD PRIMARY KEY(id);

ALTER TABLE club_members ADD UNIQUE(club_id,user_id);
ALTER TABLE agents ADD UNIQUE(club_id,user_id);
ALTER TABLE social_conversation_participants ADD UNIQUE(conversation_id,user_id);
ALTER TABLE accounting_cashier_events ADD UNIQUE(cashout_id,event_slot),ADD UNIQUE NULLS NOT DISTINCT(actor_user_id,op_id);
ALTER TABLE chip_ledger_idem ADD PRIMARY KEY(idempotency_key);
ALTER TABLE chip_ledger ADD CONSTRAINT chip_ledger_category_check CHECK(category IN('escrow_hold','escrow_release','adjustment')),
 ADD CONSTRAINT chip_ledger_from_type_check CHECK(from_type IN('escrow','player_wallet','agent_wallet','club_treasury','settlement_suspense'));
CREATE TABLE club_messenger_staff_notice_groups(club_id uuid PRIMARY KEY,conversation_id uuid UNIQUE NOT NULL);
ALTER TABLE chip_ledger DROP CONSTRAINT chip_ledger_category_check,DROP CONSTRAINT chip_ledger_from_type_check;
ALTER TABLE chip_transactions ADD CONSTRAINT fk_chip_transactions_to_user_id_profiles FOREIGN KEY (to_user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE chip_transactions ADD CONSTRAINT fk_chip_transactions_from_user_id_profiles FOREIGN KEY (from_user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE chip_transactions ADD CONSTRAINT fk_chip_transactions_club_id_clubs FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE SET NULL NOT VALID;
ALTER TABLE chip_ledger ADD CONSTRAINT chip_ledger_from_type_check CHECK ((from_type = ANY (ARRAY['player_wallet'::text, 'club_treasury'::text, 'union_bank'::text, 'agent_wallet'::text, 'system_mint'::text, 'system_burn'::text, 'table_stack'::text, 'promo_wallet'::text, 'club_wallet'::text, 'union_wallet'::text, 'bbj_pool'::text, 'spin_reserve'::text, 'insurance_bank'::text, 'escrow'::text, 'prize_liability'::text, 'bounty_liability'::text, 'rakeback_payable'::text, 'refund_payable'::text, 'settlement_suspense'::text, 'issuance_reserve'::text, 'chip_retirement'::text, 'credit_facility'::text, 'credit_receivable'::text, 'opening_setup'::text, 'leaderboard_round'::text]))) NOT VALID;
ALTER TABLE chip_ledger ADD CONSTRAINT chip_ledger_to_type_check CHECK ((to_type = ANY (ARRAY['player_wallet'::text, 'club_treasury'::text, 'union_bank'::text, 'agent_wallet'::text, 'system_mint'::text, 'system_burn'::text, 'table_stack'::text, 'promo_wallet'::text, 'club_wallet'::text, 'union_wallet'::text, 'bbj_pool'::text, 'spin_reserve'::text, 'insurance_bank'::text, 'escrow'::text, 'prize_liability'::text, 'bounty_liability'::text, 'rakeback_payable'::text, 'refund_payable'::text, 'settlement_suspense'::text, 'issuance_reserve'::text, 'chip_retirement'::text, 'credit_facility'::text, 'credit_receivable'::text, 'opening_setup'::text, 'leaderboard_round'::text]))) NOT VALID;
ALTER TABLE accounting_cashier_events ADD CONSTRAINT accounting_cashier_events_contract_version_check CHECK ((contract_version = 1));
ALTER TABLE accounting_cashier_events ADD CONSTRAINT accounting_cashier_events_event_slot_check CHECK ((event_slot = ANY (ARRAY['hold'::text, 'terminal'::text])));
ALTER TABLE accounting_cashier_events ADD CONSTRAINT accounting_cashier_events_event_kind_check CHECK ((event_kind = ANY (ARRAY['hold'::text, 'approval'::text, 'cancellation'::text, 'decline'::text, 'expiry_refund'::text])));
ALTER TABLE accounting_cashier_events ADD CONSTRAINT accounting_cashier_events_actor_role_check CHECK ((actor_role = ANY (ARRAY['owner'::text, 'co_owner'::text, 'admin'::text, 'super_agent'::text, 'agent'::text, 'sub_agent'::text, 'player'::text, 'member'::text, 'system'::text])));
ALTER TABLE accounting_cashier_events ADD CONSTRAINT accounting_cashier_events_amount_check CHECK (((amount > (0)::numeric) AND ((amount)::text <> ALL (ARRAY['NaN'::text, 'Infinity'::text, '-Infinity'::text]))));
ALTER TABLE accounting_cashier_events ADD CONSTRAINT accounting_cashier_events_check CHECK ((((event_kind = 'hold'::text) AND (event_slot = 'hold'::text) AND (hold_event_id IS NULL) AND (hold_invoice_id IS NULL)) OR ((event_kind <> 'hold'::text) AND (event_slot = 'terminal'::text) AND (hold_event_id IS NOT NULL) AND (hold_invoice_id IS NOT NULL))));
ALTER TABLE accounting_cashier_events ADD CONSTRAINT accounting_cashier_events_check1 CHECK ((((event_kind = 'expiry_refund'::text) AND (actor_user_id IS NULL) AND (actor_role = 'system'::text)) OR ((event_kind <> 'expiry_refund'::text) AND (actor_user_id IS NOT NULL) AND (actor_role <> 'system'::text))));
ALTER TABLE accounting_cashier_events ADD CONSTRAINT accounting_cashier_events_check2 CHECK (((issued_at >= occurred_at) AND (cardinality(audience_user_ids) >= 2)));
ALTER TABLE accounting_cashier_events ADD CONSTRAINT accounting_cashier_events_cashout_id_fkey FOREIGN KEY (cashout_id) REFERENCES cashout_requests(id);
ALTER TABLE accounting_cashier_events ADD CONSTRAINT accounting_cashier_events_escrow_id_fkey FOREIGN KEY (escrow_id) REFERENCES chip_escrow(id);
ALTER TABLE accounting_cashier_events ADD CONSTRAINT accounting_cashier_events_source_transaction_id_fkey FOREIGN KEY (source_transaction_id) REFERENCES chip_transactions(id);
ALTER TABLE accounting_cashier_events ADD CONSTRAINT accounting_cashier_events_source_ledger_id_fkey FOREIGN KEY (source_ledger_id) REFERENCES chip_ledger(id);
ALTER TABLE accounting_cashier_events ADD CONSTRAINT accounting_cashier_events_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES settlement_invoices(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE accounting_cashier_events ADD CONSTRAINT accounting_cashier_events_hold_event_id_fkey FOREIGN KEY (hold_event_id) REFERENCES accounting_cashier_events(id);
ALTER TABLE accounting_cashier_events ADD CONSTRAINT accounting_cashier_events_hold_invoice_id_fkey FOREIGN KEY (hold_invoice_id) REFERENCES settlement_invoices(id);
ALTER TABLE chip_ledger ADD CONSTRAINT chip_ledger_category_check CHECK ((category = ANY (ARRAY['buyin'::text, 'cashout'::text, 'rake'::text, 'commission'::text, 'transfer'::text, 'player_funding'::text, 'agent_funding'::text, 'mint'::text, 'burn'::text, 'legacy_seed_reconcile'::text, 'rakeback'::text, 'settlement'::text, 'tournament_buyin'::text, 'tournament_prize'::text, 'bounty'::text, 'adjustment'::text, 'refund'::text, 'addon'::text, 'rebuy'::text, 'table_cashout'::text, 'tournament_refund'::text, 'bbj_contribution'::text, 'bbj_payout'::text, 'promo'::text, 'promo_release'::text, 'promo_send'::text, 'credit_draw'::text, 'credit_repayment'::text, 'insurance'::text, 'spin_entry'::text, 'spin_prize'::text, 'overlay'::text, 'correction'::text, 'reversal'::text, 'escrow_hold'::text, 'escrow_release'::text, 'treasury_transfer'::text, 'horse_funding'::text, 'fee'::text, 'eco'::text, 'pnl_settlement'::text, 'union_send'::text, 'cashier_send'::text, 'cashier_claim_back'::text, 'ticket_issue'::text, 'ticket_redeem'::text, 'club_opening_allocation'::text, 'leaderboard_payout'::text, 'club_bank_send'::text, 'club_bank_claim'::text, 'agent_send'::text, 'agent_claim'::text, 'union_settlement'::text, 'wheel_prize'::text, 'plinko_prize'::text, 'crash_prize'::text, 'crossing_prize'::text, 'mines_prize'::text]))) NOT VALID;
-- TIER: 3. AUTHOR: Codex. AFFECTS: new club notice board only.
-- WHY: Club Messenger needs an administrator-maintained, member-readable board.
-- Payout statuses describe posted notices; this never moves money or settles invoices.
-- Rollback: revoke API execution and remove publication membership, retaining tables
-- and audit history. Do not drop posted records to undo a client release.
BEGIN;
DO $$ BEGIN
 IF to_regclass('public.club_members') IS NULL OR to_regclass('public.clubs') IS NULL
 THEN RAISE EXCEPTION 'Club membership schema required'; END IF;
 IF to_regclass('public.club_notice_board') IS NOT NULL THEN
 RAISE EXCEPTION 'Notice board already exists; inspect installation instead of replaying'; END IF;
END $$;
CREATE TABLE public.club_notice_board (
 id uuid PRIMARY KEY,
 club_id uuid NOT NULL REFERENCES public.clubs(id),
 author_id uuid NOT NULL,
 content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 4000),
 status text NOT NULL CHECK (status IN ('notice','pending_payout','paid')),
 is_pinned boolean NOT NULL DEFAULT false,
 is_deleted boolean NOT NULL DEFAULT false,
 version bigint NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK (NOT is_pinned OR (status='pending_payout' AND NOT is_deleted))
);
CREATE INDEX club_notice_board_history ON public.club_notice_board(club_id,created_at DESC,id DESC) WHERE NOT is_deleted;
CREATE INDEX club_notice_board_pins ON public.club_notice_board(club_id,created_at DESC,id DESC) WHERE is_pinned AND status='pending_payout' AND NOT is_deleted;
CREATE TABLE public.club_notice_board_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 notice_id uuid NOT NULL REFERENCES public.club_notice_board(id),
 actor_id uuid NOT NULL,
 action text NOT NULL,
 before_row jsonb,
 after_row jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX club_notice_board_audit_notice ON public.club_notice_board_audit(notice_id);
ALTER TABLE public.club_notice_board ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_notice_board_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.club_notice_board,public.club_notice_board_audit FROM anon,authenticated;
GRANT SELECT ON public.club_notice_board TO authenticated;

CREATE FUNCTION public.fn_club_notice_access(p_club_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
 SELECT EXISTS(SELECT 1 FROM public.club_members WHERE club_id=p_club_id
 AND user_id=auth.uid() AND is_active AND membership_lifecycle_status='active'
 AND status IN ('active','approved'));
$$;
REVOKE ALL ON FUNCTION public.fn_club_notice_access(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_club_notice_access(uuid) TO authenticated;
CREATE POLICY club_notice_member_read ON public.club_notice_board FOR SELECT TO authenticated
 USING (public.fn_club_notice_access(club_id));

-- Only the JWT-verifying API may supply p_actor. Membership is checked again
-- within this transaction and locked against concurrent membership revocation.
CREATE FUNCTION public.fn_club_notice_board(p_actor uuid,p_club uuid,p_action text,p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE
 v_role text; v_old public.club_notice_board; v_new public.club_notice_board;
 v_id uuid; v_before timestamptz; v_before_id uuid; v_rows jsonb; v_pins jsonb;
 v_status text; v_content text; v_pin boolean;
BEGIN
 SELECT role INTO v_role FROM public.club_members WHERE club_id=p_club AND user_id=p_actor
 AND is_active AND membership_lifecycle_status='active' AND status IN ('active','approved') FOR SHARE;
 IF v_role IS NULL THEN RAISE EXCEPTION 'Active Club Membership Required' USING ERRCODE='42501'; END IF;
 IF p_action='read' THEN
  IF (p_payload->>'before') IS NULL <> ((p_payload->>'beforeId') IS NULL) THEN
   RAISE EXCEPTION 'Both Cursor Fields Required' USING ERRCODE='22023'; END IF;
  v_before := (p_payload->>'before')::timestamptz; v_before_id := (p_payload->>'beforeId')::uuid;
  SELECT coalesce(jsonb_agg(to_jsonb(n) ORDER BY n.created_at,n.id),'[]'::jsonb) INTO v_rows FROM (
   SELECT * FROM public.club_notice_board WHERE club_id=p_club AND NOT is_deleted
   AND (v_before IS NULL OR (created_at,id)<(v_before,v_before_id))
   ORDER BY created_at DESC,id DESC LIMIT 51
  ) n;
  SELECT coalesce(jsonb_agg(to_jsonb(n) ORDER BY n.created_at,n.id),'[]'::jsonb) INTO v_pins FROM (
   SELECT * FROM public.club_notice_board WHERE club_id=p_club AND NOT is_deleted
   AND is_pinned AND status='pending_payout' ORDER BY created_at,id
  ) n;
  RETURN jsonb_build_object('rows',v_rows,'pinned',v_pins,'canManage',v_role IN ('owner','admin'));
 END IF;
 IF v_role NOT IN ('owner','admin') THEN RAISE EXCEPTION 'Club Admin Or Owner Required' USING ERRCODE='42501'; END IF;
 IF p_action NOT IN ('create','update','delete') OR p_action IS NULL THEN
 RAISE EXCEPTION 'Invalid Board Action' USING ERRCODE='22023'; END IF;
 -- Serialize club writes, including the bounded pinned panel.
 PERFORM 1 FROM public.clubs WHERE id=p_club FOR UPDATE;
 v_id := (p_payload->>'id')::uuid;
 IF v_id IS NULL THEN RAISE EXCEPTION 'Entry ID Required' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_old FROM public.club_notice_board WHERE id=v_id FOR UPDATE;
 IF p_action='create' AND v_old.id IS NOT NULL THEN
  IF v_old.club_id=p_club AND v_old.author_id=p_actor AND v_old.version=1
   AND v_old.content=p_payload->>'content' AND v_old.status=p_payload->>'status'
   AND v_old.is_pinned=coalesce((p_payload->>'is_pinned')::boolean,false)
  THEN RETURN to_jsonb(v_old); END IF;
  RAISE EXCEPTION 'Entry Already Exists' USING ERRCODE='40001';
 END IF;
 IF p_action<>'create' THEN
  IF v_old.id IS NULL OR v_old.club_id<>p_club OR v_old.is_deleted THEN
   RAISE EXCEPTION 'Entry Unavailable' USING ERRCODE='P0002'; END IF;
  IF (p_payload->>'version')::bigint IS DISTINCT FROM v_old.version THEN
   RAISE EXCEPTION 'Entry Changed. Refresh And Try Again.' USING ERRCODE='40001'; END IF;
 END IF;
 IF p_action='delete' THEN
  UPDATE public.club_notice_board SET is_deleted=true,is_pinned=false,content='Removed',
   version=version+1,updated_at=clock_timestamp() WHERE id=v_id RETURNING * INTO v_new;
 ELSE
  v_content := btrim(coalesce(p_payload->>'content',v_old.content));
  v_status := coalesce(p_payload->>'status',v_old.status);
  v_pin := coalesce((p_payload->>'is_pinned')::boolean,v_old.is_pinned,false);
  IF v_content IS NULL OR char_length(v_content) NOT BETWEEN 1 AND 4000
   OR v_status IS NULL OR v_status NOT IN ('notice','pending_payout','paid') THEN
   RAISE EXCEPTION 'Invalid Board Entry' USING ERRCODE='22023'; END IF;
  IF v_status<>'pending_payout' THEN v_pin:=false; END IF;
  IF v_pin AND (SELECT count(*) FROM public.club_notice_board WHERE club_id=p_club
    AND is_pinned AND NOT is_deleted AND id<>v_id)>=20 THEN
   RAISE EXCEPTION 'Unpin A Request Before Pinning Another (Maximum 20)' USING ERRCODE='22023'; END IF;
  IF p_action='create' THEN
   INSERT INTO public.club_notice_board(id,club_id,author_id,content,status,is_pinned)
    VALUES(v_id,p_club,p_actor,v_content,v_status,v_pin) RETURNING * INTO v_new;
  ELSE
   UPDATE public.club_notice_board SET content=v_content,status=v_status,is_pinned=v_pin,
    version=version+1,updated_at=clock_timestamp() WHERE id=v_id RETURNING * INTO v_new;
  END IF;
 END IF;
 INSERT INTO public.club_notice_board_audit(notice_id,actor_id,action,before_row,after_row)
 VALUES(v_id,p_actor,p_action,CASE WHEN v_old.id IS NULL THEN NULL ELSE to_jsonb(v_old) END,to_jsonb(v_new));
 RETURN to_jsonb(v_new);
END $$;
REVOKE ALL ON FUNCTION public.fn_club_notice_board(uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_club_notice_board(uuid,uuid,text,jsonb) TO service_role;
-- Tombstone updates retain the club key for authorized realtime removal.
ALTER PUBLICATION supabase_realtime ADD TABLE public.club_notice_board;
DO $$ BEGIN
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.club_notice_board'::regclass)
 OR has_table_privilege('authenticated','public.club_notice_board','UPDATE')
 OR has_function_privilege('authenticated','public.fn_club_notice_board(uuid,uuid,text,jsonb)','EXECUTE')
 THEN RAISE EXCEPTION 'Notice Board Authorization Assertion Failed'; END IF;
END $$;
COMMIT;
-- ROLLBACK (new migration, retain source data):
-- BEGIN;
-- REVOKE EXECUTE ON FUNCTION public.fn_club_notice_board(uuid,uuid,text,jsonb) FROM service_role;
-- ALTER PUBLICATION supabase_realtime DROP TABLE public.club_notice_board;
-- COMMIT;
CREATE OR REPLACE FUNCTION public.fn_arena_name(p_alias text, p_username text, p_display_name text, p_first_name text, p_last_name text, p_full_name text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH real_name AS (
    SELECT COALESCE(
             NULLIF(btrim(p_full_name), ''),
             NULLIF(btrim(concat_ws(' ',
               NULLIF(btrim(p_first_name), ''),
               NULLIF(btrim(p_last_name),  ''))), '')
           ) AS rn
  )
  SELECT COALESCE(
           NULLIF(btrim(p_alias), ''),
           NULLIF(btrim(p_username), ''),
           CASE
             WHEN NULLIF(btrim(p_display_name), '') IS NOT NULL
              AND (SELECT rn FROM real_name) IS NOT NULL
              AND lower(btrim(p_display_name)) = lower((SELECT rn FROM real_name))
             THEN NULL
             ELSE NULLIF(btrim(p_display_name), '')
           END,
           'Player')
$function$;
CREATE OR REPLACE FUNCTION public.fn_ca_current_epoch()
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$ SELECT id FROM public.ca_financial_epochs WHERE is_current LIMIT 1 $function$;
CREATE OR REPLACE FUNCTION public.fn_club_messenger_staff_role(p_club uuid, p_user uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
 SELECT CASE WHEN c.owner_id=p_user THEN 'owner'
  WHEN m.role IN ('co_owner','admin','super_agent','agent','sub_agent') THEN m.role
  WHEN a.role IN ('super_agent','agent','sub_agent') AND a.status='active' THEN a.role END
 FROM public.clubs c JOIN public.club_members m ON m.club_id=c.id AND m.user_id=p_user
 LEFT JOIN public.agents a ON a.club_id=c.id AND a.user_id=p_user
 WHERE c.id=p_club AND m.is_active=true AND m.status IN ('active','approved') AND m.membership_lifecycle_status='active'
 LIMIT 1
$function$;
CREATE OR REPLACE FUNCTION public.fn_sync_club_staff_notice_group(p_club uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_conversation uuid; v_name text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('club-staff-notice-group:'||p_club::text,0));
 SELECT name INTO v_name FROM public.clubs WHERE id=p_club;
 IF NOT FOUND THEN
  DELETE FROM public.social_conversation_participants WHERE conversation_id IN(SELECT conversation_id FROM public.club_messenger_staff_notice_groups WHERE club_id=p_club);
  RETURN;
 END IF;
 SELECT conversation_id INTO v_conversation FROM public.club_messenger_staff_notice_groups WHERE club_id=p_club;
 IF v_conversation IS NULL AND EXISTS(SELECT 1 FROM public.club_members m WHERE m.club_id=p_club AND public.fn_club_messenger_staff_role(p_club,m.user_id) IS NOT NULL) THEN
  INSERT INTO public.social_conversations(is_group,is_request,group_name) VALUES(true,false,v_name||' - Notice Board') RETURNING id INTO v_conversation;
  INSERT INTO public.club_messenger_staff_notice_groups(club_id,conversation_id) VALUES(p_club,v_conversation);
 END IF;
 IF v_conversation IS NULL THEN RETURN; END IF;
 DELETE FROM public.social_conversation_participants p WHERE p.conversation_id=v_conversation AND public.fn_club_messenger_staff_role(p_club,p.user_id) IS NULL;
 INSERT INTO public.social_conversation_participants(conversation_id,user_id)
 SELECT v_conversation,m.user_id FROM public.club_members m WHERE m.club_id=p_club AND public.fn_club_messenger_staff_role(p_club,m.user_id) IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM public.social_conversation_participants p WHERE p.conversation_id=v_conversation AND p.user_id=m.user_id);
END $function$;
CREATE OR REPLACE FUNCTION public.fn_guard_club_staff_notice_participant()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_club uuid;
BEGIN
 SELECT club_id INTO v_club FROM public.club_messenger_staff_notice_groups WHERE conversation_id=NEW.conversation_id;
 IF v_club IS NOT NULL AND public.fn_club_messenger_staff_role(v_club,NEW.user_id) IS NULL THEN RAISE EXCEPTION 'Active Club Staff Required' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION public.fn_club_staff_notice_role_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
 IF TG_TABLE_NAME='clubs' THEN
  PERFORM public.fn_sync_club_staff_notice_group(NEW.id); RETURN NULL;
 END IF;
 IF TG_OP<>'DELETE' THEN PERFORM public.fn_sync_club_staff_notice_group(NEW.club_id); END IF;
 IF TG_OP='DELETE' OR (TG_OP='UPDATE' AND OLD.club_id IS DISTINCT FROM NEW.club_id) THEN PERFORM public.fn_sync_club_staff_notice_group(OLD.club_id); END IF;
 RETURN NULL;
END $function$;
CREATE OR REPLACE FUNCTION public.fn_cashier_member_is_active(p_club uuid, p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 SELECT EXISTS (
  SELECT 1 FROM public.club_members m WHERE m.club_id=p_club AND m.user_id=p_user
   AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=m.user_id AND p.status='deleted')
   AND coalesce(m.status,'active') IN ('active','approved')
   AND (coalesce(m.role,'player') NOT IN ('super_agent','agent','sub_agent')
    OR EXISTS (SELECT 1 FROM public.agents a WHERE a.club_id=m.club_id
     AND a.user_id=m.user_id AND a.status='active'))
 )
$function$;
CREATE OR REPLACE FUNCTION public.fn_club_bank_role(p_club_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN p_club_id IS NULL THEN NULL
    WHEN EXISTS (
      SELECT 1 FROM public.clubs c
       WHERE c.id = p_club_id
         AND c.owner_id = coalesce(p_user_id, auth.uid())
    ) THEN 'owner'
    ELSE (
      SELECT m.role
        FROM public.club_members m
       WHERE m.club_id = p_club_id
         AND m.user_id = coalesce(p_user_id, auth.uid())
         AND public.fn_cashier_member_is_active(m.club_id, m.user_id)
       LIMIT 1
    )
  END
$function$;
CREATE OR REPLACE FUNCTION public.fn_club_is_in_downline(p_club_id uuid, p_upline_user_id uuid, p_member_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 WITH RECURSIVE chain(parent,depth,path) AS (
  SELECT m.agent_id,1,ARRAY[m.user_id] FROM public.club_members m
  WHERE m.club_id=p_club_id AND m.user_id=p_member_user_id AND m.agent_id IS NOT NULL
   AND p_upline_user_id IS NOT NULL AND p_member_user_id IS NOT NULL AND p_upline_user_id<>p_member_user_id
   AND public.fn_cashier_member_is_active(m.club_id,m.user_id)
  UNION ALL
  SELECT m.agent_id,c.depth+1,c.path||m.user_id FROM chain c
  JOIN public.club_members m ON m.club_id=p_club_id AND m.user_id=c.parent
  WHERE c.depth<20 AND m.agent_id IS NOT NULL AND NOT m.user_id=ANY(c.path)
   AND public.fn_cashier_member_is_active(m.club_id,m.user_id)
 ) SELECT EXISTS(SELECT 1 FROM chain WHERE parent=p_upline_user_id)
$function$;
CREATE OR REPLACE FUNCTION public.fn_club_cashier_scope(p_club_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case public.fn_club_bank_role(p_club_id, coalesce(p_user_id, auth.uid()))
    when 'owner'       then 'all'
    when 'co_owner'    then 'all'
    when 'admin'       then 'all'
    when 'super_agent' then 'downline'
    when 'agent'       then 'downline'
    when 'sub_agent'   then 'downline'
    else 'none'
  end;
$function$;
CREATE OR REPLACE FUNCTION public.fn_club_cashier_can_transact(p_club_id uuid, p_actor uuid, p_target uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN p_club_id IS NULL OR p_actor IS NULL OR p_target IS NULL THEN false
    ELSE (
      SELECT CASE s.scope
        WHEN 'all'      THEN true
        WHEN 'downline' THEN public.fn_club_is_in_downline(p_club_id, p_actor, p_target)
        ELSE false
      END
      FROM (SELECT public.fn_club_cashier_scope(p_club_id, p_actor) AS scope) s
    )
  END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_cashier_lock_authority(p_club_id uuid, p_actor uuid, p_target uuid, p_assigned uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE before_ids uuid[];after_ids uuid[];
BEGIN
 WITH RECURSIVE chain AS (
  SELECT m.user_id,m.agent_id,0 depth FROM public.club_members m WHERE m.club_id=p_club_id AND m.user_id=ANY(ARRAY[p_actor,p_target,p_assigned])
  UNION ALL SELECT m.user_id,m.agent_id,c.depth+1 FROM chain c JOIN public.club_members m ON m.club_id=p_club_id AND m.user_id=c.agent_id WHERE c.depth<20
 ) SELECT array_agg(DISTINCT user_id ORDER BY user_id) INTO before_ids FROM chain;
 PERFORM m.user_id FROM public.club_members m WHERE m.club_id=p_club_id AND m.user_id=ANY(before_ids) ORDER BY m.user_id FOR UPDATE;
 WITH RECURSIVE chain AS (
  SELECT m.user_id,m.agent_id,0 depth FROM public.club_members m WHERE m.club_id=p_club_id AND m.user_id=ANY(ARRAY[p_actor,p_target,p_assigned])
  UNION ALL SELECT m.user_id,m.agent_id,c.depth+1 FROM chain c JOIN public.club_members m ON m.club_id=p_club_id AND m.user_id=c.agent_id WHERE c.depth<20
 ) SELECT array_agg(DISTINCT user_id ORDER BY user_id) INTO after_ids FROM chain;
 IF before_ids IS DISTINCT FROM after_ids THEN RAISE EXCEPTION 'cashier_authority_changed_during_lock' USING ERRCODE='55000';END IF;
END $function$;
CREATE OR REPLACE FUNCTION public.fn_ensure_agent_row(p_club_id uuid, p_user_id uuid, p_role text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_id    uuid;
  v_union uuid;
  v_min   numeric;
  v_role  text;
  v_staff boolean;
begin
  -- Serialize the existing agreement before any operation/hierarchy/row lock.
  -- Nested callers reacquire the same transaction lock; no new money path.
  IF p_club_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('agent-agreement:'||p_club_id::text,0));
  END IF;

  select a.id into v_id
    from agents a
   where a.club_id = p_club_id and a.user_id = p_user_id
   for update;
  if v_id is not null then
    return v_id;
  end if;

  -- agents.role CHECK still admits only the three agent tiers, so a staff
  -- wallet holder is stored as 'super_agent'. The data lies about who holds the
  -- wallet; club_members.role is the truth and every rule reads it. Recorded as
  -- P3 debt for phase 7, not fixed here, because relaxing that CHECK is a table
  -- lock on agents and this migration deliberately takes none.
  v_role := case when p_role in ('super_agent', 'agent', 'sub_agent') then p_role
                 else 'super_agent' end;

  v_staff := exists (
    select 1 from club_members cm
     where cm.club_id = p_club_id and cm.user_id = p_user_id
       and cm.role in ('co_owner', 'admin'));

  select coalesce(uc.union_id, c.union_id) into v_union
    from clubs c
    left join union_clubs uc on uc.club_id = c.id
   where c.id = p_club_id
   limit 1;

  -- A rate nobody chose is the bug phase 0 removed from the promotion path.
  -- Staff earn nothing by law, so minting them at the union minimum invented a
  -- commission AND tripped the band on the way back down to zero.
  v_min := case when v_staff then 0
                when v_union is null then 0
                else public.fn_union_setting(v_union, 'min_agent_commission', 0) end;

  -- Prepaid with no line: a wallet that appears because somebody was sent chips
  -- must not also arrive able to borrow. A credit line is granted deliberately,
  -- through the promotion screen or the agent panel, never as a side effect.
  insert into agents (user_id, club_id, role, status,
                      agent_wallet_balance, promo_wallet_balance,
                      commission_rate, player_rakeback_rate,
                      credit_limit, credit_used, is_prepaid)
  values (p_user_id, p_club_id, v_role, 'active', 0, 0, v_min, 0, 0, 0, true)
  on conflict (user_id, club_id) do nothing;

  select a.id into v_id
    from agents a
   where a.club_id = p_club_id and a.user_id = p_user_id
   for update;
  return v_id;
end
$function$;
CREATE OR REPLACE FUNCTION public.fn_notify_display_name(p_user_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
           NULLIF(public.fn_arena_name(p.alias, p.username, p.display_name,
                                       p.first_name, p.last_name, p.full_name),
                  'Player'),
           'Someone')
    FROM public.profiles p
   WHERE p.id = p_user_id;
$function$;
CREATE OR REPLACE FUNCTION public.fn_ca_declare_ledger(p_category text, p_counterparty text, p_counterparty_entity uuid DEFAULT NULL::uuid, p_settlement_id uuid DEFAULT NULL::uuid, p_idempotency_key text DEFAULT NULL::text, p_autoskip_tables text[] DEFAULT NULL::text[])
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_t text;
BEGIN
  -- validate against the LIVE vocabulary so this can never lag a CHECK change
  IF p_category IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.chip_ledger'::regclass
       AND conname = 'chip_ledger_category_check'
       AND pg_get_constraintdef(oid) LIKE '%''' || p_category || '''%') THEN
    RAISE EXCEPTION 'fn_ca_declare_ledger: category % is not in the ledger vocabulary - add it to chip_ledger_category_check FIRST, then declare it', p_category;
  END IF;
  IF p_counterparty IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.chip_ledger'::regclass
       AND conname = 'chip_ledger_from_type_check'
       AND pg_get_constraintdef(oid) LIKE '%''' || p_counterparty || '''%') THEN
    RAISE EXCEPTION 'fn_ca_declare_ledger: counterparty % is not in the ledger vocabulary - add it to the from/to type CHECKs FIRST, then declare it', p_counterparty;
  END IF;

  PERFORM set_config('app.ledger_category', p_category, true);
  PERFORM set_config('app.ledger_counterparty', p_counterparty, true);
  PERFORM set_config('app.ledger_counterparty_entity',
                     COALESCE(p_counterparty_entity::text, ''), true);
  /* A COUNTERPARTY NAMES ITS COLUMN, AND A NEW DECLARATION FORGETS THE LAST
     ONE'S (2026-10-04). A union wallet holds six balances; the caller whose
     counterparty is one of them names it on app.ledger_counterparty_label
     after this call, and fn_ca_autoledger writes it on that side. */
  PERFORM set_config('app.ledger_counterparty_label', '', true);
  IF p_settlement_id IS NOT NULL THEN
    PERFORM set_config('app.ledger_settlement', p_settlement_id::text, true);
  END IF;
  IF p_idempotency_key IS NOT NULL THEN
    PERFORM set_config('app.ledger_idempotency_key', p_idempotency_key, true);
  END IF;
  IF p_autoskip_tables IS NOT NULL THEN
    FOREACH v_t IN ARRAY p_autoskip_tables LOOP
      IF v_t !~ '^[a-z_]+$' THEN
        RAISE EXCEPTION 'fn_ca_declare_ledger: bad autoskip table name %', v_t;
      END IF;
      PERFORM set_config('app.ledger_autoskip_' || v_t, '1', true);
    END LOOP;
  END IF;
END $function$;
CREATE OR REPLACE FUNCTION public.fn_ca_autoledger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  spec text; col text; acct text;
  o jsonb; nn jsonb;
  d numeric; oldv numeric; newv numeric;
  cat text; cp text; cpid uuid; cplbl text;
  v_club uuid; v_union uuid; v_entity uuid; v_guc_club uuid;
  actor uuid;
  v_st text; v_msg text;
BEGIN
  IF current_setting('app.ledger_autoskip_' || TG_TABLE_NAME, true) = '1' THEN
    RETURN NEW;
  END IF;

  o  := CASE WHEN TG_OP = 'INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
  nn := to_jsonb(NEW);

  cat := COALESCE(NULLIF(current_setting('app.ledger_category', true), ''), 'adjustment');
  cp  := COALESCE(NULLIF(current_setting('app.ledger_counterparty', true), ''), 'settlement_suspense');
  BEGIN
    cpid := NULLIF(current_setting('app.ledger_counterparty_entity', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN cpid := NULL;
  END;
  /* THE COUNTERPARTY NAMES ITS COLUMN (2026-10-04). A union wallet holds six
     balances and a promo bank lives on three kinds of owner, so the side this
     trigger writes for a declared union_wallet or promo_wallet counterparty
     carries the column the caller declared on app.ledger_counterparty_label.
     A label that cannot belong to the declared counterparty is not written:
     a stale declaration never names the wrong account. */
  cplbl := NULLIF(current_setting('app.ledger_counterparty_label', true), '');
  cplbl := CASE
    WHEN cp = 'union_wallet' AND cplbl LIKE 'union_wallets.%' THEN cplbl
    WHEN cp = 'bbj_pool' AND cplbl = 'bbj_pools.main_balance' THEN cplbl
    WHEN cp = 'promo_wallet' AND cplbl IN ('clubs.promo_balance', 'agents.promo_wallet_balance',
                                           'union_wallets.promo_wallet') THEN cplbl
    ELSE NULL END;
  actor := COALESCE(auth.uid(), '2d1cd6c3-5700-4af9-a271-d4863fdab20d'::uuid);

  /* THE JOURNAL LEG NAMES THE CLUB THE MONEY LANDED IN (2026-09-20).
     union_wallets and unions are the only autoledgered tables with no
     club_id column - `nn ? 'club_id'` is key EXISTENCE, so a table
     that has the column takes the arm above even when it is NULL. Before
     today every leg journalled from those two was written club-less, and
     fn_chip_drift_since_baseline filters movements on club_id IS NOT
     NULL while counting the balance they explain, so correctly paid
     union-hosted prizes were reported as member drift.
     A payer that knows the club declares it on
     app.ledger_autoledger_club_id, transaction-scoped, and clears it
     beside the autoskips. It is deliberately NOT app.ledger_club_id:
     that name is taken and decides which club a WALLET credit is paid
     into (atomic_credit_wallet_and_log, atomic_deduct_wallet_and_log,
     log_wallet_transaction), so borrowing it would let a rakeback
     close's club leak onto a union leg and would move real money when
     cleared. Read through an exception guard exactly as cpid is above:
     a malformed value must never abort a chip movement. */
  BEGIN
    v_guc_club := NULLIF(current_setting('app.ledger_autoledger_club_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN v_guc_club := NULL;
  END;
  v_club := CASE
    WHEN TG_TABLE_NAME = 'clubs' THEN (nn->>'id')::uuid
    WHEN nn ? 'club_id' THEN NULLIF(nn->>'club_id','')::uuid
    ELSE v_guc_club END;
  v_union := CASE
    WHEN TG_TABLE_NAME = 'unions' THEN (nn->>'id')::uuid
    WHEN nn ? 'union_id' THEN NULLIF(nn->>'union_id','')::uuid
    ELSE NULL END;
  v_entity := CASE
    WHEN TG_TABLE_NAME = 'agents' THEN NULLIF(nn->>'user_id','')::uuid
    WHEN TG_TABLE_NAME = 'club_members' THEN NULLIF(nn->>'user_id','')::uuid
    ELSE COALESCE(NULLIF(nn->>'id','')::uuid, v_club, v_union) END;

  FOR i IN 0 .. TG_NARGS - 1 LOOP
    spec := TG_ARGV[i];
    col  := split_part(spec, '=', 1);
    acct := split_part(spec, '=', 2);
    oldv := COALESCE(NULLIF(o->>col,'')::numeric, 0);
    newv := COALESCE(NULLIF(nn->>col,'')::numeric, 0);
    d := round(newv - oldv, 2);
    CONTINUE WHEN d = 0;
    /* THE AUTOLEDGER NEVER JOURNALS AN ACCOUNT TO ITSELF (2026-10-15). A leg
       whose counterparty is this very account, unlabelled, is from and to the
       same account (2026-10-06 15:42 KF player to three club treasuries;
       2026-09-17 16:39/16:41 treasury to promo). It nets to zero in every
       tally, so it is not written. A bbj_pool, a union_wallet and a promo bank
       off a club hold more than one column under one key, and their bare
       self-legs are the only record of which column moved: kept. */
    CONTINUE WHEN cp = acct AND cpid IS NOT DISTINCT FROM v_entity AND cplbl IS NULL
              AND acct NOT IN ('bbj_pool', 'union_wallet')
              AND (acct <> 'promo_wallet' OR TG_TABLE_NAME = 'clubs');

    BEGIN
      INSERT INTO public.chip_ledger
        (performed_by, from_type, from_entity_id, from_label,
         to_type, to_entity_id, to_label,
         amount, category, club_id, union_id, description,
         pre_from_balance, post_from_balance, pre_to_balance, post_to_balance)
      VALUES (actor,
        CASE WHEN d > 0 THEN cp   ELSE acct END,
        CASE WHEN d > 0 THEN cpid ELSE v_entity END,
        CASE WHEN d > 0 THEN cplbl ELSE TG_TABLE_NAME || '.' || col END,
        CASE WHEN d > 0 THEN acct ELSE cp END,
        CASE WHEN d > 0 THEN v_entity ELSE cpid END,
        CASE WHEN d > 0 THEN TG_TABLE_NAME || '.' || col ELSE cplbl END,
        abs(d), cat, v_club, v_union,
        'auto-ledgered ' || TG_TABLE_NAME || '.' || col || ' delta ' || d::text,
        CASE WHEN d < 0 THEN oldv END, CASE WHEN d < 0 THEN newv END,
        CASE WHEN d > 0 THEN oldv END, CASE WHEN d > 0 THEN newv END);
    EXCEPTION WHEN OTHERS THEN
      -- A journal failure must abort the enclosing chip movement.
      -- Preserve SQLSTATE so the existing caller can retry the whole operation.
      RAISE;
    END;
  END LOOP;

  RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION public.fn_ca_chip_ledger_enrich()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_prev text;
BEGIN
  NEW.amount := round(NEW.amount, 2);
  NEW.created_at := COALESCE(NEW.created_at, now());

  NEW.epoch_id      := COALESCE(NEW.epoch_id, public.fn_ca_current_epoch());
  NEW.actor_service := COALESCE(NEW.actor_service,
                                current_setting('application_name', true));
  NEW.db_role       := COALESCE(NEW.db_role, current_user);
  NEW.correlation_id := COALESCE(NEW.correlation_id,
      NULLIF(current_setting('app.ledger_correlation', true), '')::uuid);
  NEW.settlement_id  := COALESCE(NEW.settlement_id,
      NULLIF(current_setting('app.ledger_settlement', true), ''));
  IF NEW.idempotency_key IS NULL THEN
    NEW.idempotency_key := NULLIF(current_setting('app.ledger_idempotency_key', true), '');
    IF NEW.idempotency_key IS NOT NULL THEN
      -- consume-once: the next row in this transaction must not inherit it
      PERFORM set_config('app.ledger_idempotency_key', '', true);
    END IF;
  END IF;

  /* PHASE 6.4 (2026-09-05): EVERY LEG NAMES ITS HAND OR ITS EVENT. The doors
     that know the hand say so on app.ledger_hand_id (the rake door and the
     BBJ drop, since today) or on a 'bbj:<hand>' settlement; the rake
     settlement is not read for it because it carries a random key when the
     hand is unknown, and a guessed hand is worse than none; a spin's reserve legs
     carry the spin on their prize_liability side. Read them here, once, so
     the hand and the event are columns a per-hand audit can index on rather
     than strings it has to parse. 231,211 legs a day; 29,617 named a hand
     and 50,359 an event before this. */
  IF NEW.hand_id IS NULL THEN
    NEW.hand_id := NULLIF(current_setting('app.ledger_hand_id', true), '')::uuid;
    IF NEW.hand_id IS NULL AND NEW.settlement_id ~ '^bbj:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      NEW.hand_id := split_part(NEW.settlement_id, ':', 2)::uuid;
    END IF;
  END IF;
  IF NEW.tournament_id IS NULL THEN
    NEW.tournament_id := NULLIF(current_setting('app.ledger_tournament_id', true), '')::uuid;
    /* PHASE 6 GATE (2026-09-05): a prize_liability side IS the event, on every
       category, not only the two spin ones. This is what the 6.4 measurement
       missed: 777 tournament rake settlements in three hours (the fee leaving
       an event to a union rake wallet or a club treasury) and every tournament
       add-on named nothing. Read against the rows first: all 777 from_entity_id
       values are real tournaments. The FROM side wins when both sides are
       prize_liability (a satellite seat's pool transfer, which already stamps
       the satellite itself). */
    IF NEW.tournament_id IS NULL THEN
      IF NEW.from_type = 'prize_liability' THEN NEW.tournament_id := NEW.from_entity_id;
      ELSIF NEW.to_type = 'prize_liability' THEN NEW.tournament_id := NEW.to_entity_id;
      END IF;
    END IF;
  END IF;
  /* PHASE 6 GATE: and a table_stack side IS the table. Every cash buy-in,
     add-on and cash-out carries the table on its felt side (231, 53 and 222
     of each measured in the same window, every one a real table row) and
     none of them carried table_id. A cash buy-in is not a hand; the table is
     the name it has. */
  IF NEW.table_id IS NULL THEN
    IF NEW.to_type = 'table_stack' THEN NEW.table_id := NEW.to_entity_id;
    ELSIF NEW.from_type = 'table_stack' THEN NEW.table_id := NEW.from_entity_id;
    END IF;
  END IF;

  -- Tamper evidence: monotone sequence + per-row content checksum. NOT chained
  -- through the previous row's hash at insert time - that would put a global
  -- serialization point (and deadlock surface) inside every money transaction,
  -- which the availability policy forbids. prev_hash is best-effort forensics.
  NEW.chain_seq := nextval('public.chip_ledger_chain_seq');
  SELECT row_hash INTO v_prev
    FROM public.chip_ledger
   WHERE chain_seq = NEW.chain_seq - 1;
  NEW.prev_hash := v_prev;
  NEW.row_hash := encode(extensions.digest(
      'v1'
      || '|' || NEW.chain_seq::text
      || '|' || COALESCE(NEW.epoch_id::text,'')
      || '|' || NEW.amount::text
      || '|' || NEW.from_type || ':' || COALESCE(NEW.from_entity_id::text,'')
      || '|' || NEW.to_type   || ':' || COALESCE(NEW.to_entity_id::text,'')
      || '|' || NEW.category
      || '|' || COALESCE(NEW.idempotency_key,'')
      || '|' || COALESCE(NEW.correlation_id::text,'')
      || '|' || NEW.created_at::text,
      'sha256'), 'hex');
  RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION public.zz_chip_ledger_key_is_claimed_once()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  /* 99.92% of legs carry no key and this does nothing for them. */
  IF NEW.idempotency_key IS NULL THEN
    RETURN NEW;
  END IF;

  /* No ON CONFLICT: the unique violation IS the refusal, and it must reach the
     caller exactly as ux_chip_ledger_idempotency_key's does today. Both are
     live until the cut; either one refusing is the correct outcome. */
  INSERT INTO public.chip_ledger_idem (idempotency_key, leg_id, created_at)
  VALUES (NEW.idempotency_key, NEW.id, COALESCE(NEW.created_at, now()));

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_cashier_event_payload(e accounting_cashier_events)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
 SET "TimeZone" TO 'UTC'
 SET "DateStyle" TO 'ISO,YMD'
AS $function$
 SELECT jsonb_build_object('contract_version',1,'event_id',e.id,'invoice_id',e.invoice_id,
  'cashout_id',e.cashout_id,'escrow_id',e.escrow_id,'source_transaction_id',e.source_transaction_id,
  'source_ledger_id',e.source_ledger_id,'club_id',e.club_id,'player_id',e.player_id,
  'assigned_agent_id',e.assigned_agent_id,'issuer_representative_id',e.issuer_representative_id,
  'actor_user_id',e.actor_user_id,'actor_role',e.actor_role,'event_kind',e.event_kind,
  'display_state',CASE e.event_kind WHEN 'hold' THEN 'held' WHEN 'approval' THEN 'approved' ELSE 'refunded' END,
  'amount',round(e.amount,2)::text,'occurred_at',e.occurred_at,'issued_at',e.issued_at,
  'hold_event_id',e.hold_event_id,'hold_invoice_id',e.hold_invoice_id,
  'ledger_from_type',e.ledger_from_type,'ledger_from_entity_id',e.ledger_from_entity_id,
  'ledger_to_type',e.ledger_to_type,'ledger_to_entity_id',e.ledger_to_entity_id,
  'custody_movement_recorded',true,'cashout_completed',e.event_kind='approval',
  'refund_recorded',e.event_kind IN('cancellation','decline','expiry_refund'));
$function$;
CREATE OR REPLACE FUNCTION public.fn_cashier_document_body(p_event_id uuid, p_invoice_number text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'UTC'
 SET "DateStyle" TO 'ISO,YMD'
AS $function$
DECLARE e public.accounting_cashier_events%ROWTYPE; title text;
BEGIN
 SELECT * INTO STRICT e FROM public.accounting_cashier_events WHERE id=p_event_id;
 title:=CASE e.event_kind WHEN 'hold' THEN 'Chips Held' WHEN 'approval' THEN 'Cashout Approved' ELSE 'Chips Returned' END;
 RETURN title||' · Invoice '||p_invoice_number||E'\nIssued By: '||e.issuer_name||E'\nFor: '||e.player_name
  ||E'\nAmount: '||round(e.amount,2)::text||' Chips'
  ||E'\n'||CASE e.event_kind WHEN 'hold' THEN 'Chips moved from the player wallet into escrow. The cashout is not complete.'
    WHEN 'approval' THEN 'Escrowed chips transferred to the approving cashier wallet. This records chips, not external cash settlement.'
    WHEN 'cancellation' THEN 'The player cancelled the cashout. Escrowed chips returned to the player wallet.'
    WHEN 'decline' THEN 'The cashier declined the cashout. Escrowed chips returned to the player wallet.'
    ELSE 'The cashout expired. Escrowed chips returned to the player wallet.' END
  ||E'\nRecorded: '||e.occurred_at::text||E'\nIssued: '||e.issued_at::text;
END $function$;
CREATE OR REPLACE FUNCTION public.fn_cashier_notice_copy(e accounting_cashier_events, p_recipient uuid, p_invoice_number text)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
 WITH v AS (SELECT to_char(abs(e.amount),'FM999,999,999,999,990.00')||' Chips' AS amt,
   COALESCE(NULLIF(btrim(e.player_name),''),'A Player') AS who,
   COALESCE(NULLIF(btrim(e.issuer_name),''),'Your Club') AS club,
   p_recipient IS NOT DISTINCT FROM e.player_id AS mine,
   p_recipient IS NOT DISTINCT FROM e.actor_user_id AS acted,
   COALESCE(p_invoice_number,'') AS num)
 SELECT CASE e.event_kind
  WHEN 'hold' THEN CASE WHEN mine
   THEN jsonb_build_object('title','Cashout Requested · '||num,
     'message','Your Cashout Request For '||amt||' Was Sent To Your Agent. Your Chips Are Held Until It Is Accepted Or Cancelled.')
   ELSE jsonb_build_object('title','Cashout Request · '||who,
     'message',who||' Requested A Payout Of '||amt||' In '||club||'. Open Invoices To Accept Or Cancel It. Invoice '||num) END
  WHEN 'approval' THEN CASE WHEN mine
   THEN jsonb_build_object('title','Cashout Approved · '||num,
     'message','Your Cashout Of '||amt||' Was Accepted By Your Agent.')
   WHEN acted THEN jsonb_build_object('title','Payout Accepted · '||who,
     'message','You Accepted '||who||'''s Payout Of '||amt||'. The Chips Were Sent To Your Agent Wallet. Invoice '||num)
   ELSE jsonb_build_object('title','Payout Accepted · '||who,
     'message',who||'''s Payout Of '||amt||' Was Accepted. Invoice '||num) END
  WHEN 'decline' THEN CASE WHEN mine
   THEN jsonb_build_object('title','Cashout Cancelled · '||num,
     'message','Your Agent Cancelled Your Cashout Of '||amt||'. The Chips Were Returned To Your Wallet.')
   ELSE jsonb_build_object('title','Payout Cancelled · '||who,
     'message',who||'''s Payout Of '||amt||' Was Cancelled. The Chips Were Returned To '||who||'''s Wallet. Invoice '||num) END
  WHEN 'cancellation' THEN CASE WHEN mine
   THEN jsonb_build_object('title','Cashout Cancelled · '||num,
     'message','You Cancelled Your Cashout Of '||amt||'. The Chips Were Returned To Your Wallet.')
   ELSE jsonb_build_object('title','Payout Withdrawn · '||who,
     'message',who||' Cancelled Their Payout Request Of '||amt||'. The Chips Were Returned To Their Wallet. Invoice '||num) END
  ELSE CASE WHEN mine
   THEN jsonb_build_object('title','Cashout Expired · '||num,
     'message','Your Cashout Of '||amt||' Expired. The Chips Were Returned To Your Wallet.')
   ELSE jsonb_build_object('title','Payout Expired · '||who,
     'message',who||'''s Payout Request Of '||amt||' Expired. The Chips Were Returned To '||who||'''s Wallet. Invoice '||num) END
 END FROM v;
$function$;
CREATE OR REPLACE FUNCTION public.fn_cashier_invoice_contract(p_invoice_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE e public.accounting_cashier_events%ROWTYPE; i public.settlement_invoices%ROWTYPE;
 l public.chip_ledger%ROWTYPE;t public.chip_transactions%ROWTYPE;h public.accounting_cashier_events%ROWTYPE;
 payload jsonb;expected_type text;
BEGIN
 SELECT * INTO e FROM public.accounting_cashier_events WHERE invoice_id=p_invoice_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'cashier_document_event_missing' USING ERRCODE='23514';END IF;
 SELECT * INTO i FROM public.settlement_invoices WHERE id=p_invoice_id;
 SELECT * INTO l FROM public.chip_ledger WHERE id=e.source_ledger_id;
 SELECT * INTO t FROM public.chip_transactions WHERE id=e.source_transaction_id;
 payload:=public.fn_cashier_event_payload(e);
 expected_type:=CASE e.event_kind WHEN 'hold' THEN 'cashout_request_escrow' WHEN 'approval' THEN 'cashout_approved'
  WHEN 'cancellation' THEN 'cashout_cancelled' WHEN 'decline' THEN 'cashout_denied' ELSE 'cashout_expired_refund' END;
 IF i.id IS NULL OR i.invoice_type<>'cashier_cashout' OR i.club_id IS DISTINCT FROM e.club_id
  OR i.from_entity_type<>'club' OR i.from_entity_id IS DISTINCT FROM e.club_id::text
  OR i.to_entity_type<>'player' OR i.to_entity_id IS DISTINCT FROM e.player_id::text
  OR i.source_ledger_id IS DISTINCT FROM e.source_ledger_id OR i.gross_amount IS DISTINCT FROM e.amount
  OR i.net_amount IS DISTINCT FROM e.amount OR i.deductions IS DISTINCT FROM 0
  OR i.status IS DISTINCT FROM (CASE WHEN e.event_kind='hold' THEN 'generated' ELSE 'paid' END)
  OR i.chips_transferred IS DISTINCT FROM (e.event_kind<>'hold')
  OR i.transferred_at IS DISTINCT FROM (CASE WHEN e.event_kind='hold' THEN NULL::timestamptz ELSE e.occurred_at END)
  OR i.created_at IS DISTINCT FROM e.issued_at OR i.breakdown->'cashier' IS DISTINCT FROM payload
  OR l.id IS NULL OR l.status<>'posted' OR l.amount IS DISTINCT FROM e.amount OR l.club_id IS DISTINCT FROM e.club_id
  OR l.from_type IS DISTINCT FROM e.ledger_from_type OR l.from_entity_id IS DISTINCT FROM e.ledger_from_entity_id
  OR l.to_type IS DISTINCT FROM e.ledger_to_type OR l.to_entity_id IS DISTINCT FROM e.ledger_to_entity_id
  OR l.category IS DISTINCT FROM (CASE WHEN e.event_kind='hold' THEN 'escrow_hold' ELSE 'escrow_release' END)
  OR l.idempotency_key IS DISTINCT FROM 'cashout:'||e.cashout_id::text||(CASE WHEN e.event_kind='hold' THEN ':hold' ELSE ':release' END)
  OR l.table_id IS NOT NULL OR l.hand_id IS NOT NULL OR l.tournament_id IS NOT NULL OR l.settlement_id IS NOT NULL
  OR l.performed_by IS DISTINCT FROM e.ledger_actor_user_id OR l.created_at IS DISTINCT FROM e.occurred_at
  OR t.id IS NULL OR t.club_id IS DISTINCT FROM e.club_id OR t.amount IS DISTINCT FROM e.amount
  OR t.related_cashout_id IS DISTINCT FROM e.cashout_id OR t.transaction_type IS DISTINCT FROM expected_type
  OR t.metadata->>'op_id' IS DISTINCT FROM e.op_id::text OR t.metadata->>'cashier_document_version' IS DISTINCT FROM '1'
  OR t.metadata->>'event_id' IS DISTINCT FROM e.id::text
  OR t.metadata->>'actor_user_id' IS DISTINCT FROM e.actor_user_id::text OR t.metadata->>'actor_role' IS DISTINCT FROM e.actor_role
  OR t.metadata->>'assigned_agent_id' IS DISTINCT FROM e.assigned_agent_id::text OR t.table_id IS NOT NULL OR t.notes IS DISTINCT FROM e.transaction_note
  OR t.balance_after IS DISTINCT FROM e.wallet_after OR t.created_at IS DISTINCT FROM e.occurred_at
  OR e.wallet_before IS NULL OR e.wallet_after IS NULL
  OR e.wallet_before::text IN('NaN','Infinity','-Infinity') OR e.wallet_after::text IN('NaN','Infinity','-Infinity')
  OR e.wallet_after-e.wallet_before IS DISTINCT FROM (CASE WHEN e.event_kind='hold' THEN -e.amount ELSE e.amount END)
  OR NOT EXISTS(SELECT 1 FROM public.chip_ledger_idem k WHERE k.idempotency_key=l.idempotency_key AND k.leg_id=l.id)
 THEN RAISE EXCEPTION 'cashier_document_provenance_mismatch' USING ERRCODE='23514';END IF;
 IF e.event_kind IN('hold','cancellation') AND e.actor_user_id IS DISTINCT FROM e.player_id
  OR e.event_kind IN('approval','decline') AND (e.actor_user_id=e.player_id OR e.actor_role NOT IN('owner','co_owner','admin','super_agent','agent','sub_agent'))
  OR e.assigned_agent_id=e.player_id
 THEN RAISE EXCEPTION 'cashier_actor_provenance_mismatch' USING ERRCODE='23514';END IF;
 IF e.event_kind='hold' THEN
  IF e.actor_user_id IS DISTINCT FROM e.player_id OR e.ledger_from_type<>'player_wallet' OR e.ledger_from_entity_id<>e.player_id
   OR e.ledger_to_type<>'escrow' OR e.ledger_to_entity_id<>e.escrow_id OR e.wallet_owner_id<>e.player_id
   OR t.from_user_id IS DISTINCT FROM e.player_id OR t.to_user_id IS DISTINCT FROM e.assigned_agent_id
  THEN RAISE EXCEPTION 'cashier_hold_route_mismatch' USING ERRCODE='23514';END IF;
 ELSE
  SELECT * INTO h FROM public.accounting_cashier_events WHERE id=e.hold_event_id;
  IF h.event_kind IS DISTINCT FROM 'hold' OR h.cashout_id IS DISTINCT FROM e.cashout_id
   OR h.escrow_id IS DISTINCT FROM e.escrow_id OR h.invoice_id IS DISTINCT FROM e.hold_invoice_id
   OR h.amount IS DISTINCT FROM e.amount OR h.club_id IS DISTINCT FROM e.club_id OR h.player_id IS DISTINCT FROM e.player_id
   OR h.assigned_agent_id IS DISTINCT FROM e.assigned_agent_id
   OR e.ledger_from_type<>'escrow' OR e.ledger_from_entity_id<>e.escrow_id
   OR e.ledger_to_type IS DISTINCT FROM (CASE WHEN e.event_kind='approval' THEN 'agent_wallet' ELSE 'player_wallet' END)
   OR e.ledger_to_entity_id IS DISTINCT FROM (CASE WHEN e.event_kind='approval' THEN e.actor_user_id ELSE e.player_id END)
   OR e.wallet_owner_id IS DISTINCT FROM e.ledger_to_entity_id
   OR t.from_user_id IS DISTINCT FROM (CASE WHEN e.event_kind='approval' THEN e.player_id ELSE e.actor_user_id END)
   OR t.to_user_id IS DISTINCT FROM e.ledger_to_entity_id
  THEN RAISE EXCEPTION 'cashier_terminal_route_mismatch' USING ERRCODE='23514';END IF;
 END IF;
 RETURN payload;
END $function$;
CREATE OR REPLACE FUNCTION public.fn_cashier_assert_delivery(p_event_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE e public.accounting_cashier_events%ROWTYPE;i public.settlement_invoices%ROWTYPE;
 d record;payload jsonb;actual_users uuid[];expected_body text;
BEGIN
 SELECT * INTO STRICT e FROM public.accounting_cashier_events WHERE id=p_event_id;
 payload:=public.fn_cashier_invoice_contract(e.invoice_id);
 SELECT * INTO STRICT i FROM public.settlement_invoices WHERE id=e.invoice_id;
 expected_body:=public.fn_cashier_document_body(e.id,i.invoice_number);
 SELECT array_agg(recipient_id ORDER BY recipient_id) INTO actual_users FROM public.accounting_invoice_deliveries WHERE invoice_id=e.invoice_id;
 IF actual_users IS DISTINCT FROM e.audience_user_ids OR i.invoice_number IS NULL
  OR i.message_sent IS DISTINCT FROM true OR i.message_sent_at IS NULL
 THEN RAISE EXCEPTION 'cashier_document_delivery_missing' USING ERRCODE='23514';END IF;
 FOR d IN SELECT a.*,m.conversation_id,m.sender_id,m.content,m.message_type,m.media_metadata,
   n.user_id AS notice_user,n.type AS notice_type,n.data AS notice_data,n.metadata AS notice_metadata,
   n.title AS notice_title,n.message AS notice_message,n.action_url AS notice_url
  FROM public.accounting_invoice_deliveries a LEFT JOIN public.social_messages m ON m.id=a.message_id
  LEFT JOIN public.notifications n ON n.id=a.notification_id WHERE a.invoice_id=e.invoice_id LOOP
  IF d.delivery_mode IS DISTINCT FROM 'immediate' OR d.sender_id IS DISTINCT FROM e.issuer_representative_id
   OR d.message_type IS DISTINCT FROM 'invoice' OR d.content IS DISTINCT FROM expected_body
   OR d.media_metadata->>'invoice_id' IS DISTINCT FROM e.invoice_id::text
   OR d.media_metadata->'cashier' IS DISTINCT FROM payload
   OR d.notice_user IS DISTINCT FROM d.recipient_id OR d.notice_type IS DISTINCT FROM 'accounting_invoice'
   OR d.notice_data->>'invoice_id' IS DISTINCT FROM e.invoice_id::text OR d.notice_data->'cashier' IS DISTINCT FROM payload
   OR d.notice_metadata IS DISTINCT FROM d.media_metadata OR d.notice_data IS DISTINCT FROM d.media_metadata
   OR d.media_metadata->>'invoice_type' IS DISTINCT FROM 'cashier_cashout' OR d.media_metadata->'amount' IS DISTINCT FROM to_jsonb(i.net_amount)
   OR (d.notice_title IS DISTINCT FROM (CASE e.event_kind WHEN 'hold' THEN 'Chips Held · ' WHEN 'approval' THEN 'Cashout Approved · ' ELSE 'Chips Returned · ' END||i.invoice_number) AND d.notice_title IS DISTINCT FROM public.fn_cashier_notice_copy(e,d.recipient_id,i.invoice_number)->>'title')
   OR (d.notice_message IS DISTINCT FROM (CASE e.event_kind WHEN 'hold' THEN 'Chips Held: ' WHEN 'approval' THEN 'Cashout Approved: ' ELSE 'Chips Returned: ' END||to_char(abs(i.net_amount),'FM999,999,999,999,990.00')||' Chips') AND d.notice_message IS DISTINCT FROM public.fn_cashier_notice_copy(e,d.recipient_id,i.invoice_number)->>'message')
   OR d.notice_url IS DISTINCT FROM '/hub/messenger?conversation='||d.conversation_id::text
   OR NOT EXISTS(SELECT 1 FROM public.accounting_conversations c WHERE c.conversation_id=d.conversation_id
      AND c.scope_id=e.club_id AND c.issuer_type='club' AND c.issuer_id=e.club_id
      AND c.sender_id=e.issuer_representative_id AND c.recipient_id=d.recipient_id)
   OR EXISTS(SELECT 1 FROM public.social_conversation_participants p WHERE p.conversation_id=d.conversation_id
      AND p.user_id<>ALL(ARRAY[e.issuer_representative_id,d.recipient_id]))
   OR NOT EXISTS(SELECT 1 FROM public.social_conversation_participants p WHERE p.conversation_id=d.conversation_id AND p.user_id=d.recipient_id)
   OR NOT EXISTS(SELECT 1 FROM public.social_conversation_participants p WHERE p.conversation_id=d.conversation_id AND p.user_id=e.issuer_representative_id)
  THEN RAISE EXCEPTION 'cashier_document_delivery_mismatch' USING ERRCODE='23514';END IF;
 END LOOP;
 RETURN payload;
END $function$;
CREATE OR REPLACE FUNCTION public.fn_cashier_operation_receipt(p_event_id uuid, p_replayed boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'UTC'
 SET "DateStyle" TO 'ISO,YMD'
AS $function$
DECLARE e public.accounting_cashier_events%ROWTYPE; terminal public.accounting_cashier_events%ROWTYPE;
 r public.cashout_requests%ROWTYPE;s public.chip_escrow%ROWTYPE;payload jsonb;expected_status text;expected_release text;
BEGIN
 SELECT * INTO STRICT e FROM public.accounting_cashier_events WHERE id=p_event_id;
 SELECT * INTO r FROM public.cashout_requests WHERE id=e.cashout_id FOR UPDATE;
 SELECT * INTO s FROM public.chip_escrow WHERE id=e.escrow_id FOR UPDATE;
 payload:=public.fn_cashier_assert_delivery(e.id);
 IF r.id IS NULL OR s.id IS NULL OR r.club_id IS DISTINCT FROM e.club_id OR r.player_id IS DISTINCT FROM e.player_id
   OR r.agent_id IS DISTINCT FROM e.assigned_agent_id OR r.amount IS DISTINCT FROM e.amount
   OR s.cashout_request_id IS DISTINCT FROM r.id OR s.player_id IS DISTINCT FROM e.player_id
   OR s.club_id IS DISTINCT FROM e.club_id OR s.amount IS DISTINCT FROM e.amount OR s.table_id IS NOT NULL
   OR r.created_at IS NULL OR r.updated_at IS NULL OR NOT isfinite(r.created_at) OR NOT isfinite(r.updated_at)
   OR s.locked_at IS DISTINCT FROM r.created_at
 THEN RAISE EXCEPTION 'cashier_request_receipt_mismatch' USING ERRCODE='23514';END IF;
 IF e.event_kind='hold' THEN
  IF r.created_at IS DISTINCT FROM e.occurred_at OR r.player_note IS DISTINCT FROM e.accepted_note
  THEN RAISE EXCEPTION 'cashier_hold_request_mismatch' USING ERRCODE='23514';END IF;
  IF r.status='pending' THEN
   IF s.released_at IS NOT NULL OR s.release_type IS NOT NULL OR r.acknowledged_at IS NOT NULL
      OR r.completed_at IS NOT NULL OR r.cancelled_at IS NOT NULL OR r.updated_at IS DISTINCT FROM e.occurred_at
      OR EXISTS(SELECT 1 FROM public.accounting_cashier_events x WHERE x.cashout_id=r.id AND x.event_slot='terminal')
   THEN RAISE EXCEPTION 'cashier_pending_request_mismatch' USING ERRCODE='23514';END IF;
  ELSE
   SELECT * INTO terminal FROM public.accounting_cashier_events WHERE cashout_id=r.id AND event_slot='terminal';
   IF NOT p_replayed OR terminal.id IS NULL OR terminal.hold_event_id IS DISTINCT FROM e.id
   THEN RAISE EXCEPTION 'cashier_terminal_receipt_missing' USING ERRCODE='23514';END IF;
   PERFORM public.fn_cashier_operation_receipt(terminal.id,true);
  END IF;
 ELSE
  expected_status:=CASE e.event_kind WHEN 'approval' THEN 'approved' WHEN 'cancellation' THEN 'cancelled'
    WHEN 'decline' THEN 'rejected' ELSE 'expired' END;
  expected_release:=CASE e.event_kind WHEN 'approval' THEN 'completed' ELSE expected_status END;
  IF r.status IS DISTINCT FROM expected_status OR s.release_type IS DISTINCT FROM expected_release
    OR s.released_at IS DISTINCT FROM e.occurred_at OR r.updated_at IS DISTINCT FROM e.occurred_at
    OR r.acknowledged_at IS DISTINCT FROM (CASE WHEN e.event_kind IN('approval','decline') THEN e.occurred_at ELSE NULL::timestamptz END)
    OR r.completed_at IS DISTINCT FROM (CASE WHEN e.event_kind='approval' THEN e.occurred_at ELSE NULL::timestamptz END)
    OR r.cancelled_at IS DISTINCT FROM (CASE WHEN e.event_kind IN('cancellation','decline','expiry_refund') THEN e.occurred_at ELSE NULL::timestamptz END)
    OR (e.event_kind IN('approval','decline') AND r.agent_note IS DISTINCT FROM e.accepted_note)
  THEN RAISE EXCEPTION 'cashier_terminal_request_mismatch' USING ERRCODE='23514';END IF;
  PERFORM public.fn_cashier_assert_delivery(e.hold_event_id);
 END IF;
 expected_status:=CASE e.event_kind WHEN 'hold' THEN 'pending' WHEN 'approval' THEN 'approved'
   WHEN 'cancellation' THEN 'cancelled' WHEN 'decline' THEN 'rejected' ELSE 'expired' END;
 RETURN payload||jsonb_build_object('success',true,'replayed',p_replayed,'op_id',e.op_id,
   'request_status',expected_status,'accepted_note',e.accepted_note,'actor_wallet_after',CASE WHEN e.event_kind IN('hold','approval','cancellation') THEN round(e.wallet_after,2)::text ELSE NULL END,
   'cashier',payload,'request',jsonb_build_object('id',r.id,'club_id',r.club_id,'player_id',r.player_id,'agent_id',r.agent_id,
    'amount',round(r.amount,2)::text,'status',r.status,'created_at',r.created_at,'updated_at',r.updated_at,
    'acknowledged_at',r.acknowledged_at,'completed_at',r.completed_at,'cancelled_at',r.cancelled_at,
    'player_note',r.player_note,'agent_note',r.agent_note));
END $function$;
CREATE OR REPLACE FUNCTION public.fn_cashier_cashout_transition(p_action text, p_club_id uuid, p_cashout_id uuid, p_amount numeric, p_expected_actor_id uuid, p_op_id uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE actor uuid:=auth.uid();actual_role text;kind text;request_status text;v_release_type text;
 note text:=NULLIF(btrim(p_note),'');fingerprint jsonb;prior public.accounting_cashier_events%ROWTYPE;
 r public.cashout_requests%ROWTYPE;s public.chip_escrow%ROWTYPE;h public.accounting_cashier_events%ROWTYPE;
 e public.accounting_cashier_events%ROWTYPE;member public.club_members%ROWTYPE;agent public.agents%ROWTYPE;
 club public.clubs%ROWTYPE;wallet_before numeric;wallet_after numeric;agent_row_id uuid;assigned uuid;
 request_id uuid:=p_cashout_id;escrow_id uuid;event_id uuid:=gen_random_uuid();invoice_id uuid:=gen_random_uuid();tx_id uuid:=gen_random_uuid();leg_id uuid;
 at_time timestamptz:=transaction_timestamp();issue_time timestamptz;leg_count int;rows_written int;persisted numeric;
 tx_type text;tx_note text;tx_from uuid;tx_to uuid;audience uuid[];payload jsonb;result jsonb;wallet_user uuid;
 old_category text:=current_setting('app.ledger_category',true);old_cp text:=current_setting('app.ledger_counterparty',true);
 old_entity text:=current_setting('app.ledger_counterparty_entity',true);old_key text:=current_setting('app.ledger_idempotency_key',true);
 old_settlement text:=current_setting('app.ledger_settlement',true);old_tournament text:=current_setting('app.ledger_tournament',true);
 old_hand text:=current_setting('app.ledger_hand_id',true);old_tournament_id text:=current_setting('app.ledger_tournament_id',true);
BEGIN
  -- Serialize the existing agreement before any operation/hierarchy/row lock.
  -- Nested callers reacquire the same transaction lock; no new money path.
  IF p_club_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('agent-agreement:'||p_club_id::text,0));
  END IF;

 IF p_action IS NULL OR p_action NOT IN('hold','approval','release','expiry_refund') OR p_club_id IS NULL OR p_op_id IS NULL
  OR (p_action='hold' AND p_cashout_id IS NOT NULL) OR (p_action<>'hold' AND p_cashout_id IS NULL)
 THEN RAISE EXCEPTION 'cashier_intent_incomplete' USING ERRCODE='22023';END IF;
 IF p_action='expiry_refund' THEN
  IF actor IS NOT NULL OR p_expected_actor_id IS NOT NULL
  THEN RAISE EXCEPTION 'cashier_system_actor_required' USING ERRCODE='42501';END IF;
 ELSE
  IF actor IS NULL OR actor IS DISTINCT FROM p_expected_actor_id
  THEN RAISE EXCEPTION 'cashier_account_changed' USING ERRCODE='42501';END IF;
 END IF;
 IF p_amount IS NULL OR p_amount::text IN('NaN','Infinity','-Infinity') OR p_amount<=0
    OR p_amount>1000000000 OR p_amount<>round(p_amount,2)
 THEN RAISE EXCEPTION 'cashier_invalid_amount' USING ERRCODE='22023';END IF;
 fingerprint:=jsonb_build_object('action',p_action,'actor',actor,'club_id',p_club_id,'cashout_id',p_cashout_id,
   'amount',round(p_amount,2)::text,'note',note);
 PERFORM pg_advisory_xact_lock(hashtextextended('cashout-op:'||COALESCE(actor::text,'system')||':'||p_op_id::text,0));
 -- Hierarchy first: never take a request or wallet row before this scope lock.
 PERFORM pg_advisory_xact_lock(hashtextextended('cashier-hierarchy:'||p_club_id::text,0));
 SELECT * INTO club FROM public.clubs WHERE id=p_club_id FOR UPDATE;
 IF NOT FOUND OR club.owner_id IS NULL THEN RAISE EXCEPTION 'cashier_club_unavailable' USING ERRCODE='23514';END IF;
 SELECT * INTO prior FROM public.accounting_cashier_events WHERE actor_user_id IS NOT DISTINCT FROM actor AND op_id=p_op_id;
 IF FOUND THEN
  IF prior.operation_fingerprint IS DISTINCT FROM fingerprint
  THEN RAISE EXCEPTION 'cashier_operation_conflict' USING ERRCODE='22023';END IF;
  RETURN public.fn_cashier_operation_receipt(prior.id,true);
 END IF;
 -- Legacy chips alone cannot certify a canonical hold, delivery or replay.
 IF EXISTS(SELECT 1 FROM public.chip_transactions t WHERE t.metadata->>'op_id'=p_op_id::text
   AND t.transaction_type IN('cashout_request_escrow','cashout_approved','cashout_cancelled','cashout_denied','cashout_expired_refund')
   AND (t.from_user_id=actor OR t.to_user_id=actor OR (actor IS NULL AND t.transaction_type='cashout_expired_refund')))
 THEN RAISE EXCEPTION 'cashier_legacy_operation_unverified' USING ERRCODE='23514';END IF;
 IF current_setting('app.ledger_autoskip_club_members',true)='1' OR current_setting('app.ledger_autoskip_agents',true)='1'
 THEN RAISE EXCEPTION 'cashier_journal_is_suppressed' USING ERRCODE='23514';END IF;
 IF p_action='hold' THEN
  SELECT agent_id INTO assigned FROM public.club_members WHERE club_id=p_club_id AND user_id=actor;
  PERFORM public.fn_cashier_lock_authority(p_club_id,actor,actor,COALESCE(assigned,club.owner_id));
  SELECT * INTO member FROM public.club_members WHERE club_id=p_club_id AND user_id=actor FOR UPDATE;
  IF NOT FOUND OR COALESCE(member.status,'active') NOT IN('active','approved')
    OR member.role NOT IN('owner','co_owner','admin','super_agent','agent','sub_agent','player','member')
  THEN RAISE EXCEPTION 'cashier_player_wallet_unavailable' USING ERRCODE='42501';END IF;
  actual_role:=member.role;assigned:=COALESCE(member.agent_id,club.owner_id);
  IF assigned IS NULL OR assigned=actor OR public.fn_club_cashier_can_transact(p_club_id,assigned,actor) IS NOT TRUE
    OR COALESCE(public.fn_club_bank_role(p_club_id,assigned),'') NOT IN('owner','co_owner','admin','super_agent','agent','sub_agent')
  THEN RAISE EXCEPTION 'cashier_assigned_cashier_unavailable' USING ERRCODE='42501';END IF;
  IF EXISTS(SELECT 1 FROM public.cashout_requests WHERE club_id=p_club_id AND player_id=actor AND status='pending')
  THEN RAISE EXCEPTION 'cashier_pending_request_exists' USING ERRCODE='23514';END IF;
  request_id:=gen_random_uuid();escrow_id:=gen_random_uuid();kind:='hold';request_status:='pending';wallet_user:=actor;
  wallet_before:=member.chip_balance;
 ELSE
  SELECT * INTO r FROM public.cashout_requests WHERE id=p_cashout_id FOR UPDATE;
  IF NOT FOUND OR r.club_id IS DISTINCT FROM p_club_id OR r.amount IS DISTINCT FROM p_amount
  THEN RAISE EXCEPTION 'cashier_request_intent_mismatch' USING ERRCODE='22023';END IF;
  IF r.status IS DISTINCT FROM 'pending' THEN RAISE EXCEPTION 'cashier_request_already_terminal' USING ERRCODE='23514';END IF;
  SELECT * INTO s FROM public.chip_escrow WHERE cashout_request_id=r.id FOR UPDATE;
  IF NOT FOUND OR s.club_id IS DISTINCT FROM r.club_id OR s.player_id IS DISTINCT FROM r.player_id
    OR s.amount IS DISTINCT FROM r.amount OR s.table_id IS NOT NULL OR s.released_at IS NOT NULL OR s.release_type IS NOT NULL
    OR s.locked_at IS DISTINCT FROM r.created_at
  THEN RAISE EXCEPTION 'cashier_escrow_unverified' USING ERRCODE='23514';END IF;
  SELECT * INTO h FROM public.accounting_cashier_events WHERE cashout_id=r.id AND event_slot='hold';
  IF NOT FOUND THEN RAISE EXCEPTION 'cashier_legacy_hold_unverified' USING ERRCODE='23514';END IF;
  PERFORM public.fn_cashier_operation_receipt(h.id,true);
  escrow_id:=s.id;assigned:=r.agent_id;
  PERFORM public.fn_cashier_lock_authority(p_club_id,actor,r.player_id,assigned);
  IF p_action='expiry_refund' THEN kind:='expiry_refund';actual_role:='system';
  ELSIF p_action='release' AND actor=r.player_id THEN kind:='cancellation';
  ELSE
   actual_role:=public.fn_club_bank_role(p_club_id,actor);
   IF actor=r.player_id OR COALESCE(actual_role,'') NOT IN('owner','co_owner','admin','super_agent','agent','sub_agent')
      OR public.fn_club_cashier_can_transact(p_club_id,actor,r.player_id) IS NOT TRUE
   THEN RAISE EXCEPTION 'cashier_current_authority_required' USING ERRCODE='42501';END IF;
   kind:=CASE p_action WHEN 'approval' THEN 'approval' ELSE 'decline' END;
  END IF;
  request_status:=CASE kind WHEN 'approval' THEN 'approved' WHEN 'cancellation' THEN 'cancelled' WHEN 'decline' THEN 'rejected' ELSE 'expired' END;
  v_release_type:=CASE kind WHEN 'approval' THEN 'completed' ELSE request_status END;
  IF kind='approval' THEN
   agent_row_id:=public.fn_ensure_agent_row(p_club_id,actor,actual_role);
   SELECT * INTO agent FROM public.agents WHERE id=agent_row_id AND club_id=p_club_id AND user_id=actor FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'cashier_destination_wallet_unavailable' USING ERRCODE='23503';END IF;
   wallet_before:=agent.agent_wallet_balance;wallet_user:=actor;
  ELSE
   SELECT * INTO member FROM public.club_members WHERE club_id=p_club_id AND user_id=r.player_id FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'cashier_refund_wallet_missing' USING ERRCODE='23503';END IF;
   IF kind='cancellation' THEN
    actual_role:=member.role;
    IF actual_role IS NULL OR actual_role NOT IN('owner','co_owner','admin','super_agent','agent','sub_agent','player','member')
    THEN RAISE EXCEPTION 'cashier_player_role_unavailable' USING ERRCODE='42501';END IF;
   END IF;
   wallet_before:=member.chip_balance;wallet_user:=r.player_id;
  END IF;
 END IF;
 IF wallet_before IS NULL OR wallet_before<0 OR wallet_before::text IN('NaN','Infinity','-Infinity') OR wallet_before<>round(wallet_before,2)
   OR (kind='hold' AND wallet_before<p_amount)
 THEN RAISE EXCEPTION 'cashier_wallet_balance_unverified' USING ERRCODE='23514';END IF;
 wallet_after:=wallet_before+CASE WHEN kind='hold' THEN -p_amount ELSE p_amount END;
 -- Ambient unrelated ledger context must never contaminate this custody leg.
 PERFORM set_config('app.ledger_settlement','',true);PERFORM set_config('app.ledger_tournament','',true);
 PERFORM set_config('app.ledger_hand_id','',true);PERFORM set_config('app.ledger_tournament_id','',true);
 PERFORM public.fn_ca_declare_ledger(CASE WHEN kind='hold' THEN 'escrow_hold' ELSE 'escrow_release' END,
  'escrow',escrow_id,NULL,'cashout:'||request_id::text||CASE WHEN kind='hold' THEN ':hold' ELSE ':release' END,NULL);
 IF kind='approval' THEN
  UPDATE public.agents SET agent_wallet_balance=wallet_after,updated_at=at_time WHERE id=agent.id RETURNING agent_wallet_balance INTO persisted;
 ELSE
  UPDATE public.club_members SET chip_balance=wallet_after,updated_at=at_time WHERE club_id=member.club_id AND user_id=member.user_id RETURNING chip_balance INTO persisted;
 END IF;
 GET DIAGNOSTICS rows_written=ROW_COUNT;
 IF rows_written<>1 OR persisted IS DISTINCT FROM wallet_after THEN RAISE EXCEPTION 'cashier_wallet_write_missing' USING ERRCODE='23514';END IF;
 PERFORM set_config('app.ledger_category',COALESCE(old_category,''),true);PERFORM set_config('app.ledger_counterparty',COALESCE(old_cp,''),true);
 PERFORM set_config('app.ledger_counterparty_entity',COALESCE(old_entity,''),true);PERFORM set_config('app.ledger_idempotency_key',COALESCE(old_key,''),true);
 PERFORM set_config('app.ledger_settlement',COALESCE(old_settlement,''),true);PERFORM set_config('app.ledger_tournament',COALESCE(old_tournament,''),true);
 PERFORM set_config('app.ledger_hand_id',COALESCE(old_hand,''),true);PERFORM set_config('app.ledger_tournament_id',COALESCE(old_tournament_id,''),true);
 IF kind='hold' THEN
  INSERT INTO public.cashout_requests(id,club_id,player_id,agent_id,amount,status,player_note,created_at,updated_at)
   VALUES(request_id,p_club_id,actor,assigned,p_amount,'pending',note,at_time,at_time) RETURNING * INTO r;
  IF NOT FOUND THEN RAISE EXCEPTION 'cashier_request_write_missing' USING ERRCODE='23514';END IF;
  INSERT INTO public.chip_escrow(id,cashout_request_id,club_id,player_id,amount,locked_at)
   VALUES(escrow_id,request_id,p_club_id,actor,p_amount,at_time) RETURNING * INTO s;
  IF NOT FOUND THEN RAISE EXCEPTION 'cashier_escrow_write_missing' USING ERRCODE='23514';END IF;
 ELSE
  UPDATE public.chip_escrow SET released_at=at_time,release_type=v_release_type WHERE id=escrow_id RETURNING * INTO s;
  IF NOT FOUND THEN RAISE EXCEPTION 'cashier_escrow_write_missing' USING ERRCODE='23514';END IF;
  UPDATE public.cashout_requests SET status=request_status,
   agent_note=CASE WHEN kind IN('approval','decline') THEN note ELSE agent_note END,
   acknowledged_at=CASE WHEN kind IN('approval','decline') THEN at_time ELSE NULL END,
   completed_at=CASE WHEN kind='approval' THEN at_time ELSE NULL END,
   cancelled_at=CASE WHEN kind IN('cancellation','decline','expiry_refund') THEN at_time ELSE NULL END,updated_at=at_time
   WHERE id=request_id RETURNING * INTO r;
  IF NOT FOUND THEN RAISE EXCEPTION 'cashier_request_write_missing' USING ERRCODE='23514';END IF;
 END IF;
 SELECT count(*),(array_agg(id))[1] INTO leg_count,leg_id FROM public.chip_ledger
  WHERE idempotency_key='cashout:'||request_id::text||CASE WHEN kind='hold' THEN ':hold' ELSE ':release' END;
 IF leg_count<>1 THEN RAISE EXCEPTION 'cashier_physical_ledger_missing_or_duplicate' USING ERRCODE='23514';END IF;
 tx_type:=CASE kind WHEN 'hold' THEN 'cashout_request_escrow' WHEN 'approval' THEN 'cashout_approved'
   WHEN 'cancellation' THEN 'cashout_cancelled' WHEN 'decline' THEN 'cashout_denied' ELSE 'cashout_expired_refund' END;
 tx_note:=COALESCE(note,CASE kind WHEN 'hold' THEN 'Cash Out Requested. Chips Held In Escrow'
  WHEN 'approval' THEN 'Cash Out Approved. Escrow Released Into The Agent Wallet'
  WHEN 'cancellation' THEN 'Cash Out Cancelled. Escrow Returned To Player'
  WHEN 'decline' THEN 'Cash Out Declined. Escrow Returned To Player' ELSE 'Stale Cash Out Expired. Escrow Returned To Player' END);
 tx_from:=CASE WHEN kind IN('hold','approval') THEN r.player_id ELSE actor END;
 tx_to:=CASE kind WHEN 'hold' THEN assigned WHEN 'approval' THEN actor ELSE r.player_id END;
 INSERT INTO public.chip_transactions(id,club_id,from_user_id,to_user_id,amount,transaction_type,notes,related_cashout_id,metadata,balance_after,created_at)
  VALUES(tx_id,p_club_id,tx_from,tx_to,p_amount,tx_type,tx_note,request_id,
   jsonb_build_object('op_id',p_op_id,'cashier_document_version',1,'event_id',event_id,'assigned_agent_id',assigned,
     'actor_user_id',actor,'actor_role',actual_role),wallet_after,at_time);
 GET DIAGNOSTICS rows_written=ROW_COUNT;
 IF rows_written<>1 THEN RAISE EXCEPTION 'cashier_transaction_write_missing' USING ERRCODE='23514';END IF;
 SELECT array_agg(DISTINCT x ORDER BY x) INTO audience FROM unnest(CASE WHEN kind='hold' THEN ARRAY[r.player_id] ELSE ARRAY[club.owner_id,r.player_id] END||ARRAY[
   CASE WHEN kind IN('approval','decline') THEN actor ELSE assigned END]
   ||CASE WHEN kind IN('approval','decline') AND assigned IS NOT NULL
        AND EXISTS(SELECT 1 FROM public.profiles ap WHERE ap.id=assigned)
      THEN ARRAY[assigned] ELSE ARRAY[]::uuid[] END) x;
 IF cardinality(audience)<2 OR EXISTS(SELECT 1 FROM unnest(audience) x WHERE x IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=x))
 THEN RAISE EXCEPTION 'cashier_document_audience_unavailable' USING ERRCODE='23514';END IF;
 issue_time:=clock_timestamp();
 INSERT INTO public.accounting_cashier_events(id,contract_version,cashout_id,escrow_id,source_transaction_id,source_ledger_id,invoice_id,event_slot,event_kind,
  hold_event_id,hold_invoice_id,club_id,player_id,assigned_agent_id,actor_user_id,actor_role,ledger_actor_user_id,
  issuer_representative_id,issuer_name,player_name,audience_user_ids,op_id,operation_fingerprint,accepted_note,transaction_note,amount,
  ledger_from_type,ledger_from_entity_id,ledger_to_type,ledger_to_entity_id,wallet_owner_id,wallet_before,wallet_after,occurred_at,issued_at)
 VALUES(event_id,1,request_id,escrow_id,tx_id,leg_id,invoice_id,CASE WHEN kind='hold' THEN 'hold' ELSE 'terminal' END,kind,
  h.id,h.invoice_id,p_club_id,r.player_id,assigned,actor,actual_role,COALESCE(actor,'2d1cd6c3-5700-4af9-a271-d4863fdab20d'::uuid),
  club.owner_id,COALESCE(NULLIF(btrim(club.name),''),'Club'),public.fn_notify_display_name(r.player_id),audience,p_op_id,fingerprint,note,tx_note,p_amount,
  CASE WHEN kind='hold' THEN 'player_wallet' ELSE 'escrow' END,CASE WHEN kind='hold' THEN r.player_id ELSE escrow_id END,
  CASE kind WHEN 'hold' THEN 'escrow' WHEN 'approval' THEN 'agent_wallet' ELSE 'player_wallet' END,
  CASE kind WHEN 'hold' THEN escrow_id WHEN 'approval' THEN actor ELSE r.player_id END,wallet_user,wallet_before,wallet_after,at_time,issue_time)
 RETURNING * INTO e;
 IF NOT FOUND THEN RAISE EXCEPTION 'cashier_event_write_missing' USING ERRCODE='23514';END IF;
 payload:=public.fn_cashier_event_payload(e);
 INSERT INTO public.settlement_invoices(id,club_id,invoice_type,from_entity_type,from_entity_id,to_entity_type,to_entity_id,
  gross_amount,net_amount,deductions,breakdown,status,chips_transferred,transferred_at,source_ledger_id,notes,created_at,updated_at)
 VALUES(invoice_id,p_club_id,'cashier_cashout','club',p_club_id::text,'player',r.player_id::text,p_amount,p_amount,0,
  jsonb_build_object('kind','cashier_cashout','cashier',payload),CASE WHEN kind='hold' THEN 'generated' ELSE 'paid' END,kind<>'hold',
  CASE WHEN kind='hold' THEN NULL ELSE at_time END,leg_id,'Recorded cashier chip custody event.',issue_time,issue_time);
 GET DIAGNOSTICS rows_written=ROW_COUNT;
 IF rows_written<>1 THEN RAISE EXCEPTION 'cashier_invoice_write_missing' USING ERRCODE='23514';END IF;
 -- Read stored rows after all triggers; RETURNING alone cannot establish survival.
 IF kind='approval' THEN SELECT agent_wallet_balance INTO persisted FROM public.agents WHERE id=agent.id AND club_id=p_club_id AND user_id=actor;
 ELSE SELECT chip_balance INTO persisted FROM public.club_members WHERE club_id=member.club_id AND user_id=member.user_id AND club_id=p_club_id AND user_id=wallet_user;END IF;
 IF NOT FOUND OR persisted IS DISTINCT FROM wallet_after THEN RAISE EXCEPTION 'cashier_wallet_write_changed' USING ERRCODE='23514';END IF;
 result:=public.fn_cashier_operation_receipt(event_id,false);
 RETURN result;
END $function$;
CREATE OR REPLACE FUNCTION public.fn_cashout_request_v2(p_club_id uuid, p_amount numeric, p_expected_actor_id uuid, p_op_id uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 SELECT public.fn_cashier_cashout_transition('hold',p_club_id,NULL,p_amount,p_expected_actor_id,p_op_id,p_note);
$function$;
CREATE OR REPLACE FUNCTION public.fn_cashout_approve_v2(p_cashout_id uuid, p_club_id uuid, p_amount numeric, p_expected_actor_id uuid, p_op_id uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 SELECT public.fn_cashier_cashout_transition('approval',p_club_id,p_cashout_id,p_amount,p_expected_actor_id,p_op_id,p_note);
$function$;
CREATE OR REPLACE FUNCTION public.fn_cashout_release_v2(p_cashout_id uuid, p_club_id uuid, p_amount numeric, p_expected_actor_id uuid, p_op_id uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 SELECT public.fn_cashier_cashout_transition('release',p_club_id,p_cashout_id,p_amount,p_expected_actor_id,p_op_id,p_note);
$function$;
CREATE OR REPLACE FUNCTION public.fn_cashout_queue(p_club_id uuid DEFAULT NULL::uuid, p_status text DEFAULT 'pending'::text)
 RETURNS TABLE(id uuid, club_id uuid, player_id uuid, player_name text, player_avatar text, agent_id uuid, amount numeric, status text, player_note text, agent_note text, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select cr.id, cr.club_id, cr.player_id,
         public.fn_arena_name(pr.alias, pr.username, pr.display_name,
                              pr.first_name, pr.last_name, pr.full_name)::text,
         coalesce(nullif(btrim(pr.arena_avatar_url), ''), nullif(btrim(pr.avatar_url), ''), '')::text,
         cr.agent_id, cr.amount, cr.status, cr.player_note, cr.agent_note, cr.created_at
    from cashout_requests cr
    left join profiles pr on pr.id = cr.player_id
   where auth.uid() is not null
     and (p_club_id is null or cr.club_id = p_club_id)
     and (p_status is null or cr.status = p_status)
     and (
       cr.agent_id = auth.uid()
       or public.fn_club_bank_role(cr.club_id) in ('owner', 'co_owner', 'admin')
       or public.fn_club_is_in_downline(cr.club_id, auth.uid(), cr.player_id)
     )
   order by cr.created_at desc
   limit 200;
$function$;
CREATE OR REPLACE FUNCTION public.fn_cashout_request_card(p_cashout_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE me uuid:=auth.uid(); r public.cashout_requests%ROWTYPE; role text; allowed boolean; can_decide boolean;
BEGIN
 IF me IS NULL OR p_cashout_id IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO r FROM public.cashout_requests WHERE id=p_cashout_id;
 IF NOT FOUND THEN RETURN NULL; END IF;
 role:=public.fn_club_bank_role(r.club_id,me);
 allowed:= me=r.player_id OR me=r.agent_id OR COALESCE(role,'') IN('owner','co_owner','admin')
   OR COALESCE(public.fn_club_is_in_downline(r.club_id,me,r.player_id),false);
 IF NOT allowed THEN RETURN NULL; END IF;
 can_decide:= r.status='pending' AND me<>r.player_id
   AND COALESCE(role,'') IN('owner','co_owner','admin','super_agent','agent','sub_agent')
   AND COALESCE(public.fn_club_cashier_can_transact(r.club_id,me,r.player_id),false);
 RETURN jsonb_build_object('cashout_id',r.id,'club_id',r.club_id,
  'club_name',(SELECT name FROM public.clubs WHERE id=r.club_id),
  'player_id',r.player_id,'player_name',public.fn_notify_display_name(r.player_id),
  'agent_id',r.agent_id,'amount',round(r.amount,2)::text,'status',r.status,
  'player_note',r.player_note,'agent_note',r.agent_note,'created_at',r.created_at,
  'is_player',me=r.player_id,'can_decide',can_decide);
END $function$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION fn_cashout_request_v2(uuid,numeric,uuid,uuid,text),fn_cashout_approve_v2(uuid,uuid,numeric,uuid,uuid,text),fn_cashout_release_v2(uuid,uuid,numeric,uuid,uuid,text),fn_cashout_queue(uuid,text),fn_cashout_request_card(uuid),fn_club_notice_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_club_notice_board(uuid,uuid,text,jsonb) TO service_role;
CREATE TRIGGER fixture_member_ledger AFTER UPDATE OF chip_balance ON club_members FOR EACH ROW EXECUTE FUNCTION fn_ca_autoledger('chip_balance=player_wallet');
CREATE TRIGGER fixture_agent_ledger AFTER UPDATE OF agent_wallet_balance ON agents FOR EACH ROW EXECUTE FUNCTION fn_ca_autoledger('agent_wallet_balance=agent_wallet');
CREATE TRIGGER fixture_bank_ledger AFTER UPDATE OF chip_treasury ON clubs FOR EACH ROW EXECUTE FUNCTION fn_ca_autoledger('chip_treasury=club_treasury');
CREATE TRIGGER fixture_enrich BEFORE INSERT ON chip_ledger FOR EACH ROW EXECUTE FUNCTION fn_ca_chip_ledger_enrich();
CREATE TRIGGER fixture_key AFTER INSERT ON chip_ledger FOR EACH ROW EXECUTE FUNCTION zz_chip_ledger_key_is_claimed_once();
CREATE CONSTRAINT TRIGGER club_staff_notice_membership AFTER INSERT OR UPDATE OF role,status,is_active,membership_lifecycle_status,agent_id,club_id,user_id OR DELETE ON club_members DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fn_club_staff_notice_role_event();
CREATE CONSTRAINT TRIGGER club_staff_notice_agents AFTER INSERT OR UPDATE OF role,status,club_id,user_id OR DELETE ON agents DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fn_club_staff_notice_role_event();
CREATE CONSTRAINT TRIGGER club_staff_notice_owner AFTER UPDATE OF owner_id ON clubs DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fn_club_staff_notice_role_event();
CREATE TRIGGER guard_club_staff_notice_participant BEFORE INSERT OR UPDATE ON social_conversation_participants FOR EACH ROW EXECUTE FUNCTION fn_guard_club_staff_notice_participant();
-- External transport fixture writes the exact witnesses consumed by the real
-- fn_cashier_assert_delivery; it does not move money or supply receipt success.
CREATE FUNCTION fixture_deliver() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE e accounting_cashier_events;p uuid;conv uuid;msg uuid;nid uuid;payload jsonb;meta jsonb;body text;cp jsonb;
BEGIN
 SELECT * INTO e FROM accounting_cashier_events WHERE invoice_id=NEW.id;
 IF e.id IS NULL THEN RETURN NEW; END IF;
 NEW.invoice_number:='FIX-'||NEW.id::text;NEW.message_sent:=true;NEW.message_sent_at:=now();
 payload:=fn_cashier_event_payload(e);body:=fn_cashier_document_body(e.id,NEW.invoice_number);
 FOREACH p IN ARRAY e.audience_user_ids LOOP
  conv:=gen_random_uuid();msg:=gen_random_uuid();nid:=gen_random_uuid();
  meta:=jsonb_build_object('invoice_id',NEW.id,'cashier',payload,'invoice_type','cashier_cashout','amount',NEW.net_amount);
  cp:=fn_cashier_notice_copy(e,p,NEW.invoice_number);
  INSERT INTO social_conversations(id) VALUES(conv);
  INSERT INTO accounting_conversations(conversation_id,scope_id,issuer_type,issuer_id,sender_id,recipient_id) VALUES(conv,e.club_id,'club',e.club_id,e.issuer_representative_id,p);
  INSERT INTO social_conversation_participants(conversation_id,user_id) VALUES(conv,e.issuer_representative_id),(conv,p) ON CONFLICT DO NOTHING;
  INSERT INTO social_messages(id,conversation_id,sender_id,content,message_type,media_metadata) VALUES(msg,conv,e.issuer_representative_id,body,'invoice',meta);
  INSERT INTO notifications(id,user_id,type,data,metadata,title,message,action_url) VALUES(nid,p,'accounting_invoice',meta,meta,cp->>'title',cp->>'message','/hub/messenger?conversation='||conv);
  INSERT INTO accounting_invoice_deliveries(invoice_id,recipient_id,message_id,notification_id,delivery_mode) VALUES(NEW.id,p,msg,nid,'immediate');
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER fixture_delivery BEFORE INSERT ON settlement_invoices FOR EACH ROW EXECUTE FUNCTION fixture_deliver();
