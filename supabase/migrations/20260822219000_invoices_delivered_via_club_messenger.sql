-- WEEKLY STATEMENTS GO OUT THROUGH THE CLUB MESSENGER, NOT EMAIL.
--
-- Dan: "we aren't sending emails, we use the club messenger as the internal
-- messenger to send and receive messages, images, and invoices."
--
-- The club messenger is conversations + messages (category 'club'), the pair
-- Club Arena's MessagingService reads: it lists conversations by
-- participant_ids containing the viewer, counts unread by
-- messages.receiver_id, and renders messages.metadata. So a statement
-- delivered here lands in the same inbox a club owner already uses, with the
-- full breakdown attached as structured metadata rather than as prose the UI
-- has to parse back.
--
-- One conversation per (union owner, recipient) per club, reused every week,
-- so a club owner sees a running thread of their statements instead of a new
-- conversation each Monday. message_type is 'invoice' so the client can render
-- a statement card; it degrades to a normal message anywhere that does not
-- know the type, because the readable text is in content either way.
--
-- This file carries the FINAL definition of fn_union_send_club_message, i.e.
-- it already includes the fix applied minutes later as
-- 'club_messenger_delivers_when_owner_is_union_owner'. The first cut skipped
-- any recipient equal to the sender, on the reasonable-looking ground that you
-- do not message yourself -- but on Midway the union owner and the owner of
-- both member clubs are the same account, so every recipient was skipped and
-- messenger_deliveries came back 0. A union owner who also runs a member club
-- is a normal arrangement, so the thread is now built from the DISTINCT
-- participant set: two people give a normal two-way thread, one person gives a
-- self-thread, which the messenger lists correctly either way.
--
-- REQUIRES 20260822218500_restore_missing_fn_can_message_in_club.sql -- the
-- messages table carries a trigger calling a function that did not exist, so
-- no club message could be inserted at all until that was restored.
--
-- Applied to production via Supabase MCP as
-- 'invoices_delivered_via_club_messenger' and
-- 'club_messenger_delivers_when_owner_is_union_owner'.

CREATE OR REPLACE FUNCTION public.fn_union_send_club_message(
  p_union_id   uuid,
  p_club_id    uuid,
  p_content    text,
  p_metadata   jsonb DEFAULT '{}'::jsonb,
  p_message_type text DEFAULT 'message')
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_sender uuid;
  v_conv   uuid;
  v_parts  uuid[];
  v_sent   int := 0;
  r        record;
BEGIN
  SELECT u.owner_id INTO v_sender FROM unions u WHERE u.id = p_union_id;
  IF v_sender IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'union has no owner to send as');
  END IF;

  FOR r IN
    SELECT DISTINCT x.uid
      FROM (
        SELECT c.owner_id AS uid FROM clubs c
         WHERE c.id = p_club_id AND c.owner_id IS NOT NULL
        UNION
        SELECT cm.user_id FROM club_members cm
         WHERE cm.club_id = p_club_id
           AND cm.role IN ('owner','admin')
           AND COALESCE(cm.status,'active') NOT IN ('banned','suspended')
      ) x
     WHERE x.uid IS NOT NULL
       AND EXISTS (SELECT 1 FROM profiles pr WHERE pr.id = x.uid)
  LOOP
    -- one participant when the union owner IS the club owner, two otherwise
    SELECT ARRAY(SELECT DISTINCT p FROM unnest(ARRAY[v_sender, r.uid]) p) INTO v_parts;

    SELECT c.id INTO v_conv
      FROM conversations c
     WHERE c.category = 'club'
       AND c.club_id = p_club_id
       AND c.participant_ids @> v_parts
       AND array_length(c.participant_ids, 1) = array_length(v_parts, 1)
     ORDER BY c.created_at ASC
     LIMIT 1;

    IF v_conv IS NULL THEN
      INSERT INTO conversations (participant_ids, category, club_id, created_by)
      VALUES (v_parts, 'club', p_club_id, v_sender)
      RETURNING id INTO v_conv;
    END IF;

    INSERT INTO messages (conversation_id, sender_id, receiver_id, recipient_id,
                          club_id, content, message_type, metadata, is_read)
    VALUES (v_conv, v_sender, r.uid, r.uid, p_club_id,
            p_content, p_message_type, p_metadata, false);

    UPDATE conversations SET updated_at = now() WHERE id = v_conv;
    v_sent := v_sent + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'delivered', v_sent);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_union_send_club_message(uuid, uuid, text, jsonb, text)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Issue + deliver. Same idempotent invoice as
