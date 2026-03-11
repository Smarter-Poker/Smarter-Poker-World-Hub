-- ═══════════════════════════════════════════════════════════════════════
-- Phase 11: Messenger Backend Tables
-- Migration: 20260311000004_messenger_backend_tables.sql
-- ═══════════════════════════════════════════════════════════════════════

-- P11-1: Conversations Table
CREATE TABLE IF NOT EXISTS public.messenger_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL DEFAULT 'direct' CHECK (type IN ('direct', 'group', 'announcement')),
    title TEXT,
    avatar_url TEXT,
    created_by UUID REFERENCES auth.users(id),
    is_pinned BOOLEAN DEFAULT false,
    is_archived BOOLEAN DEFAULT false,
    is_announcement BOOLEAN DEFAULT false,
    last_message_text TEXT,
    last_message_at TIMESTAMPTZ DEFAULT now(),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- P11-1: Conversation Participants
CREATE TABLE IF NOT EXISTS public.messenger_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.messenger_conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'moderator', 'member')),
    is_muted BOOLEAN DEFAULT false,
    mute_until TIMESTAMPTZ,
    is_pinned BOOLEAN DEFAULT false,
    unread_count INTEGER DEFAULT 0,
    last_read_at TIMESTAMPTZ DEFAULT now(),
    joined_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(conversation_id, user_id)
);

-- P11-2: Messages Table
CREATE TABLE IF NOT EXISTS public.messenger_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.messenger_conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES auth.users(id),
    text TEXT,
    message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'gif', 'voice', 'file', 'contact_card', 'location', 'poll', 'system')),
    media_url TEXT,
    media_metadata JSONB DEFAULT '{}',
    contact_card JSONB,
    location JSONB,
    poll_data JSONB,
    reply_to_id UUID REFERENCES public.messenger_messages(id),
    thread_parent_id UUID REFERENCES public.messenger_messages(id),
    is_edited BOOLEAN DEFAULT false,
    is_deleted BOOLEAN DEFAULT false,
    is_encrypted BOOLEAN DEFAULT false,
    encrypted_payload TEXT,
    priority TEXT DEFAULT 'normal' CHECK (priority IN ('normal', 'urgent', 'important', 'low')),
    status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'read')),
    labels TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- P11-3: Reactions Table
CREATE TABLE IF NOT EXISTS public.messenger_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES public.messenger_messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    reaction_type TEXT NOT NULL DEFAULT 'emoji' CHECK (reaction_type IN ('emoji', 'gif')),
    emoji TEXT,
    gif_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(message_id, user_id, emoji)
);

-- P11-5: Translation Cache
CREATE TABLE IF NOT EXISTS public.messenger_translations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES public.messenger_messages(id) ON DELETE CASCADE,
    source_lang TEXT DEFAULT 'auto',
    target_lang TEXT NOT NULL DEFAULT 'en',
    translated_text TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(message_id, target_lang)
);

-- P11-6: WebRTC Signaling
CREATE TABLE IF NOT EXISTS public.messenger_call_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.messenger_conversations(id) ON DELETE CASCADE,
    caller_id UUID NOT NULL REFERENCES auth.users(id),
    callee_id UUID NOT NULL REFERENCES auth.users(id),
    call_type TEXT NOT NULL CHECK (call_type IN ('audio', 'video')),
    signal_type TEXT NOT NULL CHECK (signal_type IN ('offer', 'answer', 'ice_candidate', 'hangup')),
    signal_data JSONB NOT NULL DEFAULT '{}',
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'ended', 'missed')),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- P11-10: Message Bookmarks (server-side)
CREATE TABLE IF NOT EXISTS public.messenger_bookmarks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    message_id UUID NOT NULL REFERENCES public.messenger_messages(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, message_id)
);

