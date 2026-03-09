/**
 * ═══════════════════════════════════════════════════════════════════════════
 * useWalletData — Real-Time Wallet Balance Hook for Club Arena
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Fetches all wallet balances for the current user in a club, then subscribes
 * to Supabase Realtime for live updates (chip changes, BBJ growth, promo, etc.).
 *
 * Returns: { diamondBalance, bbjAmount, chipBalance, agentBalance, promoBalance,
 *            bbjAnimating, loading, role }
 *
 * Usage:
 *   const wallet = useWalletData({ supabase, userId, clubId });
 *   <DynamicWallet {...wallet} />
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export default function useWalletData({ supabase, userId, clubId }) {
  const [diamondBalance, setDiamondBalance] = useState(0);
  const [bbjAmount, setBbjAmount] = useState(0);
  const [chipBalance, setChipBalance] = useState(0);
  const [agentBalance, setAgentBalance] = useState(null);
  const [promoBalance, setPromoBalance] = useState(0);
  const [bbjAnimating, setBbjAnimating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState('player');
  const bbjTimeoutRef = useRef(null);

  // ── Initial data fetch ───────────────────────────────────────────────
  const loadWalletData = useCallback(async () => {
    if (!supabase || !userId || !clubId) return;

    try {
      // Parallel fetch: profile diamonds, club membership, BBJ pool, agent record
      const [profileRes, memberRes, bbjRes, agentRes] = await Promise.allSettled([
        supabase.from('profiles').select('diamond_balance').eq('id', userId).maybeSingle(),
        supabase.from('club_members').select('chip_balance, promo_balance, role').eq('club_id', clubId).eq('user_id', userId).maybeSingle(),
        supabase.from('bbj_pools').select('pool_amount').eq('club_id', clubId).maybeSingle(),
        supabase.from('agents').select('business_balance, status').eq('club_id', clubId).eq('user_id', userId).eq('status', 'active').maybeSingle(),
      ]);

      // Diamonds (global, not per-club)
      if (profileRes.status === 'fulfilled' && profileRes.value?.data) {
        setDiamondBalance(profileRes.value.data.diamond_balance || 0);
      }

      // Club membership
      if (memberRes.status === 'fulfilled' && memberRes.value?.data) {
        const m = memberRes.value.data;
        setChipBalance(m.chip_balance || 0);
        setPromoBalance(m.promo_balance || 0);
        setRole(m.role || 'player');
      }

      // BBJ pool
      if (bbjRes.status === 'fulfilled' && bbjRes.value?.data) {
        setBbjAmount(bbjRes.value.data.pool_amount || 0);
      }

      // Agent balance (null for non-agents)
      if (agentRes.status === 'fulfilled' && agentRes.value?.data) {
        setAgentBalance(agentRes.value.data.business_balance || 0);
      } else {
        setAgentBalance(null);
      }
    } catch (e) {
      console.error('[useWalletData] Load error:', e);
    } finally {
      setLoading(false);
    }
  }, [supabase, userId, clubId]);

  useEffect(() => { loadWalletData(); }, [loadWalletData]);

  // ── Real-time subscriptions ──────────────────────────────────────────
  useEffect(() => {
    if (!supabase || !userId || !clubId) return;

    // 1. Club member chip/promo balance changes
    const memberCh = supabase
      .channel(`wallet-member:${clubId}:${userId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'club_members',
        filter: `club_id=eq.${clubId}`,
      }, (payload) => {
        if (payload.new?.user_id === userId) {
          if (payload.new.chip_balance !== undefined) setChipBalance(payload.new.chip_balance);
          if (payload.new.promo_balance !== undefined) setPromoBalance(payload.new.promo_balance);
        }
      })
      .subscribe();

    // 2. BBJ pool changes (any player in the club sees it grow)
    const bbjCh = supabase
      .channel(`wallet-bbj:${clubId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'bbj_pools',
        filter: `club_id=eq.${clubId}`,
      }, (payload) => {
        const newAmount = payload.new?.pool_amount;
        if (newAmount !== undefined && newAmount !== bbjAmount) {
          setBbjAmount(newAmount);
          // Trigger pulse animation
          setBbjAnimating(true);
          if (bbjTimeoutRef.current) clearTimeout(bbjTimeoutRef.current);
          bbjTimeoutRef.current = setTimeout(() => setBbjAnimating(false), 800);
        }
      })
      .subscribe();

    // 3. Diamond balance changes (global profile)
    const diamondCh = supabase
      .channel(`wallet-diamonds:${userId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'profiles',
        filter: `id=eq.${userId}`,
      }, (payload) => {
        if (payload.new?.diamond_balance !== undefined) {
          setDiamondBalance(payload.new.diamond_balance);
        }
      })
      .subscribe();

    // 4. Agent balance changes (only if user is an agent)
    const agentCh = supabase
      .channel(`wallet-agent:${clubId}:${userId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'agents',
        filter: `club_id=eq.${clubId}`,
      }, (payload) => {
        if (payload.new?.user_id === userId) {
          setAgentBalance(payload.new.business_balance || 0);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(memberCh);
      supabase.removeChannel(bbjCh);
      supabase.removeChannel(diamondCh);
      supabase.removeChannel(agentCh);
      if (bbjTimeoutRef.current) clearTimeout(bbjTimeoutRef.current);
    };
  }, [supabase, userId, clubId]);

  return {
    diamondBalance, bbjAmount, chipBalance, agentBalance, promoBalance,
    bbjAnimating, loading, role, reload: loadWalletData,
  };
}
