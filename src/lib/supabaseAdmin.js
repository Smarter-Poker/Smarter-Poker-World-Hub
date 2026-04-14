import { createClient } from '@supabase/supabase-js';

// WARNING: This client bypasses RLS and uses the Service Role Key.
// ONLY use this in Server-Side code (getStaticProps, getServerSideProps, API routes).
export const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);
