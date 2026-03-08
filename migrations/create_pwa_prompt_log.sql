-- PWA Prompt Log: IP-based persistence for permanent dismissal
-- Run this in the Supabase SQL Editor (Dashboard → SQL → New Query)

CREATE TABLE IF NOT EXISTS pwa_prompt_log (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    ip_address text NOT NULL,
    action text NOT NULL DEFAULT 'dismissed',
    responded_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pwa_prompt_log_ip_unique UNIQUE (ip_address)
);

-- Index for fast IP lookups
CREATE INDEX IF NOT EXISTS idx_pwa_prompt_log_ip ON pwa_prompt_log (ip_address);

-- Allow the service role to read/write (RLS off for server-side-only table)
ALTER TABLE pwa_prompt_log ENABLE ROW LEVEL SECURITY;

-- Service role bypass (this table is only accessed server-side via service_role key)
CREATE POLICY "Service role full access" ON pwa_prompt_log
    FOR ALL
    USING (true)
    WITH CHECK (true);
