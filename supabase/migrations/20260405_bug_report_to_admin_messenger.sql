-- Migration: Secure Bug Report to Admin (Atomic Realtime Injection)
-- Description: Inserts a Bug Ticket and symmetrically triggers the Messenger Engine to 
-- ensure admin@smarter.poker receives an instant WebSockets notification.

CREATE OR REPLACE FUNCTION fn_submit_bug_report_to_admin(
    p_sender_id UUID,
    p_subject TEXT,
    p_description TEXT,
    p_priority TEXT,
    p_current_page TEXT,
    p_user_agent TEXT
) RETURNS JSON AS $$
DECLARE
    v_admin_id UUID;
    v_conversation_id UUID := NULL;
    v_message_id UUID := NULL;
    v_ticket_id UUID;
    v_content TEXT;
BEGIN
    -- 1. Find Admin user ID by exact email or username
    SELECT id INTO v_admin_id FROM auth.users WHERE email = 'admin@smarter.poker' LIMIT 1;
    
    -- Fallback to searching profiles if auth lookup fails (or for different deployments)
    IF v_admin_id IS NULL THEN
        SELECT id INTO v_admin_id FROM public.profiles WHERE username = 'admin' LIMIT 1;
    END IF;

    -- 2. Prevent race conditions: create the core ticket completely first.
    INSERT INTO public.live_help_tickets (
        user_id, subject, description, priority, status
    ) VALUES (
        p_sender_id,
        '[BUG] ' || p_subject,
        p_description || E'\n\n---\nPage: ' || COALESCE(p_current_page, 'unknown') || E'\nUser Agent: ' || COALESCE(p_user_agent, 'unknown') || E'\nReported: ' || now()::text,
        COALESCE(p_priority, 'medium'),
        'open'
    ) RETURNING id INTO v_ticket_id;

    -- 3. Only attempt real-time DM insertion if we have both users.
    -- (Anonymous users or unprovisioned admins will just get the Ticket + Resend Email fallback)
    IF p_sender_id IS NOT NULL AND v_admin_id IS NOT NULL AND p_sender_id != v_admin_id THEN
        
        -- Retrieve or provision a safe P2P direct message room
        v_conversation_id := public.fn_get_or_create_conversation(p_sender_id, v_admin_id);
        
        -- Build formatted message content to look beautiful in the Messenger UI
        v_content := '🚨 **BUG REPORT** [' || upper(p_priority) || ']' || E'\n' ||
                     '**Subject:** ' || p_subject || E'\n' ||
                     '**Ticket:** BUG-' || upper(substr(v_ticket_id::text, 1, 8)) || E'\n\n' ||
                     p_description;

        -- Send via messaging system, which natively triggers the real-time pipeline event
        v_message_id := public.fn_send_message(v_conversation_id, p_sender_id, v_content);
        
    END IF;

    RETURN json_build_object(
        'success', true,
        'ticket_id', v_ticket_id,
        'message_id', v_message_id,
        'conversation_id', v_conversation_id,
        'admin_id', v_admin_id
    );
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
