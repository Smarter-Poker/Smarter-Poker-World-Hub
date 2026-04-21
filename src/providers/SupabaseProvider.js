/**
 * SupabaseProvider — thin shim that exposes auth user + supabase client via context.
 * SmarterPokerFeedView and other social components consume this via useSupabase().
 *
 * BUG FIX (Pass 3 adversarial): getAuthUser() was synchronous at render time — 
 * if auth state changed after mount (login/logout without reload) the context 
 * was permanently stale. Now uses useState + useEffect with a storage listener
 * so auth state is reactive throughout the session.
 */
import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { getAuthUser } from '../lib/authUtils';

const SupabaseContext = createContext(null);

export function SupabaseProvider({ children }) {
    const [user, setUser] = useState(() => getAuthUser());

    useEffect(() => {
        // Sync with localStorage auth changes (login/logout in this tab or another tab)
        const handleStorage = (e) => {
            if (
                e.key === 'smarter-poker-auth' ||
                (e.key?.startsWith('sb-') && e.key?.endsWith('-auth-token'))
            ) {
                setUser(getAuthUser());
            }
        };
        window.addEventListener('storage', handleStorage);

        // Also listen for Supabase auth state changes in this tab
        const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
            setUser(getAuthUser());
        });

        return () => {
            window.removeEventListener('storage', handleStorage);
            subscription?.unsubscribe();
        };
    }, []);

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
