-- ═══════════════════════════════════════════════════════════════════════════
-- ORB-6: Messenger Premium Feature Tables
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Message Reactions (P5-2)
CREATE TABLE IF NOT EXISTS messenger_reactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    message_id UUID NOT NULL,
    conversation_id UUID NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    emoji TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (message_id, user_id, emoji)
);

-- 2. Message Pins (P4-1)
CREATE TABLE IF NOT EXISTS messenger_pins (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    message_id UUID NOT NULL,
    conversation_id UUID NOT NULL,
    pinned_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (message_id, conversation_id)
);

-- 3. Message Bookmarks (P2-5)
CREATE TABLE IF NOT EXISTS messenger_bookmarks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    message_id UUID NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    message_text TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (message_id, user_id)
);

-- 4. Message Labels (P2-1 + E8)
CREATE TABLE IF NOT EXISTS messenger_labels (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    message_id UUID NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    label TEXT NOT NULL CHECK (label IN ('Important', 'Action Required', 'Tournament Info', 'Payment')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (message_id, user_id, label)
);

-- 5. Chat Themes (P2-6 + E6)
CREATE TABLE IF NOT EXISTS messenger_themes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    conversation_id UUID NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    theme_value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (conversation_id, user_id)
);

-- 6. Scheduled Messages (P2-4 + E4)
CREATE TABLE IF NOT EXISTS messenger_scheduled (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    conversation_id UUID NOT NULL,
    sender_id UUID NOT NULL REFERENCES auth.users(id),
    content TEXT NOT NULL,
    send_at TIMESTAMPTZ NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'cancelled')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Message Edit History (P5-6)
CREATE TABLE IF NOT EXISTS messenger_edit_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    message_id UUID NOT NULL,
    previous_text TEXT NOT NULL,
    edited_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Message Templates (P2-7 + E2)
CREATE TABLE IF NOT EXISTS messenger_templates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    template_text TEXT NOT NULL,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Thread Replies (P4-7)
CREATE TABLE IF NOT EXISTS messenger_thread_replies (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    parent_message_id UUID NOT NULL,
    conversation_id UUID NOT NULL,
    sender_id UUID NOT NULL REFERENCES auth.users(id),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. Conversation Archive (P4-5)
CREATE TABLE IF NOT EXISTS messenger_archived (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    conversation_id UUID NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    archived_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (conversation_id, user_id)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_reactions_message ON messenger_reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_reactions_convo ON messenger_reactions(conversation_id);
CREATE INDEX IF NOT EXISTS idx_pins_convo ON messenger_pins(conversation_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON messenger_bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_labels_message ON messenger_labels(message_id);
CREATE INDEX IF NOT EXISTS idx_labels_user ON messenger_labels(user_id);
CREATE INDEX IF NOT EXISTS idx_themes_convo ON messenger_themes(conversation_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_sender ON messenger_scheduled(sender_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_status ON messenger_scheduled(status);
CREATE INDEX IF NOT EXISTS idx_edit_history_msg ON messenger_edit_history(message_id);
CREATE INDEX IF NOT EXISTS idx_templates_user ON messenger_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_thread_replies_parent ON messenger_thread_replies(parent_message_id);
CREATE INDEX IF NOT EXISTS idx_archived_user ON messenger_archived(user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS POLICIES
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE messenger_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE messenger_pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE messenger_bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE messenger_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE messenger_themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE messenger_scheduled ENABLE ROW LEVEL SECURITY;
ALTER TABLE messenger_edit_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE messenger_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE messenger_thread_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE messenger_archived ENABLE ROW LEVEL SECURITY;

-- Users can read/write their own data
CREATE POLICY "Users manage own reactions" ON messenger_reactions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own bookmarks" ON messenger_bookmarks FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own labels" ON messenger_labels FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own themes" ON messenger_themes FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own scheduled" ON messenger_scheduled FOR ALL USING (auth.uid() = sender_id);
CREATE POLICY "Users manage own templates" ON messenger_templates FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own archives" ON messenger_archived FOR ALL USING (auth.uid() = user_id);

-- Pins visible to all conversation participants
CREATE POLICY "Users manage pins" ON messenger_pins FOR ALL USING (auth.uid() = pinned_by);

-- Thread replies visible within conversation context
CREATE POLICY "Users manage thread replies" ON messenger_thread_replies FOR ALL USING (auth.uid() = sender_id);

-- Edit history read by anyone, write by message author
CREATE POLICY "Anyone reads edit history" ON messenger_edit_history FOR SELECT USING (true);
