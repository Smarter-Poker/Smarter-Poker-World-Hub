import { createClient } from '@supabase/supabase-js';

// WARNING: This client bypasses RLS and uses the Service Role Key.
// ONLY use this in Server-Side code (getStaticProps, getServerSideProps, API routes).
//
// 2026-08-16: a literal `sb_secret_…` service-role key was inlined here as a
// fallback — hours after the previous service-role key was rotated precisely
// because it had been committed to a public repo. Do not reintroduce it. A
// hardcoded fallback is wrong even when the value is a placeholder: it turns a
// missing environment variable into an unexplained 401 at runtime instead of a
// message that names the variable. See lib/supabaseAdmin.ts for the preferred
// lazy helper.
const SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY || 'MISSING_SUPABASE_SERVICE_ROLE_KEY';

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
        '[supabaseAdmin] SUPABASE_SERVICE_ROLE_KEY is not set. Every query issued ' +
            'through supabaseAdmin will fail with 401 until it is configured.'
    );
}

export const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co',
    SERVICE_ROLE_KEY
);