-- 20260822215000_union_weekly_squareup_invoices.sql; delivery is now the
-- messenger thread plus the notification bell, and message_sent is stamped so
-- a re-run never re-sends.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_union_issue_weekly_invoices(
  p_union_id uuid,
  p_start    timestamptz DEFAULT NULL,
  p_end      timestamptz DEFAULT NULL,
  p_notify   boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_from timestamptz := COALESCE(p_start, date_trunc('week', now()) - interval '7 days');
  v_to   timestamptz := COALESCE(p_end,   date_trunc('week', now()));
  v_due  timestamptz;
  v_union_name text;
  r record;
  v_period_id uuid;
  v_invoice_id uuid;
  v_already_sent boolean;
  v_issued int := 0;
  v_notified int := 0;
  v_messaged int := 0;
  v_msg jsonb;
  v_body text;
  v_out jsonb := '[]'::jsonb;
BEGIN
  IF v_caller IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM unions u WHERE u.id = p_union_id AND u.owner_id = v_caller)
     AND NOT EXISTS (SELECT 1 FROM union_admins ua
                      WHERE ua.union_id = p_union_id AND ua.user_id = v_caller) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;

  v_due := v_to + interval '3 days';
  SELECT u.name INTO v_union_name FROM unions u WHERE u.id = p_union_id;

  FOR r IN SELECT * FROM fn_union_club_invoice(p_union_id, v_from, v_to) LOOP
    SELECT sp.id INTO v_period_id
      FROM settlement_periods sp
     WHERE sp.club_id = r.club_id AND sp.union_id = p_union_id
       AND sp.start_at = v_from AND sp.end_at = v_to
     ORDER BY sp.created_at DESC LIMIT 1;

    IF v_period_id IS NULL THEN
      INSERT INTO settlement_periods (club_id, union_id, period_number, year,
                                      start_at, end_at, status)
      VALUES (r.club_id, p_union_id,
              EXTRACT(week FROM v_from)::int, EXTRACT(isoyear FROM v_from)::int,
              v_from, v_to, 'processing')
      RETURNING id INTO v_period_id;
    END IF;

    INSERT INTO settlement_invoices (
      club_id, period_id, invoice_type,
      from_entity_type, from_entity_id, to_entity_type, to_entity_id,
      gross_amount, net_amount, deductions, breakdown, status,
      chips_transferred, due_at, notes)
    VALUES (
      r.club_id, v_period_id, 'union_weekly_squareup',
      CASE WHEN r.outstanding >= 0 THEN 'union' ELSE 'club' END,
      CASE WHEN r.outstanding >= 0 THEN p_union_id::text ELSE r.club_id::text END,
      CASE WHEN r.outstanding >= 0 THEN 'club'  ELSE 'union' END,
      CASE WHEN r.outstanding >= 0 THEN r.club_id::text ELSE p_union_id::text END,
      abs(r.outstanding), abs(r.outstanding), 0,
      jsonb_build_object(
        'union_id', p_union_id, 'union_name', v_union_name,
        'club_id', r.club_id, 'club_name', r.club_name,
        'period_start', r.period_start, 'period_end', r.period_end,
        'rake_generated', r.rake_generated,
        'union_fee_kept', r.union_fee_kept,
        'rakeback_due',   r.rakeback_due,
        'players_won',    r.players_won,
        'player_pnl_net', r.player_pnl_net,
        'eco_amount',     r.eco_amount,
        'eco_enabled',    r.eco_enabled,
        'presettled',     r.presettled,
        'settled_in_chips', r.settled_in_chips,
        'outstanding',    r.outstanding,
        'net_position',   r.net_position,
        'direction',      r.direction),
      'generated', false, v_due,
      'Weekly union square-up. settled_in_chips already moved during the week; '
      || 'outstanding is the amount to settle.')
    ON CONFLICT (club_id, period_id, invoice_type)
      WHERE invoice_type = 'union_weekly_squareup'
    DO UPDATE SET
      from_entity_type = EXCLUDED.from_entity_type,
      from_entity_id   = EXCLUDED.from_entity_id,
      to_entity_type   = EXCLUDED.to_entity_type,
      to_entity_id     = EXCLUDED.to_entity_id,
      gross_amount     = EXCLUDED.gross_amount,
      net_amount       = EXCLUDED.net_amount,
      breakdown        = EXCLUDED.breakdown,
      due_at           = EXCLUDED.due_at,
      updated_at       = now()
    RETURNING id, COALESCE(message_sent, false) INTO v_invoice_id, v_already_sent;

    v_issued := v_issued + 1;

    IF p_notify THEN
      INSERT INTO notifications (user_id, type, title, message, data, read)
      SELECT DISTINCT u.uid, 'union_invoice',
             v_union_name || ' weekly statement',
             CASE
               WHEN r.outstanding > 0 THEN
                 v_union_name || ' owes ' || r.club_name || ' '
                 || to_char(abs(r.outstanding), 'FM999,999,999,990.00') || ' for the week.'
               WHEN r.outstanding < 0 THEN
                 r.club_name || ' owes ' || v_union_name || ' '
                 || to_char(abs(r.outstanding), 'FM999,999,999,990.00') || ' for the week.'
               ELSE
                 r.club_name || ' is square with ' || v_union_name || ' for the week.'
             END,
             jsonb_build_object('invoice_id', v_invoice_id, 'club_id', r.club_id,
                                'union_id', p_union_id,
                                'period_start', r.period_start, 'period_end', r.period_end,
                                'outstanding', r.outstanding, 'due_at', v_due,
                                'source', 'club_arena'),
             false
        FROM (
          SELECT c.owner_id AS uid FROM clubs c WHERE c.id = r.club_id AND c.owner_id IS NOT NULL
          UNION
          SELECT cm.user_id FROM club_members cm
           WHERE cm.club_id = r.club_id AND cm.role IN ('owner','admin')
             AND COALESCE(cm.status,'active') NOT IN ('banned','suspended')
        ) u
       WHERE u.uid IS NOT NULL;
      GET DIAGNOSTICS v_notified = ROW_COUNT;
    END IF;

    -- CLUB MESSENGER. Only once per invoice: message_sent is the guard.
    IF NOT v_already_sent THEN
      v_body :=
        v_union_name || ' weekly statement' || E'\n'
        || to_char(r.period_start, 'YYYY-MM-DD') || ' to ' || to_char(r.period_end, 'YYYY-MM-DD')
        || E'\n\n'
        || 'Rake generated       ' || to_char(r.rake_generated,   'FM999,999,999,990.00') || E'\n'
        || 'Your rakeback (90%)  ' || to_char(r.rakeback_due,     'FM999,999,999,990.00') || E'\n'
        || 'Union fee kept       ' || to_char(r.union_fee_kept,   'FM999,999,999,990.00') || E'\n'
        || 'Player win/loss      ' || to_char(r.players_won,      'FM999,999,999,990.00') || E'\n'
        || 'Settled in chips     ' || to_char(r.settled_in_chips, 'FM999,999,999,990.00') || E'\n'
        || CASE WHEN r.eco_enabled
                THEN 'ECO adjustment       ' || to_char(r.eco_amount, 'FM999,999,999,990.00') || E'\n'
                ELSE '' END
        || CASE WHEN COALESCE(r.presettled, 0) <> 0
                THEN 'Payments received    ' || to_char(r.presettled, 'FM999,999,999,990.00') || E'\n'
                ELSE '' END
        || E'\n'
        || CASE
             WHEN r.outstanding < 0 THEN 'AMOUNT DUE ' || to_char(abs(r.outstanding), 'FM999,999,999,990.00')
             WHEN r.outstanding > 0 THEN 'OWED TO YOU ' || to_char(abs(r.outstanding), 'FM999,999,999,990.00')
             ELSE 'SQUARE FOR THE WEEK'
           END
        || CASE WHEN r.outstanding <> 0
                THEN E'\n' || 'Due ' || to_char(v_due, 'YYYY-MM-DD')
                ELSE '' END
        || E'\n\n'
        || 'Player win/loss and rakeback already moved in chips during the week. '
        || 'The amount above is what is left to square up.';

      v_msg := fn_union_send_club_message(
        p_union_id, r.club_id, v_body,
        jsonb_build_object(
          'kind', 'union_invoice',
          'invoice_id', v_invoice_id,
          'union_id', p_union_id,
          'club_id', r.club_id,
          'period_start', r.period_start,
          'period_end', r.period_end,
          'due_at', v_due,
          'outstanding', r.outstanding,
          'direction', r.direction,
          'lines', jsonb_build_object(
            'rake_generated', r.rake_generated,
            'rakeback_due', r.rakeback_due,
            'union_fee_kept', r.union_fee_kept,
            'players_won', r.players_won,
            'settled_in_chips', r.settled_in_chips,
            'eco_amount', r.eco_amount,
            'eco_enabled', r.eco_enabled,
            'presettled', r.presettled)),
        'invoice');

      IF COALESCE((v_msg->>'delivered')::int, 0) > 0 THEN
        v_messaged := v_messaged + (v_msg->>'delivered')::int;
        UPDATE settlement_invoices
           SET message_sent = true, message_sent_at = now()
         WHERE id = v_invoice_id;
      END IF;
    END IF;

    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'club_id', r.club_id, 'club_name', r.club_name,
      'invoice_id', v_invoice_id, 'outstanding', r.outstanding,
      'direction', r.direction, 'due_at', v_due,
      'messaged', COALESCE((v_msg->>'delivered')::int, 0),
      'already_sent', v_already_sent));
  END LOOP;

  RETURN jsonb_build_object('success', true, 'union_id', p_union_id,
    'period_start', v_from, 'period_end', v_to, 'due_at', v_due,
    'invoices', v_issued, 'notified', v_notified, 'messenger_deliveries', v_messaged,
    'detail', v_out);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_union_issue_weekly_invoices(uuid, timestamptz, timestamptz, boolean)
  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_union_issue_weekly_invoices(uuid, timestamptz, timestamptz, boolean)
  TO authenticated;
