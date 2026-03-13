-- ═══════════════════════════════════════════════════════════════════════
-- Phase 19: Messenger Intelligence V2 — SQL Migration
-- ═══════════════════════════════════════════════════════════════════════

-- P19-5: Scheduled Messages Table
CREATE TABLE IF NOT EXISTS public.messenger_scheduled (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.messenger_conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES auth.users(id),
    text TEXT NOT NULL,
    message_type TEXT NOT NULL DEFAULT 'text',
    media_url TEXT,
    scheduled_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'cancelled')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.messenger_scheduled ENABLE ROW LEVEL SECURITY;

-- Users can view their own scheduled messages
CREATE POLICY "Users can view own scheduled messages" ON public.messenger_scheduled
    FOR SELECT USING (sender_id = auth.uid());

-- Users can create scheduled messages
CREATE POLICY "Users can create scheduled messages" ON public.messenger_scheduled
    FOR INSERT WITH CHECK (sender_id = auth.uid());

-- Users can update their own scheduled messages
CREATE POLICY "Users can update own scheduled messages" ON public.messenger_scheduled
    FOR UPDATE USING (sender_id = auth.uid());

-- Users can delete their own scheduled messages
CREATE POLICY "Users can delete own scheduled messages" ON public.messenger_scheduled
    FOR DELETE USING (sender_id = auth.uid());

-- Indexes
CREATE INDEX IF NOT EXISTS idx_scheduled_conv ON public.messenger_scheduled(conversation_id, scheduled_at ASC);
CREATE INDEX IF NOT EXISTS idx_scheduled_status ON public.messenger_scheduled(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_scheduled_sender ON public.messenger_scheduled(sender_id);

-- P19-4: Add pinned_at to messenger_messages indexes for efficient lookup
CREATE INDEX IF NOT EXISTS idx_msg_pinned ON public.messenger_messages((media_metadata->>'pinned')) WHERE media_metadata->>'pinned' = 'true';
