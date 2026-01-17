/**
 * 🔧 SHARED SUPABASE CLIENT
 * Single instance to prevent "Multiple GoTrueClient instances" error
 */

import { createClient } from '@supabase/supabase-js';

// Create ONE shared Supabase instance for the entire app
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default supabase;
