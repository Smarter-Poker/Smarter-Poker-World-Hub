-- ═══════════════════════════════════════════════════════════════════════════
-- MESSAGE REQUESTS: Add is_request and request_sender_id to social_conversations
-- Facebook-style message request system where non-friend messages go to
-- a separate "Message Requests" inbox instead of the main chat.
-- ═══════════════════════════════════════════════════════════════════════════

-- Add is_request column (default false for existing conversations)
ALTER TABLE social_conversations
ADD COLUMN IF NOT EXISTS is_request BOOLEAN DEFAULT false;

-- Add request_sender_id column (tracks who initiated the message request)
ALTER TABLE social_conversations
ADD COLUMN IF NOT EXISTS request_sender_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Index for efficient request lookups
CREATE INDEX IF NOT EXISTS idx_social_conversations_is_request
ON social_conversations(is_request)
WHERE is_request = true;

-- Index for filtering by request sender
CREATE INDEX IF NOT EXISTS idx_social_conversations_request_sender
ON social_conversations(request_sender_id)
WHERE request_sender_id IS NOT NULL;

-- Verify
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'social_conversations'
AND column_name IN ('is_request', 'request_sender_id');