-- ═══════════════════════════════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_msg_conversation ON public.messenger_messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_msg_sender ON public.messenger_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_msg_thread ON public.messenger_messages(thread_parent_id) WHERE thread_parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_msg_status ON public.messenger_messages(status) WHERE status != 'read';
CREATE INDEX IF NOT EXISTS idx_reactions_msg ON public.messenger_reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_participants_user ON public.messenger_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_participants_conv ON public.messenger_participants(conversation_id);
CREATE INDEX IF NOT EXISTS idx_translations_msg ON public.messenger_translations(message_id);
CREATE INDEX IF NOT EXISTS idx_signals_conv ON public.messenger_call_signals(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON public.messenger_bookmarks(user_id);

-- ═══════════════════════════════════════════════════════════════════════
-- RLS POLICIES
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE public.messenger_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messenger_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messenger_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messenger_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messenger_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messenger_call_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messenger_bookmarks ENABLE ROW LEVEL SECURITY;

-- Conversations: user can see conversations they participate in
CREATE POLICY "Users can view own conversations" ON public.messenger_conversations
    FOR SELECT USING (
        id IN (SELECT conversation_id FROM public.messenger_participants WHERE user_id = auth.uid())
    );

CREATE POLICY "Users can create conversations" ON public.messenger_conversations
    FOR INSERT WITH CHECK (created_by = auth.uid());

CREATE POLICY "Owners can update conversations" ON public.messenger_conversations
    FOR UPDATE USING (
        id IN (SELECT conversation_id FROM public.messenger_participants WHERE user_id = auth.uid() AND role IN ('owner', 'admin'))
    );

-- Participants: user can see participants of conversations they belong to
CREATE POLICY "Users can view conversation participants" ON public.messenger_participants
    FOR SELECT USING (
        conversation_id IN (SELECT conversation_id FROM public.messenger_participants WHERE user_id = auth.uid())
    );

CREATE POLICY "Users can join conversations" ON public.messenger_participants
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can manage participants" ON public.messenger_participants
    FOR DELETE USING (
        conversation_id IN (SELECT conversation_id FROM public.messenger_participants WHERE user_id = auth.uid() AND role IN ('owner', 'admin'))
    );

-- Messages: user can see messages in their conversations
CREATE POLICY "Users can view conversation messages" ON public.messenger_messages
    FOR SELECT USING (
        conversation_id IN (SELECT conversation_id FROM public.messenger_participants WHERE user_id = auth.uid())
    );

CREATE POLICY "Users can send messages" ON public.messenger_messages
    FOR INSERT WITH CHECK (
        sender_id = auth.uid() AND
        conversation_id IN (SELECT conversation_id FROM public.messenger_participants WHERE user_id = auth.uid())
    );

CREATE POLICY "Users can edit own messages" ON public.messenger_messages
    FOR UPDATE USING (sender_id = auth.uid());

-- Reactions: users can manage reactions on messages they can see
CREATE POLICY "Users can view reactions" ON public.messenger_reactions
    FOR SELECT USING (
        message_id IN (SELECT id FROM public.messenger_messages WHERE conversation_id IN (SELECT conversation_id FROM public.messenger_participants WHERE user_id = auth.uid()))
    );

CREATE POLICY "Users can add reactions" ON public.messenger_reactions
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can remove own reactions" ON public.messenger_reactions
    FOR DELETE USING (user_id = auth.uid());

-- Translations: visible to all participants
CREATE POLICY "Users can view translations" ON public.messenger_translations
    FOR SELECT USING (
        message_id IN (SELECT id FROM public.messenger_messages WHERE conversation_id IN (SELECT conversation_id FROM public.messenger_participants WHERE user_id = auth.uid()))
    );

CREATE POLICY "Users can create translations" ON public.messenger_translations
    FOR INSERT WITH CHECK (true);

-- Call Signals: visible to caller and callee
CREATE POLICY "Users can view own call signals" ON public.messenger_call_signals
    FOR SELECT USING (caller_id = auth.uid() OR callee_id = auth.uid());

CREATE POLICY "Users can create call signals" ON public.messenger_call_signals
    FOR INSERT WITH CHECK (caller_id = auth.uid());

CREATE POLICY "Users can update own call signals" ON public.messenger_call_signals
    FOR UPDATE USING (caller_id = auth.uid() OR callee_id = auth.uid());

-- Bookmarks: users manage their own
CREATE POLICY "Users can view own bookmarks" ON public.messenger_bookmarks
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create bookmarks" ON public.messenger_bookmarks
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own bookmarks" ON public.messenger_bookmarks
    FOR DELETE USING (user_id = auth.uid());

-- ═══════════════════════════════════════════════════════════════════════
-- REALTIME: Enable for messages, reactions, signals, participants
-- ═══════════════════════════════════════════════════════════════════════
ALTER PUBLICATION supabase_realtime ADD TABLE public.messenger_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messenger_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messenger_call_signals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messenger_participants;
