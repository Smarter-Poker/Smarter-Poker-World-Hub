-- ════════════════════════════════════════════════════════════════════
-- Smarter.Poker World Hub: Phase 12 Messenger SQL Schema
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.messenger_conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type VARCHAR(20) DEFAULT 'direct', -- 'direct', 'group', 'club'
    club_id VARCHAR(50) NULL,
    name VARCHAR(255) NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    is_encrypted BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_message_at TIMESTAMPTZ DEFAULT NOW(),
    last_message_text TEXT NULL
);

CREATE TABLE IF NOT EXISTS public.messenger_participants (
    conversation_id UUID REFERENCES public.messenger_conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL, -- References auth.users or player DNA
    role VARCHAR(20) DEFAULT 'member', -- 'member', 'admin'
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    last_read_at TIMESTAMPTZ DEFAULT NOW(),
    unread_count INT DEFAULT 0,
    is_pinned BOOLEAN DEFAULT false,
    metadata JSONB DEFAULT '{}'::jsonb,
    PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.messenger_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID REFERENCES public.messenger_conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL,
    message_type VARCHAR(20) DEFAULT 'text', -- 'text', 'image', 'voice', 'contact_card', 'location', 'poll'
    text TEXT NULL,
    media_url TEXT NULL,
    media_metadata JSONB DEFAULT '{}'::jsonb,
    contact_card JSONB NULL,
    location JSONB NULL,
    poll_data JSONB NULL,
    reply_to_id UUID REFERENCES public.messenger_messages(id) ON DELETE SET NULL,
    thread_parent_id UUID REFERENCES public.messenger_messages(id) ON DELETE CASCADE,
    priority VARCHAR(20) DEFAULT 'normal', -- 'normal', 'urgent', 'low'
    status VARCHAR(20) DEFAULT 'sent', -- 'sent', 'delivered', 'read'
    is_encrypted BOOLEAN DEFAULT false,
    encrypted_payload TEXT NULL,
    is_deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.messenger_reactions (
    message_id UUID REFERENCES public.messenger_messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    reaction_type VARCHAR(10) DEFAULT 'emoji', -- 'emoji', 'gif'
    emoji VARCHAR(20) NULL,
    gif_url TEXT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (message_id, user_id, emoji)
);

CREATE TABLE IF NOT EXISTS public.messenger_call_signals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID REFERENCES public.messenger_conversations(id) ON DELETE CASCADE,
    caller_id UUID NOT NULL,
    callee_id UUID NOT NULL,
    call_type VARCHAR(10) DEFAULT 'audio', -- 'audio', 'video'
    signal_type VARCHAR(20) NOT NULL, -- 'offer', 'answer', 'ice_candidate', 'hangup'
    signal_data JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'active', -- 'active', 'ended'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_messenger_messages_conv_id ON public.messenger_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messenger_messages_sender_id ON public.messenger_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messenger_participants_user_id ON public.messenger_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_messenger_call_signals_conv_id ON public.messenger_call_signals(conversation_id);
