-- Migration to support IP clustering and Anti-Farming

CREATE TABLE IF NOT EXISTS public.anti_farming_ips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    ip_address TEXT NOT NULL,
    action_type TEXT NOT NULL,
    amount INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast rolling sum lookups by IP
CREATE INDEX IF NOT EXISTS idx_anti_farming_ips_ip 
ON public.anti_farming_ips(ip_address, created_at DESC);

-- Index for user lookups
CREATE INDEX IF NOT EXISTS idx_anti_farming_ips_user 
ON public.anti_farming_ips(user_id, created_at DESC);

-- RLS
ALTER TABLE public.anti_farming_ips ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS, so this is enough for the API routes.
