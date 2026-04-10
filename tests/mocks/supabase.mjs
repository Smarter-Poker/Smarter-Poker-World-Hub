/**
 * Mock supabase module for poker-brain tests.
 * The decision-bridge imports { supabase } from '../supabase'
 * but that's a .ts file for Next.js. This mock provides the
 * minimal shape needed for tests to run.
 */
export const supabase = {
  auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
  },
};
export default supabase;
