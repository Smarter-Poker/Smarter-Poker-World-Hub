-- ═══════════════════════════════════════════════════════════
-- Phase 21: Intelligence V3 & Admin Integration
-- messenger_reminders + messenger_admin_messages
-- ═══════════════════════════════════════════════════════════

-- P21-2: Message Reminders
CREATE TABLE IF NOT EXISTS public.messenger_reminders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    message_id UUID NOT NULL,
    user_id UUID NOT NULL,
    conversation_id UUID,
    remind_at TIMESTAMPTZ NOT NULL,
    note TEXT DEFAULT '',
    message_preview TEXT DEFAULT '',
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'fired', 'dismissed')),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reminders_user ON public.messenger_reminders(user_id, status);
CREATE INDEX IF NOT EXISTS idx_reminders_due ON public.messenger_reminders(remind_at) WHERE status = 'pending';

ALTER TABLE public.messenger_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own reminders" ON public.messenger_reminders;
CREATE POLICY "Users can manage own reminders"
    ON public.messenger_reminders FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- P21-6: @smarter.poker Admin Messages
CREATE TABLE IF NOT EXISTS public.messenger_admin_messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    message_id UUID,
    user_id UUID NOT NULL,
    conversation_id UUID,
    message_text TEXT NOT NULL,
    sender_display TEXT DEFAULT '',
    status TEXT DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'resolved')),
    source TEXT DEFAULT 'messenger_mention',
    admin_notes TEXT DEFAULT '',
    resolved_by UUID,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_msgs_status ON public.messenger_admin_messages(status, created_at);
CREATE INDEX IF NOT EXISTS idx_admin_msgs_user ON public.messenger_admin_messages(user_id);

ALTER TABLE public.messenger_admin_messages ENABLE ROW LEVEL SECURITY;

-- Users can insert mentions (send to admin)
DROP POLICY IF EXISTS "Users can send admin messages" ON public.messenger_admin_messages;
CREATE POLICY "Users can send admin messages"
    ON public.messenger_admin_messages FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can view own mentions
DROP POLICY IF EXISTS "Users can view own admin messages" ON public.messenger_admin_messages;
CREATE POLICY "Users can view own admin messages"
    ON public.messenger_admin_messages FOR SELECT
    USING (auth.uid() = user_id);

-- Admins can view and manage all (via service role or admin check)
DROP POLICY IF EXISTS "Admins can manage all admin messages" ON public.messenger_admin_messages;
CREATE POLICY "Admins can manage all admin messages"
    ON public.messenger_admin_messages FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() 
            AND role IN ('admin', 'god', 'super_admin')
        )
    );
