/**
 * SupabaseProvider — thin shim that exposes auth user + supabase client via context.
 * SmarterPokerFeedView and other social components consume this via useSupabase().
 */
import React, { createContext, useContext } from 'react';
import { supabase } from '../lib/supabase';
import { getAuthUser } from '../lib/authUtils';

const SupabaseContext = createContext(null);

export function SupabaseProvider({ children }) {
    const user = getAuthUser();
    return (
        <SupabaseContext.Provider value={{ supabase, user, profile: user }}>
            {children}
        </SupabaseContext.Provider>
    );
}

export function useSupabase() {
    const ctx = useContext(SupabaseContext);
    // Graceful fallback if not inside provider (e.g. orphaned component)
    if (!ctx) return { supabase, user: null, profile: null };
    return ctx;
}

export default SupabaseProvider;
