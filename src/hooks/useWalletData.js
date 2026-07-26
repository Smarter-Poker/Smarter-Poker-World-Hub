/**
 * ═══════════════════════════════════════════════════════════════════════════
 * useWalletData — Real-Time Wallet Balance Hook for Club Arena
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Fetches all wallet balances for the current user in a club, then subscribes
 * to Supabase Realtime for live updates (chip changes, BBJ growth, promo, etc.).
 *
 * Changes vs. original:
 *  - `wallet-diamonds:{userId}` channel REMOVED — diamonds are now delivered by
 *    the shared useProfileRealtime hook (via useDiamondBalance or direct use)
 *    to avoid 3 duplicate subscriptions on the same profiles row.
 *  - `wallet-agent:{clubId}:{userId}` channel is now ROLE-GATED: only opens
 *    when the user's role is 'agent'.
 *  - `wallet-treasury:{clubId}` channel is now ROLE-GATED: only opens when
 *    the user's role is 'owner' or 'admin'.
 *  - `wallet-member:{clubId}:{userId}` filter is user_id=eq.${userId} so
 *    Supabase delivers only this user's club_members rows instead of all
 *    club members' rows (cost-fix: was broadcasting all member wallet updates
 *    to every connected club member). club_id is guarded CLIENT-SIDE because
 *    Realtime postgres_changes supports only ONE server-side filter —
 *    do NOT '&'-join filters, compound filters silently break delivery.
 *
 * Returns: { diamondBalance, bbjAmount, chipBalance, clubBankBalance,
 *            agentBalance, promoBalance, bbjAnimating, loading, role }
 *
 * Usage:
 *   const wallet = useWalletData({ supabase, userId, clubId });
 *   <DynamicWallet {...wallet} />
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useProfileRealtime } from './useProfileRealtime';

export default function useWalletData({ supabase, userId, clubId }) {
  const [diamondBalance, setDiamondBalance] = useState(0);
  const [bbjAmount, setBbjAmount] = useState(0);
  const [chipBalance, setChipBalance] = useState(0);
  const [clubBankBalance, setClubBankBalance] = useState(null); // club treasury (owner view)
  const [agentBalance, setAgentBalance] = useState(null);
  const [promoBalance, setPromoBalance] = useState(0);
  const [bbjAnimating, setBbjAnimating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState('player');
  const bbjTimeoutRef = useRef(null);
  const bbjAmountRef = useRef(0); // track last BBJ amount to detect real changes
  const roleRef = useRef('player'); // keep role in sync for channel gate decisions

  // ── Initial data fetch ───────────────────────────────────────────────
  const loadWalletData = useCallback(async () => {
    if (!supabase || !userId || !clubId) {
      // Terminate the loading state so consumers without a club don't spin forever
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      // Parallel fetch: profile, membership, BBJ, agent, club treasury
      const [profileRes, memberRes, bbjRes, agentRes, clubRes] = await Promise.allSettled([
        supabase.from('profiles').select('diamonds').eq('id', userId).maybeSingle(),
        supabase.from('club_members').select('chip_balance, promo_balance, role').eq('club_id', clubId).eq('user_id', userId).maybeSingle(),
        supabase.from('bbj_pools').select('pool_amount').eq('club_id', clubId).maybeSingle(),
        supabase.from('agents').select('business_balance, status').eq('club_id', clubId).eq('user_id', userId).eq('status', 'active').maybeSingle(),
        supabase.from('clubs').select('chip_treasury').eq('id', clubId).maybeSingle(),
      ]);

      // Diamonds (global)
      if (profileRes.status === 'fulfilled' && profileRes.value?.data) {
        setDiamondBalance(profileRes.value.data.diamonds || 0);
      }

      // Club membership
      let userRole = 'player';
      if (memberRes.status === 'fulfilled' && memberRes.value?.data) {
        const m = memberRes.value.data;
        setChipBalance(m.chip_balance || 0);
        setPromoBalance(m.promo_balance || 0);
        userRole = m.role || 'player';
        setRole(userRole);
        roleRef.current = userRole;
      }

      // BBJ pool
      if (bbjRes.status === 'fulfilled' && bbjRes.value?.data) {
        const amt = bbjRes.value.data.pool_amount || 0;
        setBbjAmount(amt);
        bbjAmountRef.current = amt;
      }

      // Agent balance (null for non-agents)
      if (agentRes.status === 'fulfilled' && agentRes.value?.data) {
        setAgentBalance(agentRes.value.data.business_balance || 0);
      } else {
        setAgentBalance(null);
      }

      // Club treasury (only relevant for owner/admin)
      if (['owner', 'admin'].includes(userRole) && clubRes.status === 'fulfilled' && clubRes.value?.data) {
        setClubBankBalance(clubRes.value.data.chip_treasury || 0);
      } else {
        setClubBankBalance(null);
      }
    } catch (e) {
      console.warn('[useWalletData] Load error:', e);
    } finally {
      setLoading(false);
    }
  }, [supabase, userId, clubId]);

  useEffect(() => { loadWalletData(); }, [loadWalletData]);

  // ── Shared profile channel: diamond balance ──────────────────────────
  // Replaces the old dedicated `wallet-diamonds:{userId}` supabase.channel().
  // The channel is now shared with useDiamondBalance and AvatarContext via
  // useProfileRealtime — only ONE channel per user is ever opened.
  useProfileRealtime(userId, {
    onDiamondsUpdate: (diamonds) => {
      setDiamondBalance(diamonds);
    },
  });

  // ── Role-gated Realtime subscriptions ───────────────────────────────
  useEffect(() => {
    if (!supabase || !userId || !clubId) return;

    // 1. Club member chip/promo balance changes (all roles need this).
    //    COST-FIX: filter on user_id=eq.${userId} so Supabase only delivers
    //    this user's rows instead of broadcasting every club member's wallet
    //    updates to all connected users. NOTE: Realtime postgres_changes
    //    supports exactly ONE filter expression — '&'-joined compound filters
    //    silently break delivery — so club_id is guarded client-side.
    const memberCh = supabase
      .channel(`wallet-member:${clubId}:${userId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'club_members',
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        // Client-side guard: scope to this club (and re-check user_id).
        if (payload.new?.user_id === userId && payload.new?.club_id === clubId) {
          if (payload.new.chip_balance !== undefined) setChipBalance(payload.new.chip_balance);
          if (payload.new.promo_balance !== undefined) setPromoBalance(payload.new.promo_balance);
          // Live role changes re-gate the agent/treasury channels below
          // (the subscription effect depends on `role`).
          if (payload.new.role && payload.new.role !== roleRef.current) {
            roleRef.current = payload.new.role;
            setRole(payload.new.role);
          }
        }
      })
      .subscribe();

    // 2. BBJ pool changes (any player sees it grow)
    const bbjCh = supabase
      .channel(`wallet-bbj:${clubId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'bbj_pools',
        filter: `club_id=eq.${clubId}`,
      }, (payload) => {
        const newAmount = payload.new?.pool_amount;
        if (newAmount !== undefined && newAmount !== bbjAmountRef.current) {
          bbjAmountRef.current = newAmount;
          setBbjAmount(newAmount);
          setBbjAnimating(true);
          if (bbjTimeoutRef.current) clearTimeout(bbjTimeoutRef.current);
          bbjTimeoutRef.current = setTimeout(() => setBbjAnimating(false), 800);
        }
      })
      .subscribe();

    // 3. Agent balance changes — ROLE-GATED: only open for agents
    let agentCh = null;
    if (roleRef.current === 'agent') {
      agentCh = supabase
        .channel(`wallet-agent:${clubId}:${userId}`)
        .on('postgres_changes', {
          event: 'UPDATE', schema: 'public', table: 'agents',
          // Filter on user_id so other agents' business_balance rows are never
          // delivered to this client; club_id is guarded client-side.
          filter: `user_id=eq.${userId}`,
        }, (payload) => {
          if (payload.new?.user_id === userId && payload.new?.club_id === clubId) {
            setAgentBalance(payload.new.business_balance || 0);
          }
        })
        .subscribe();
    }

    // 4. Club treasury changes — ROLE-GATED: only open for owner/admin
    let clubCh = null;
    if (['owner', 'admin'].includes(roleRef.current)) {
      clubCh = supabase
        .channel(`wallet-treasury:${clubId}`)
        .on('postgres_changes', {
          event: 'UPDATE', schema: 'public', table: 'clubs',
          filter: `id=eq.${clubId}`,
        }, (payload) => {
          if (payload.new?.chip_treasury !== undefined) {
            setClubBankBalance(payload.new.chip_treasury);
          }
        })
        .subscribe();
    }

    return () => {
      supabase.removeChannel(memberCh);
      supabase.removeChannel(bbjCh);
      if (agentCh) supabase.removeChannel(agentCh);
      if (clubCh) supabase.removeChannel(clubCh);
      if (bbjTimeoutRef.current) clearTimeout(bbjTimeoutRef.current);
    };
  }, [supabase, userId, clubId, role]); // role in deps so channels re-evaluate after fetch

  return {
    diamondBalance, bbjAmount, chipBalance, clubBankBalance,
    agentBalance, promoBalance, bbjAnimating, loading, role,
    reload: loadWalletData,
  };
}
