-- Migration: Update user_leaks and user_assistant_stats to support the Leak Detection Engine (Phase 12)

-- 1. Updates to user_leaks
ALTER TABLE public.user_leaks
ADD COLUMN IF NOT EXISTS leak_type TEXT,
ADD COLUMN IF NOT EXISTS situation_class TEXT,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'emerging',
ADD COLUMN IF NOT EXISTS avg_ev_loss_bb DECIMAL(5,4),
ADD COLUMN IF NOT EXISTS occurrence_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS optimal_frequency DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS current_frequency DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS first_detected_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_detected_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS trend_data JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS explanation TEXT,
ADD COLUMN IF NOT EXISTS why_leaking_ev TEXT,
ADD COLUMN IF NOT EXISTS recommended_drill TEXT,
ADD COLUMN IF NOT EXISTS source_system TEXT DEFAULT 'live',
ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

-- Add a unique constraint to support UPSERTs on (user_id, leak_type) if one doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'user_leaks_user_id_leak_type_key'
    ) THEN
        ALTER TABLE public.user_leaks ADD CONSTRAINT user_leaks_user_id_leak_type_key UNIQUE (user_id, leak_type);
    END IF;
END $$;


-- 2. Updates to user_assistant_stats
ALTER TABLE public.user_assistant_stats
ADD COLUMN IF NOT EXISTS resolved_leaks_count INTEGER DEFAULT 0;

-- 3. Updates to user_training_leaks (if needed) to ensure alignment
ALTER TABLE public.user_training_leaks
ADD COLUMN IF NOT EXISTS source_system TEXT DEFAULT 'training_arena';
