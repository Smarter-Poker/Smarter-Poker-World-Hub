CREATE OR REPLACE FUNCTION public.fn_check_anti_farming_gift_cap(p_sender_id uuid, p_amount integer)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_created_at timestamptz;
    v_account_age_days integer;
    v_is_vip boolean;
    v_has_paid boolean;
    v_daily_sent integer;
    v_daily_limit integer := 500;
BEGIN
    SELECT created_at, is_vip INTO v_created_at, v_is_vip
    FROM public.profiles WHERE id = p_sender_id;

    SELECT EXISTS (
      SELECT 1 FROM public.diamond_purchases
      WHERE user_id = p_sender_id
        AND status = 'completed'
        AND refunded_at IS NULL
    ) INTO v_has_paid;

    -- Type mismatch fix: cast the EXTRACT numeric to int
    v_account_age_days := (EXTRACT(DAY FROM now() - v_created_at))::int;

    -- Harmonized 30-day new-user age gate
    IF v_account_age_days < 30 AND NOT COALESCE(v_is_vip, false) AND NOT COALESCE(v_has_paid, false) THEN
        RETURN json_build_object(
            'allowed', false,
            'reason', 'NEW_ACCOUNT_COOLDOWN',
            'code', 'new_user_block',
            'days_remaining', (30 - v_account_age_days),
            'lift_date', (v_created_at + interval '30 days')
        );
    END IF;

    IF NOT COALESCE(v_is_vip, false) THEN
        -- Fix query to use transaction_type column instead of type
        SELECT COALESCE(SUM(ABS(amount)), 0)::int INTO v_daily_sent
        FROM public.diamond_transactions
        WHERE user_id = p_sender_id
          AND transaction_type IN ('diamond_gift_sent', 'live_gift_sent')
          AND created_at >= now() - interval '24 hours';

        IF (v_daily_sent + p_amount) > v_daily_limit THEN
            RETURN json_build_object(
                'allowed', false,
                'reason', 'DAILY_GIFT_CAP_EXCEEDED',
                'limit', v_daily_limit,
                'current', v_daily_sent,
                'attempted', p_amount
            );
        END IF;
    END IF;

    RETURN json_build_object('allowed', true);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.fn_check_anti_farming_gift_cap(p_sender_id uuid, p_recipient_id uuid, p_amount integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$                                                                                                                                                                                
 DECLARE                                                                                                                                                                                      
   v_kingfish              uuid := '47965354-0e56-43ef-931c-ddaab82af765'::uuid;                                                                                                                    
   v_pair_24h              bigint;                                                                                                                                                            
   v_total_24h             bigint;                                                                                                                                                            
   v_burst_60s             bigint;                                                                                                                                                            
   v_fresh_paid_24h        bigint;                                                                                                                                                            
   v_active_ban            boolean;                                                                                                                                                           
   v_is_flagged            boolean;                                                                                                                                                           
   v_created_at            timestamptz;                                                                                                                                                       
   v_first_purchase_at     timestamptz;                                                                                                                                                       
   v_account_age_days      numeric;                                                                                                                                                           
   v_days_since_purchase   numeric;                                                                                                                                                           
   v_lift_via_age          timestamptz;                                                                                                                                                       
   v_lift_via_purchase     timestamptz;                                                                                                                                                       
   v_lift_at               timestamptz;                                                                                                                                                       
   v_lift_date_str         text;                                                                                                                                                              
   v_lift_msg              text;                                                                                                                                                              
   CAP_PER_PAIR_24H        constant integer := 5000;                                                                                                                                          
   CAP_PER_USER_24H        constant integer := 50000;                                                                                                                                         
   CAP_BURST_60S           constant integer := 2000;                                                                                                                                          
   CAP_FRESH_PAID_24H      constant integer := 500;                                                                                                                                           
   TRUST_AGE_DAYS          constant integer := 120;                                                                                                                                           
   NEW_USER_DAYS           constant integer := 30;                                                                                                                                            
   PURCHASE_COOLDOWN_DAYS  constant integer := 7;                                                                                                                                             
 BEGIN                                                                                                                                                                                        
   -- ── Argument validation ─────────────────────────────────────────────────                                                                                                                
   IF p_sender_id IS NULL OR p_recipient_id IS NULL OR p_amount IS NULL OR p_amount <= 0 THEN                                                                                                 
     RETURN jsonb_build_object(                                                                                                                                                               
       'allowed', false,                                                                                                                                                                      
       'reason', 'Invalid arguments',                                                                                                                                                         
       'code', 'invalid_args',                                                                                                                                                                
       'title', 'Invalid Request',                                                                                                                                                            
       'popup_message', 'The Request Is Missing Required Information',                                                                                                                        
       'popup_explanation', 'Please Refresh The Page And Try Again'                                                                                                                           
     );                                                                                                                                                                                       
   END IF;                                                                                                                                                                                    
   IF p_sender_id = p_recipient_id THEN                                                                                                                                                       
     RETURN jsonb_build_object(                                                                                                                                                               
       'allowed', false,                                                                                                                                                                      
       'reason', 'Cannot send to self',                                                                                                                                                       
       'code', 'self_transfer',                                                                                                                                                               
       'title', 'Cannot Send To Yourself',                                                                                                                                                    
       'popup_message', 'You Cannot Send Diamonds To Your Own Account',                                                                                                                       
       'popup_explanation', 'Please Choose A Different Recipient'                                                                                                                             
     );                                                                                                                                                                                       
   END IF;                                                                                                                                                                                    
                                                                                                                                                                                              
   -- ── KINGFISH bypass ─────────────────────────────────────────────────────                                                                                                                
   IF p_sender_id = v_kingfish THEN                                                                                                                                                           
     RETURN jsonb_build_object('allowed', true, 'reason', 'kingfish_sender_bypass', 'code', 'ok');                                                                                            
   END IF;                                                                                                                                                                                    
                                                                                                                                                                                              
   -- ── Banned-by-recipient ─────────────────────────────────────────────────                                                                                                                
   SELECT EXISTS (                                                                                                                                                                            
     SELECT 1 FROM live_bans lb                                                                                                                                                               
       JOIN live_streams ls ON ls.id = lb.stream_id                                                                                                                                           
      WHERE lb.banned_user_id = p_sender_id                                                                                                                                                   
        AND ls.broadcaster_id = p_recipient_id                                                                                                                                                
   ) INTO v_active_ban;                                                                                                                                                                       
   IF v_active_ban THEN                                                                                                                                                                       
     RETURN jsonb_build_object(                                                                                                                                                               
       'allowed', false,                                                                                                                                                                      
       'reason', 'You are banned from this broadcaster',                                                                                                                                      
       'code', 'banned_by_recipient',                                                                                                                                                         
       'title', 'You Are Banned',                                                                                                                                                             
       'popup_message', 'This Broadcaster Has Banned You From Sending Gifts',                                                                                                                 
       'popup_explanation', 'You Will Need To Contact The Broadcaster Directly To Request An Unban'                                                                                           
     );                                                                                                                                                                                       
   END IF;                                                                                                                                                                                    
                                                                                                                                                                                              
   -- ── Load sender state ───────────────────────────────────────────────────                                                                                                                
   SELECT COALESCE(is_farming_flagged, false), created_at                                                                                                                                     
     INTO v_is_flagged, v_created_at                                                                                                                                                          
     FROM profiles WHERE id = p_sender_id;                                                                                                                                                    
                                                                                                                                                                                              
   -- ── Compute lift timestamps (used by any blocked path below) ────────────                                                                                                                
   IF v_is_flagged IS NOT TRUE THEN                                                                                                                                                           
     SELECT MIN(completed_at) INTO v_first_purchase_at                                                                                                                                        
       FROM diamond_purchases                                                                                                                                                                 
       WHERE user_id = p_sender_id                                                                                                                                                            
         AND status = 'completed'                                                                                                                                                             
         AND refunded_at IS NULL;                                                                                                                                                             
                                                                                                                                                                                              
     v_account_age_days := CASE                                                                                                                                                               
       WHEN v_created_at IS NULL THEN 0                                                                                                                                                       
       ELSE EXTRACT(epoch FROM (now() - v_created_at)) / 86400                                                                                                                                
     END;                                                                                                                                                                                     
     v_days_since_purchase := CASE                                                                                                                                                            
       WHEN v_first_purchase_at IS NULL THEN NULL                                                                                                                                             
       ELSE EXTRACT(epoch FROM (now() - v_first_purchase_at)) / 86400                                                                                                                         
     END;                                                                                                                                                                                     
                                                                                                                                                                                              
     v_lift_via_age := CASE                                                                                                                                                                   
       WHEN v_created_at IS NULL THEN NULL                                                                                                                                                    
       ELSE v_created_at + make_interval(days => TRUST_AGE_DAYS)                                                                                                                              
     END;                                                                                                                                                                                     
     v_lift_via_purchase := CASE                                                                                                                                                              
       WHEN v_first_purchase_at IS NULL THEN NULL                                                                                                                                             
       ELSE v_first_purchase_at + make_interval(days => PURCHASE_COOLDOWN_DAYS)                                                                                                               
     END;                                                                                                                                                                                     
     v_lift_at := CASE                                                                                                                                                                        
       WHEN v_lift_via_age IS NOT NULL AND v_lift_via_purchase IS NOT NULL THEN LEAST(v_lift_via_age, v_lift_via_purchase)                                                                    
       WHEN v_lift_via_purchase IS NOT NULL THEN v_lift_via_purchase                                                                                                                          
       WHEN v_lift_via_age IS NOT NULL THEN v_lift_via_age                                                                                                                                    
       ELSE NULL                                                                                                                                                                              
     END;                                                                                                                                                                                     
   ELSE                                                                                                                                                                                       
     v_lift_at := NULL;  -- flagged: requires admin action                                                                                                                                    
   END IF;                                                                                                                                                                                    
                                                                                                                                                                                              
   -- Title-Cased lift date string ("Your Limits Are Fully Lifted On May 19, 2026")                                                                                                           
   v_lift_msg := CASE                                                                                                                                                                         
     WHEN v_is_flagged THEN 'Your Account Has Restrictions That Require Admin Review To Lift'                                                                                                 
     WHEN v_lift_at IS NOT NULL THEN                                                                                                                                                          
       'Your Limits Are Fully Lifted On ' ||                                                                                                                                                  
       to_char(v_lift_at AT TIME ZONE 'UTC', 'FMMonth FMDD, YYYY')                                                                                                                            
     ELSE                                                                                                                                                                                     
       'Your Limits Lift After Your Account Reaches 120 Days Or After You Purchase Diamonds And Wait 7 Days'                                                                                  
   END;                                                                                                                                                                                       
                                                                                                                                                                                              
   -- ── Trust ladder (only for unflagged senders) ───────────────────────────                                                                                                                
   IF v_is_flagged IS NOT TRUE THEN                                                                                                                                                           
     -- Tier 4: paid AND ≥7d since first completed purchase → unlimited                                                                                                                       
     IF v_first_purchase_at IS NOT NULL                                                                                                                                                       
        AND v_days_since_purchase >= PURCHASE_COOLDOWN_DAYS THEN                                                                                                                              
       RETURN jsonb_build_object(                                                                                                                                                             
         'allowed', true,                                                                                                                                                                     
         'reason',  'trusted_purchaser_7d_bypass',                                                                                                                                            
         'code',    'ok'                                                                                                                                                                      
       );                                                                                                                                                                                     
     END IF;                                                                                                                                                                                  
                                                                                                                                                                                              
     -- Tier 5: ≥120d account age + unflagged → unlimited                                                                                                                                     
     IF v_account_age_days >= TRUST_AGE_DAYS THEN                                                                                                                                             
       RETURN jsonb_build_object(                                                                                                                                                             
         'allowed', true,                                                                                                                                                                     
         'reason',  'trusted_120d_unflagged_bypass',                                                                                                                                          
         'code',    'ok'                                                                                                                                                                      
       );                                                                                                                                                                                     
     END IF;                                                                                                                                                                                  
                                                                                                                                                                                              
     -- Tier 6: <30d + paid + <7d since purchase → 500/24h cap (with popup)                                                                                                                   
     IF v_account_age_days < NEW_USER_DAYS                                                                                                                                                    
        AND v_first_purchase_at IS NOT NULL THEN                                                                                                                                              
       SELECT COALESCE(SUM(ABS(amount)), 0) INTO v_fresh_paid_24h                                                                                                                             
         FROM diamond_transactions                                                                                                                                                            
        WHERE user_id = p_sender_id                                                                                                                                                           
          AND amount  < 0                                                                                                                                                                     
          AND created_at > now() - interval '24 hours'                                                                                                                                        
          AND (transaction_type IN ('live_gift_sent','diamond_gift_sent')                                                                                                                     
            OR source IN ('stream_gift','wallet_transfer','wallet_diamond_transfer'));                                                                                                        
                                                                                                                                                                                              
       IF v_fresh_paid_24h + p_amount > CAP_FRESH_PAID_24H THEN                                                                                                                               
         RETURN jsonb_build_object(                                                                                                                                                           
           'allowed', false,                                                                                                                                                                  
           'reason',  format('Fresh-paid users are capped at %s 💎 / 24h for the first 7 days after purchase', CAP_FRESH_PAID_24H),                                                           
           'code',    'fresh_paid_24h_cap',                                                                                                                                                   
           'title',   'Daily Limit Reached',                                                                                                                                                  
           'popup_message', format('You Have Reached Your Daily %s Diamond Sending Limit', CAP_FRESH_PAID_24H),                                                                               
           'popup_explanation', format('New Paid Accounts Are Limited To %s Diamonds Per Day During The First 7 Days After Your First Purchase To Protect Against Fraud', CAP_FRESH_PAID_24H),
           'next_send_message', 'You Can Send More Diamonds Tomorrow',                                                                                                                        
           'limits_lift_at', v_lift_at,                                                                                                                                                       
           'limits_lift_message', v_lift_msg,                                                                                                                                                 
           'amount_sent_24h', v_fresh_paid_24h,                                                                                                                                               
           'amount_cap_24h', CAP_FRESH_PAID_24H                                                                                                                                               
         );                                                                                                                                                                                   
       END IF;                                                                                                                                                                                
                                                                                                                                                                                              
       RETURN jsonb_build_object(                                                                                                                                                             
         'allowed', true,                                                                                                                                                                     
         'reason',  'fresh_paid_within_500_per_day',                                                                                                                                          
         'code',    'ok'                                                                                                                                                                      
       );                                                                                                                                                                                     
     END IF;                                                                                                                                                                                  
   END IF;                                                                                                                                                                                    
                                                                                                                                                                                              
   -- ── Tier 7: standard pair/user/burst caps (with popups) ─────────────────                                                                                                                
                                                                                                                                                                                              
   SELECT COALESCE(SUM(ABS(amount)), 0) INTO v_pair_24h                                                                                                                                       
     FROM diamond_transactions                                                                                                                                                                
    WHERE user_id = p_sender_id                                                                                                                                                               
      AND amount  < 0                                                                                                                                                                         
      AND created_at > now() - interval '24 hours'                                                                                                                                            
      AND metadata->>'recipient_id' = p_recipient_id::text                                                                                                                                    
      AND (transaction_type IN ('live_gift_sent','diamond_gift_sent')                                                                                                                         
        OR source IN ('stream_gift','wallet_transfer','wallet_diamond_transfer'));                                                                                                            
   IF v_pair_24h + p_amount > CAP_PER_PAIR_24H THEN                                                                                                                                           
     RETURN jsonb_build_object(                                                                                                                                                               
       'allowed', false,                                                                                                                                                                      
       'reason', format('Pair limit hit (%s 💎 / 24h to this user)', CAP_PER_PAIR_24H),                                                                                                       
       'code', 'pair_24h_cap',                                                                                                                                                                
       'title', 'Pair Limit Reached',                                                                                                                                                         
       'popup_message', format('You Have Sent %s Diamonds To This User In The Last 24 Hours', CAP_PER_PAIR_24H),                                                                              
       'popup_explanation', format('You Can Send Up To %s Diamonds Per User Per Day While Your Account Is Not Yet Fully Trusted', CAP_PER_PAIR_24H),                                          
       'next_send_message', 'You Can Send More Diamonds To This User Tomorrow',                                                                                                               
       'limits_lift_at', v_lift_at,                                                                                                                                                           
       'limits_lift_message', v_lift_msg,                                                                                                                                                     
       'amount_sent_24h', v_pair_24h,                                                                                                                                                         
       'amount_cap_24h', CAP_PER_PAIR_24H                                                                                                                                                     
     );                                                                                                                                                                                       
   END IF;                                                                                                                                                                                    
                                                                                                                                                                                              
   SELECT COALESCE(SUM(ABS(amount)), 0) INTO v_total_24h                                                                                                                                      
     FROM diamond_transactions                                                                                                                                                                
    WHERE user_id = p_sender_id                                                                                                                                                               
      AND amount  < 0                                                                                                                                                                         
      AND created_at > now() - interval '24 hours'                                                                                                                                            
      AND (transaction_type IN ('live_gift_sent','diamond_gift_sent')                                                                                                                         
        OR source IN ('stream_gift','wallet_transfer','wallet_diamond_transfer'));                                                                                                            
   IF v_total_24h + p_amount > CAP_PER_USER_24H THEN                                                                                                                                          
     RETURN jsonb_build_object(                                                                                                                                                               
       'allowed', false,                                                                                                                                                                      
       'reason', format('Daily limit hit (%s 💎 / 24h)', CAP_PER_USER_24H),                                                                                                                   
       'code', 'user_24h_cap',                                                                                                                                                                
       'title', 'Daily Limit Reached',                                                                                                                                                        
       'popup_message', format('You Have Sent %s Diamonds Total In The Last 24 Hours', CAP_PER_USER_24H),                                                                                     
       'popup_explanation', format('Your Account Can Send Up To %s Diamonds Per Day Until It Is Fully Trusted', CAP_PER_USER_24H),                                                            
       'next_send_message', 'You Can Send More Diamonds Tomorrow',                                                                                                                            
       'limits_lift_at', v_lift_at,                                                                                                                                                           
       'limits_lift_message', v_lift_msg,                                                                                                                                                     
       'amount_sent_24h', v_total_24h,                                                                                                                                                        
       'amount_cap_24h', CAP_PER_USER_24H                                                                                                                                                     
     );                                                                                                                                                                                       
   END IF;                                                                                                                                                                                    
                                                                                                                                                                                              
   SELECT COALESCE(SUM(ABS(amount)), 0) INTO v_burst_60s                                                                                                                                      
     FROM diamond_transactions                                                                                                                                                                
    WHERE user_id = p_sender_id                                                                                                                                                               
      AND amount  < 0                                                                                                                                                                         
      AND created_at > now() - interval '60 seconds'                                                                                                                                          
      AND (transaction_type IN ('live_gift_sent','diamond_gift_sent')                                                                                                                         
        OR source IN ('stream_gift','wallet_transfer','wallet_diamond_transfer'));                                                                                                            
   IF v_burst_60s + p_amount > CAP_BURST_60S THEN                                                                                                                                             
     RETURN jsonb_build_object(                                                                                                                                                               
       'allowed', false,                                                                                                                                                                      
       'reason', format('Slow down — %s 💎 in 60s is too fast', CAP_BURST_60S),                                                                                                               
       'code', 'burst_cap',                                                                                                                                                                   
       'title', 'Sending Too Fast',                                                                                                                                                           
       'popup_message', format('You Have Sent %s Diamonds In The Last 60 Seconds', CAP_BURST_60S),                                                                                            
       'popup_explanation', format('Please Wait A Few Seconds Between Gifts To Avoid Hitting The %s Diamond Burst Limit', CAP_BURST_60S),                                                     
       'next_send_message', 'You Can Send More In About A Minute',                                                                                                                            
       'limits_lift_at', v_lift_at,                                                                                                                                                           
       'limits_lift_message', v_lift_msg,                                                                                                                                                     
       'amount_sent_60s', v_burst_60s,                                                                                                                                                        
       'amount_cap_60s', CAP_BURST_60S                                                                                                                                                        
     );                                                                                                                                                                                       
   END IF;                                                                                                                                                                                    
                                                                                                                                                                                              
   RETURN jsonb_build_object('allowed', true, 'reason', 'within_caps', 'code', 'ok');                                                                                                         
 END;                                                                                                                                                                                         
 $function$
;
CREATE OR REPLACE FUNCTION public.fn_execute_union_rakeback(p_union_id uuid, p_period_start timestamp with time zone, p_period_end timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller        uuid := auth.uid();
  v_owner         uuid;
  v_settings      jsonb;
  v_share         numeric;
  v_ratio         numeric;
  v_total         numeric := 0;
  v_owner_balance numeric;
  v_clubs_paid    integer := 0;
  v_club          record;
  v_ok            boolean;
BEGIN
  IF p_union_id IS NULL OR p_period_start IS NULL OR p_period_end IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_params');
  END IF;

  -- Lock the union row: serialises concurrent triggers on the same union so the
  -- second waits, then sees the log row and returns already_executed.
  SELECT owner_id, settings INTO v_owner, v_settings
  FROM unions WHERE id = p_union_id FOR UPDATE;
  IF v_owner IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'union_not_found');
  END IF;

  -- Authorise: only the union owner may trigger a rakeback run.
  IF v_caller IS NULL OR v_caller <> v_owner THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;

  -- Idempotency: one payout per (union, period).
  IF EXISTS (
    SELECT 1 FROM union_rakeback_log
    WHERE union_id = p_union_id
      AND period_start = p_period_start
      AND period_end = p_period_end
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_executed');
  END IF;

  -- Union keeps share%, pays back (100-share)%. Default 10% share => 90% back.
  v_share := COALESCE(NULLIF(v_settings->>'revenueSharePercent', '')::numeric, 10);
  IF v_share < 0 OR v_share > 100 THEN v_share := 10; END IF;
  v_ratio := (100 - v_share) / 100.0;

  -- Per-club rakeback (2-decimal truncation, matching the legacy client math),
  -- summed from the live per-hand rake_records ledger over the period.
  SELECT COALESCE(SUM(rakeback), 0) INTO v_total
   FROM (
       SELECT trunc(COALESCE(SUM(rr.rake_amount), 0) * v_ratio * 100) / 100 AS rakeback
       FROM clubs c
       LEFT JOIN rake_records rr
              ON rr.club_id = c.id
             AND rr.created_at >= p_period_start
             AND rr.created_at <  p_period_end
       WHERE c.union_id = p_union_id
       GROUP BY c.id
   ) sub WHERE rakeback > 0;

  IF v_total <= 0 THEN
    RETURN jsonb_build_object('success', true, 'clubs_paid', 0,
      'total_rakeback', 0, 'union_retained', 0, 'note', 'no_rake');
  END IF;

  -- Balance pre-check: the union owner's PLAYER wallet must cover the FULL total
  -- (no partial payouts — all-or-nothing).
  SELECT balance INTO v_owner_balance
  FROM wallets WHERE user_id = v_owner AND wallet_type = 'PLAYER';
  IF COALESCE(v_owner_balance, 0) < v_total THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_balance',
      'required', v_total, 'balance', COALESCE(v_owner_balance, 0));
  END IF;

  -- Move money. atomic_wallet_transfer is whitelisted by guard_wallet_balance_write
  -- and logs chip_transactions. Any false result RAISEs -> full rollback.
  FOR v_club IN 
     SELECT c.id AS club_id,
            c.owner_id AS club_owner,
            trunc(COALESCE(SUM(rr.rake_amount), 0) * v_ratio * 100) / 100 AS rakeback
     FROM clubs c
     LEFT JOIN rake_records rr
            ON rr.club_id = c.id
           AND rr.created_at >= p_period_start
           AND rr.created_at <  p_period_end
     WHERE c.union_id = p_union_id
     GROUP BY c.id, c.owner_id
     HAVING trunc(COALESCE(SUM(rr.rake_amount), 0) * v_ratio * 100) / 100 > 0
   LOOP
    IF v_club.club_owner IS NULL THEN
      RAISE EXCEPTION 'club % has no owner', v_club.club_id;
    END IF;
    v_ok := atomic_wallet_transfer(
      v_owner, v_club.club_owner, v_club.rakeback,
      'settlement', 'Union rakeback', 'Union rakeback', p_union_id
    );
    IF NOT v_ok THEN
      RAISE EXCEPTION 'union rakeback transfer failed for club %', v_club.club_id;
    END IF;
    v_clubs_paid := v_clubs_paid + 1;
  END LOOP;

  -- Idempotency log (unique on union+period) — commits with the transfers.
  INSERT INTO union_rakeback_log (union_id, period_start, period_end, total_rakeback, executed_at)
  VALUES (p_union_id, p_period_start, p_period_end, v_total, now());

  RETURN jsonb_build_object('success', true,
    'clubs_paid', v_clubs_paid, 'total_rakeback', v_total, 'union_retained', 0);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.fn_tournament_unregister_counter(p_tournament_id uuid, p_buy_in numeric DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_count integer;
BEGIN
  UPDATE tournaments
  SET registered_count = GREATEST(COALESCE(registered_count, 0) - 1, 0),
      prize_pool = GREATEST(COALESCE(prize_pool, 0) - COALESCE(p_buy_in, 0), 0),
      updated_at = NOW()
  WHERE id = p_tournament_id
  RETURNING COALESCE(registered_count, 0) INTO v_count;

  IF v_count IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'tournament not found');
  END IF;

  RETURN jsonb_build_object('success', true, 'registered_count', v_count);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.get_mlb_team_detail(p_team_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    res_team JSONB;
    res_stats JSONB;
    res_games JSONB;
    res_matchup JSONB;
    res_props JSONB;
    latest_slate DATE;
BEGIN
    -- Get Team Base Profile
    SELECT jsonb_build_object(
        'team_id', t.team_id,
        'name', t.name,
        'abbr', t.abbr,
        'league', t.league,
        'division', t.division,
        'run_diff', t.run_diff,
        'streaks', t.streaks,
        'splits', t.splits
    ) INTO res_team
    FROM public.v_team_profile t
    WHERE t.team_id = p_team_id;

    -- Return 404 equivalent if not found
    IF res_team IS NULL THEN
        RETURN NULL;
    END IF;

    -- Get Team Aggregate Stats (latest season snapshot)
    SELECT jsonb_build_object(
        'era', era,
        'fip', fip,
        'wrc_plus', wrc_plus,
        'woba', woba,
        'pitching_war', pitching_war,
        'hitting_war', hitting_war
    ) INTO res_stats
    FROM public.agg_team
    WHERE team_id = p_team_id AND window_kind = 'season'
    ORDER BY as_of DESC
    LIMIT 1;

    -- Get Recent & Upcoming Games
    SELECT jsonb_agg(
        jsonb_build_object(
            'game_id', g.game_id,
            'start_time', g.start_time,
            'home_team', g.home_team,
            'away_team', g.away_team,
            'status', g.status
        )
    ) INTO res_games
    FROM (
        SELECT game_pk AS game_id, start_time, home_team, away_team, status
        FROM public.raw_games
        WHERE home_team = (res_team->>'name') OR away_team = (res_team->>'name')
        ORDER BY start_time DESC
        LIMIT 10
    ) g;

    -- Get Latest Slate
    SELECT MAX(as_of_ts)::DATE INTO latest_slate FROM public.pred_props;

    -- Get Raw Props for the latest slate for this team
    SELECT jsonb_agg(row_to_json(p)) INTO res_props
    FROM public.pred_props p
    WHERE p.team = (res_team->>'name') AND p.as_of_ts::DATE = latest_slate;

    -- Combine into final JSONB payload
    RETURN jsonb_build_object(
        'team', res_team,
        'stats', res_stats,
        'games', COALESCE(res_games, '[]'::jsonb),
        'matchup', NULL, -- Matchup logic can be extended here
        'props_raw', COALESCE(res_props, '[]'::jsonb),
        'slate_date', latest_slate
    );
END;
$function$
;
CREATE OR REPLACE FUNCTION public.get_portfolio_stats(p_days integer DEFAULT NULL::integer, p_market text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
    v_total_bets int;
    v_wins int;
    v_losses int;
    v_pushes int;
    v_total_pnl numeric;
    v_peak_bankroll numeric;
    v_max_drawdown numeric;
    v_total_staked numeric;
    v_roi numeric;
    v_win_rate numeric;
    v_final_bankroll numeric;

    v_anchor timestamptz;
    v_cutoff timestamptz;

    v_weekly jsonb;
    v_recent jsonb;

    v_result jsonb;
BEGIN
    -- Initialize variables
    v_total_bets := 0;
    v_wins := 0;
    v_losses := 0;
    v_pushes := 0;
    v_total_pnl := 0;
    v_peak_bankroll := 1000;
    v_max_drawdown := 0;
    v_total_staked := 0;

    -- Anchor the rolling timeframe window to the latest bet in the dataset (the end of
    -- the backtest) rather than NOW(), so "last N days" stays meaningful when the data
    -- is not refreshed daily. NULL p_days => no cutoff (YTD / all-time).
    SELECT MAX(as_of_ts) INTO v_anchor FROM sim_bets;
    v_cutoff := CASE
        WHEN p_days IS NULL OR v_anchor IS NULL THEN NULL
        ELSE v_anchor - (INTERVAL '1 day' * p_days)
    END;

    -- Aggregate overall stats in a single scan
    SELECT
        COUNT(*),
        COALESCE(SUM(CASE WHEN pnl > 0 OR result = 'WIN' THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN pnl < 0 OR result = 'LOSS' THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN pnl = 0 AND result NOT IN ('WIN', 'LOSS') THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(pnl), 0),
        COALESCE(SUM(stake), 0)
    INTO
        v_total_bets, v_wins, v_losses, v_pushes, v_total_pnl, v_total_staked
    FROM sim_bets
    WHERE (v_cutoff IS NULL OR as_of_ts >= v_cutoff)
      AND (p_market IS NULL OR market = p_market);

    -- Calculate Peak Bankroll and Max Drawdown (stable order: as_of_ts then id)
    SELECT
        COALESCE(MAX(running_max), 1000),
        COALESCE(MAX((running_max - bankroll_after) / NULLIF(running_max, 0)), 0)
    INTO v_peak_bankroll, v_max_drawdown
    FROM (
        SELECT
            bankroll_after,
            MAX(bankroll_after) OVER (ORDER BY as_of_ts ASC, id ASC) as running_max
        FROM sim_bets
        WHERE (v_cutoff IS NULL OR as_of_ts >= v_cutoff)
          AND (p_market IS NULL OR market = p_market)
    ) sub;

    -- Weekly Curve Calculation (last bankroll of week resolved by as_of_ts then id)
    SELECT jsonb_agg(
        jsonb_build_object(
            'weekOf', week_start,
            'bets', bets,
            'pnl', pnl,
            'bankroll', last_bankroll
        )
    ) INTO v_weekly
    FROM (
        SELECT
            TO_CHAR(DATE_TRUNC('week', as_of_ts::timestamp), 'YYYY-MM-DD') as week_start,
            COUNT(*) as bets,
            SUM(pnl) as pnl,
            (ARRAY_AGG(bankroll_after ORDER BY as_of_ts ASC, id ASC))[
                ARRAY_LENGTH(ARRAY_AGG(bankroll_after), 1)
            ] as last_bankroll
        FROM sim_bets
        WHERE as_of_ts IS NOT NULL
          AND (v_cutoff IS NULL OR as_of_ts >= v_cutoff)
          AND (p_market IS NULL OR market = p_market)
        GROUP BY DATE_TRUNC('week', as_of_ts::timestamp)
        ORDER BY DATE_TRUNC('week', as_of_ts::timestamp) ASC
    ) weekly_data;

    -- Recent Bets Calculation (Last 20, stable order, with Bet Score + tier + game_pk)
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', id,
            'as_of_ts', as_of_ts,
            'pnl', pnl,
            'result', result,
            'stake', stake,
            'bankroll_after', bankroll_after,
            'market', market,
            'selection', selection,
            'edge_pts', edge_pts,
            'edge_pts', edge_pts,
            'market', market
        )
    ), '[]'::jsonb) INTO v_recent
    FROM (
        SELECT id, as_of_ts, pnl, result, stake, bankroll_after, market, selection,
               edge_pts, edge_pts, market
        FROM sim_bets
        WHERE (v_cutoff IS NULL OR as_of_ts >= v_cutoff)
          AND (p_market IS NULL OR market = p_market)
        ORDER BY as_of_ts DESC, id DESC
        LIMIT 20
    ) recent_data;

    -- Derived calculations
    IF v_total_staked > 0 THEN
        v_roi := (v_total_pnl / v_total_staked) * 100;
    ELSE
        v_roi := 0;
    END IF;

    IF (v_wins + v_losses) > 0 THEN
        v_win_rate := (v_wins::numeric / (v_wins + v_losses)) * 100;
    ELSE
        v_win_rate := 0;
    END IF;

    v_final_bankroll := 1000 + v_total_pnl;

    -- Build and return final JSON response
    v_result := jsonb_build_object(
        'totalBets', v_total_bets,
        'wins', v_wins,
        'losses', v_losses,
        'pushes', v_pushes,
        'totalPnl', v_total_pnl,
        'currentBankroll', v_final_bankroll,
        'roi', v_roi,
        'peakBankroll', v_peak_bankroll,
        'maxDrawdown', v_max_drawdown * 100,
        'winRate', v_win_rate,
        'weeklyCurve', COALESCE(v_weekly, '[]'::jsonb),
        'recentBets', v_recent
    );

    RETURN v_result;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.sp_refresh_pending_families()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '15min'
AS $function$
declare cnt int;
begin
  create temp table _pf on commit drop as
    select g.game_type, g.stack_depth, count(*) as n
      from solved_spots_gold g
     where g.strategy_matrix_v2 is null
       and g.game_type is not null
       and g.stack_depth is not null
     group by 1,2;

  delete from sp_pending_family_cache c
   where not exists (select 1 from _pf p
                      where p.game_type = c.game_type
                        and p.stack_depth = c.stack_depth);

  insert into sp_pending_family_cache(game_type, stack_depth, n, refreshed_at)
  select game_type, stack_depth, n, now() from _pf
  on conflict (game_type, stack_depth)
  do update set n = excluded.n, refreshed_at = excluded.refreshed_at;

  select count(*) into cnt from _pf;
  return cnt;
end $function$
;
