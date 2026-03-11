-- 1. Create the Omnichannel Execution Audit Log Table
CREATE TABLE IF NOT EXISTS public.execution_audit_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    executed_at timestamptz DEFAULT now(),
    channel text NOT NULL,
    principal text NOT NULL,
    query text NOT NULL,
    execution_ms integer,
    success boolean,
    error_details text
);

-- 2. Add Row Level Security (Only Service Role / Admins can insert/read)
ALTER TABLE public.execution_audit_logs ENABLE ROW LEVEL SECURITY;

-- 3. Policy: Service Role has full access
CREATE POLICY "Service Role Full Access to Execution Logs"
ON public.execution_audit_logs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 4. Policy: Postgres Role has full access
CREATE POLICY "Postgres Role Full Access to Execution Logs"
ON public.execution_audit_logs
FOR ALL
TO postgres
USING (true)
WITH CHECK (true);

-- 5. Policy: Authenticated Admins can read (though typically bypassed by direct connection)
CREATE POLICY "Admins can view execution logs"
ON public.execution_audit_logs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'superadmin')
  )
);
