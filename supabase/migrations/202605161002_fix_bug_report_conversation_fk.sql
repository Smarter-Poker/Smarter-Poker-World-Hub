-- Fix the legacy foreign key that pointed to a deprecated conversation table
ALTER TABLE public.live_help_tickets
DROP CONSTRAINT IF EXISTS live_help_tickets_conversation_id_fkey;

-- Add the correct foreign key pointing to the modern global messenger table
ALTER TABLE public.live_help_tickets
ADD CONSTRAINT live_help_tickets_conversation_id_fkey
FOREIGN KEY (conversation_id)
REFERENCES public.social_conversations(id)
ON DELETE SET NULL;
