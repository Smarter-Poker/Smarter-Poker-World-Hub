-- Fix fn_submit_bug_report_to_admin because fn_send_message returns JSONB now
CREATE OR REPLACE FUNCTION public.fn_submit_bug_report_to_admin(
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
    v_conversation_json JSONB;
    v_message_id UUID := NULL;
    v_message_json JSONB;
    v_ticket_id UUID;
    v_content TEXT;
BEGIN
    -- 1. Find Support user ID by exact email or username
    SELECT id INTO v_admin_id FROM auth.users WHERE email ILIKE 'support@smarter.poker' LIMIT 1;
    
    -- Fallback to searching profiles if auth lookup fails
    IF v_admin_id IS NULL THEN
        SELECT id INTO v_admin_id FROM public.profiles WHERE username ILIKE 'support' LIMIT 1;
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
    IF p_sender_id IS NOT NULL AND v_admin_id IS NOT NULL AND p_sender_id != v_admin_id THEN
        
        -- Retrieve or provision a safe P2P direct message room
        v_conversation_json := public.fn_get_or_create_conversation(p_sender_id, v_admin_id);
        
        IF (v_conversation_json->>'success')::boolean = true THEN
            v_conversation_id := (v_conversation_json->>'conversation_id')::uuid;
            
            -- Build formatted message content to look beautiful in the Messenger UI
            v_content := '🚨 **BUG REPORT** [' || upper(p_priority) || ']' || E'\n' ||
                         '**Subject:** ' || p_subject || E'\n' ||
                         '**Ticket:** BUG-' || upper(substr(v_ticket_id::text, 1, 8)) || E'\n\n' ||
                         p_description;

            -- Send via messaging system, which natively triggers the real-time pipeline event
            v_message_json := public.fn_send_message(v_conversation_id, p_sender_id, v_content);
            IF (v_message_json->>'success')::boolean = true THEN
                v_message_id := (v_message_json->>'message_id')::uuid;
            END IF;
        END IF;
    END IF;

    RETURN json_build_object(
        'success', true,
        'ticket_id', v_ticket_id,
        'message_id', v_message_id,
        'conversation_id', v_conversation_id,
        'support_id', v_admin_id
    );
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
