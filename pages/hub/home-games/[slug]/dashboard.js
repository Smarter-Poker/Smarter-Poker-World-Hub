/**
 * /hub/home-games/[slug]/dashboard
 * Host-facing dashboard — Overview · Members · Moderation · Settings
 * Gated to group host/co_host/admin. No admin RPCs — host-scoped only.
 */
import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Link from 'next/link';
import UniversalHeader from '../../../../src/components/ui/UniversalHeader';
import BottomNavBar from '../../../../src/components/ui/BottomNavBar';
import { getAccessToken } from '../../../../src/lib/authUtils';
import { createClient } from '@supabase/supabase-js';

let _sb = null;
let _sbToken = null;
// Anon-key client scoped to the caller's session by attaching their bearer
// token to every PostgREST request.
//
// BUG-FIX: this client is created fresh in the browser and never picks up the
// app session (the app stores it under the custom `smarter-poker-auth` key, not
// this client's default storage key). Without the Authorization header every
// query below ran as the `anon` Postgres role, so RLS hid the caller's own
// commander_home_members row, `role` stayed null, and every non-owner co-host
// was rejected by the host guard. Same shape as getUserScopedClient() in
// src/lib/home-games/rpcBridge.js (not imported here — that module pulls in
// server-only helpers).
function getSb(token) {
  const key = token || null;
  if (!_sb || _sbToken !== key) {
    _sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      {
        auth: { persistSession: false, autoRefreshToken: false },
        ...(key ? { global: { headers: { Authorization: `Bearer ${key}` } } } : {}),
      }
    );
    _sbToken = key;
  }
  return _sb;
}

const TABS = ['Overview', 'Members', 'Moderation', 'Settings'];
const HOST_ROLES = ['host', 'co_host', 'admin'];

const C = {
  bg: '#050810', card: 'rgba(15,23,42,.65)', border: 'rgba(148,163,184,.12)',
  text: '#e2e8f0', textSec: '#94a3b8', textMuted: '#475569',
  teal: '#0d9488', tealDim: 'rgba(13,148,136,.15)', tealBorder: 'rgba(13,148,136,.35)',
  cyan: '#06b6d4', red: '#ef4444',
};

async function apiFetch(path, token, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

// ── Onboarding Checklist ──────────────────────────────────────────────────
function OnboardingChecklist({ group }) {
  const checks = [
    { done: !!group?.name, label: 'Group Created' },
    { done: !!group?.profile_photo_url, label: 'Logo Uploaded' },
    { done: !!group?.city, label: 'Location Set' },
    { done: !!group?.description, label: 'Description Written' },
    { done: (group?.member_count || 0) > 1, label: 'First Member Joined' },
  ];
  const pct = Math.round((checks.filter(c => c.done).length / checks.length) * 100);

  return (
    <div style={{ background: C.card, border: `1px solid ${C.tealBorder}`, borderRadius: 14, padding: 20, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: C.text }}>Setup Progress</span>
        <span style={{ fontWeight: 800, fontSize: 18, color: C.teal }}>{pct}%</span>
      </div>
      <div style={{ height: 6, borderRadius: 4, background: 'rgba(255,255,255,.07)', marginBottom: 16 }}>
        <div style={{ height: '100%', borderRadius: 4, background: `linear-gradient(90deg,${C.teal},${C.cyan})`, width: `${pct}%`, transition: 'width .4s' }} />
      </div>
      {checks.map((c, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{ width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, background: c.done ? C.tealDim : 'rgba(255,255,255,.04)', border: `1px solid ${c.done ? C.teal : 'rgba(255,255,255,.1)'}`, color: c.done ? C.teal : C.textMuted }}>
            {c.done ? '✓' : '·'}
          </div>
          <span style={{ fontSize: 13, color: c.done ? C.text : C.textMuted }}>{c.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────────────
// The overview list is a preview, not a full page of events. Kept as a
// constant so the tile below can tell "exactly N" from "at least N".
const EVENTS_PREVIEW_LIMIT = 5;

function OverviewTab({ group, token }) {
  const [events, setEvents] = useState([]);
  // Total events reported by the API when it sends one, otherwise null so the
  // tile can fall back to the number of rows we actually received.
  const [eventCount, setEventCount] = useState(null);

  useEffect(() => {
    if (!token || !group?.id) return;
    let cancelled = false;
    // Fetch upcoming events
    apiFetch(`/api/commander/home-games/events?group_id=${group.id}&limit=${EVENTS_PREVIEW_LIMIT}`, token)
      .then(d => {
        if (cancelled) return;
        setEvents(d.events || []);
        setEventCount(typeof d.total === 'number' ? d.total : (typeof d.count === 'number' ? d.count : null));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [token, group?.id]);

  // BUG-FIX: the tiles used to read group.event_count / group.post_count, which
  // the group payload never returns, so both rendered 0 forever even when the
  // events fetch above came back with rows. Events is now derived from the
  // events we actually loaded; Posts is only shown when the payload really
  // carries a count instead of advertising a permanent zero.
  const statTiles = [
    { label: 'Members', value: group?.member_count || 0, color: C.teal },
    {
      label: 'Events',
      // Without a server-side total the fallback is the preview itself, which
      // is capped — render "5+" rather than asserting a host with 20 upcoming
      // games has exactly 5.
      value: eventCount != null
        ? eventCount
        : (events.length >= EVENTS_PREVIEW_LIMIT ? `${EVENTS_PREVIEW_LIMIT}+` : events.length),
      color: C.cyan,
    },
  ];
  if (typeof group?.post_count === 'number') {
    statTiles.push({ label: 'Posts', value: group.post_count, color: '#8b5cf6' });
  }

  return (
    <div>
      <OnboardingChecklist group={group} />

      {/* Quick Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${statTiles.length}, 1fr)`, gap: 12, marginBottom: 20 }}>
        {statTiles.map(s => (
          <div key={s.label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: C.textSec, marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Upcoming Events */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: C.text, marginBottom: 14 }}>Upcoming Events</div>
        {events.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: C.textMuted, fontSize: 13 }}>No upcoming events. Schedule your first game!</div>
        ) : (
          events.map(ev => (
            <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: `1px solid ${C.border}` }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: C.tealDim, border: `1px solid ${C.tealBorder}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.teal }}>{ev.scheduled_date ? new Date(ev.scheduled_date).toLocaleDateString('en-US', { month: 'short' }) : '—'}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: C.text, lineHeight: 1 }}>{ev.scheduled_date ? new Date(ev.scheduled_date).getDate() : '—'}</div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.title || 'Game Night'}</div>
                <div style={{ fontSize: 12, color: C.textSec }}>{ev.rsvp_count || 0} RSVPs</div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Quick Actions */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Link href={`/hub/commander/home-games/${group?.id}/manage`} style={{ background: C.tealDim, border: `1px solid ${C.tealBorder}`, borderRadius: 12, padding: 14, textAlign: 'center', color: C.teal, fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>
          Schedule Game
        </Link>
        <Link href={`/hub/home-games/${group?.slug || group?.id}`} style={{ background: 'rgba(255,255,255,.04)', border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, textAlign: 'center', color: C.textSec, fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>
          View Public Page
        </Link>
      </div>
    </div>
  );
}

// ── Members Tab ───────────────────────────────────────────────────────────
function MembersTab({ group, token }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!token || !group?.id) return;
    setLoading(true);
    apiFetch(`/api/commander/home-games/groups/${group.id}/members?limit=100`, token)
      .then(d => { setMembers(d.members || d.data || []); setLoading(false); })
      .catch(e => { setErr(e.message); setLoading(false); });
  }, [token, group?.id]);

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: C.textMuted }}>Loading members…</div>;
  if (err) return <div style={{ color: C.red, padding: 16, fontSize: 13 }}>{err}</div>;

  return (
    <div>
      <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 12 }}>{members.length} member{members.length !== 1 ? 's' : ''}</div>
      {members.map(m => (
        <div key={m.user_id || m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: `1px solid ${C.border}` }}>
          {m.avatar_url ? (
            <img src={m.avatar_url} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />
          ) : (
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg,#8b5cf6,#06b6d4)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 16 }}>
              {(m.display_name || m.username || '?')[0].toUpperCase()}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: C.text }}>{m.display_name || m.username}</div>
            <div style={{ fontSize: 12, color: C.textSec }}>@{m.username}</div>
          </div>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', padding: '2px 8px', borderRadius: 8, background: HOST_ROLES.includes(m.role) ? C.tealDim : 'rgba(255,255,255,.04)', border: `1px solid ${HOST_ROLES.includes(m.role) ? C.tealBorder : C.border}`, color: HOST_ROLES.includes(m.role) ? C.teal : C.textSec }}>
            {m.role}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Moderation Tab (host-scoped) ──────────────────────────────────────────
function ModerationTab({ group, token }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [acting, setActing] = useState(null);

  const load = useCallback(async () => {
    if (!token || !group?.id) return;
    setLoading(true); setErr('');
    try {
      const d = await apiFetch(`/api/commander/home-games/groups/${group.id}/posts?moderation=1&limit=50`, token);
      setReports(d.reports || d.posts || []);
    } catch (e) { setErr(e.message); }
    setLoading(false);
  }, [token, group?.id]);

  useEffect(() => { load(); }, [load]);

  const handleHide = async (postId) => {
    setActing(postId);
    try {
      await apiFetch(`/api/commander/home-games/groups/${group.id}/posts`, token, {
        method: 'PATCH',
        body: { post_id: postId, action: 'hide' },
      });
      setReports(prev => prev.filter(r => r.id !== postId));
    } catch (e) {
      // REPORT_ALREADY_RESOLVED: another moderator already actioned this report (409)
      const msg = e.message || '';
      if (msg.includes('ESCALATION_REQUIRED') || msg.includes('409') || msg.includes('already')) {
        alert('This report has already been actioned by another moderator.');
      } else {
        alert(msg || 'Failed to hide post. Please try again.');
      }
      // Refresh the list to reflect current server state
      load();
    }
    setActing(null);
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: C.textMuted }}>Loading…</div>;

  return (
    <div>
      {err && <div style={{ color: C.red, fontSize: 13, marginBottom: 12 }}>{err}</div>}
      <div style={{ background: 'rgba(6,182,212,.07)', border: '1px solid rgba(6,182,212,.2)', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 12, color: '#67e8f9' }}>
        Host moderation — hide or remove content within your group. High-severity reports (illegal, self-harm, doxxing) are automatically escalated to platform staff.
      </div>
      {reports.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: C.textMuted, fontSize: 14 }}>No pending moderation items.</div>
      ) : (
        reports.map(r => (
          <div key={r.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 10 }}>
            <div style={{ fontSize: 13, color: C.text, marginBottom: 8 }}>{r.content || r.text || '(no text)'}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: C.textMuted }}>{r.author_display || r.author_name}</span>
              <span style={{ flex: 1 }} />
              <button onClick={() => handleHide(r.id)} disabled={acting === r.id} style={{ padding: '5px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'rgba(239,68,68,.1)', color: '#f87171', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                {acting === r.id ? '…' : 'Hide'}
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ── Settings Tab ──────────────────────────────────────────────────────────
function SettingsTab({ group }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Link href={`/hub/commander/home-games/${group?.id}/manage`} style={{ display: 'block', background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, color: C.text, textDecoration: 'none', fontWeight: 600, fontSize: 14 }}>
        Edit Group Details →
      </Link>
      <Link href={`/hub/commander/home-games/${group?.id}/roster`} style={{ display: 'block', background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, color: C.text, textDecoration: 'none', fontWeight: 600, fontSize: 14 }}>
        Manage Roster →
      </Link>
      <Link href={`/hub/commander/home-games/${group?.id}`} style={{ display: 'block', background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, color: C.text, textDecoration: 'none', fontWeight: 600, fontSize: 14 }}>
        Full Commander View →
      </Link>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function HomeGameDashboard() {
  const router = useRouter();
  const { slug } = router.query;
  const [tab, setTab] = useState(0);
  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [token, setToken] = useState(null);
  // Distinguishes "haven't looked for a token yet" from "looked, found none".
  // Without it a signed-out visitor sits on the loading screen forever because
  // the data effect below bails on !token and never reaches the redirect.
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // getAccessToken may be sync or promise-returning depending on the auth
    // path — normalize both.
    Promise.resolve(getAccessToken())
      .then((t) => { if (!cancelled) { setToken(t || null); setAuthChecked(true); } })
      .catch(() => { if (!cancelled) { setToken(null); setAuthChecked(true); } });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!slug || !authChecked) return;

    // Fully signed out — bounce to login instead of spinning forever.
    if (!token) {
      router.replace(`/auth/login?redirect=${encodeURIComponent(`/hub/home-games/${slug}/dashboard`)}`);
      return;
    }

    setLoading(true); setErr('');

    (async () => {
      try {
        // Auth check
        const { data: { user } } = await getSb(token).auth.getUser(token);
        if (!user) { router.replace(`/auth/login?redirect=${encodeURIComponent(`/hub/home-games/${slug}/dashboard`)}`); return; }

        // Load group.
        //
        // The route param here is the social_pages slug, but every other
        // caller of /api/commander/home-games/groups/[id] passes the
        // commander_home_groups UUID, so passing the slug straight through
        // rendered 'Failed to load group' for every host. Resolve the UUID
        // first via the public page payload (which already carries
        // data.group.id) unless the param is already a UUID.
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(slug));
        let groupId = isUuid ? String(slug) : null;
        if (!groupId) {
          const pubRes = await fetch(`/api/public/home-games/${encodeURIComponent(slug)}`);
          const pubJson = await pubRes.json().catch(() => ({}));
          groupId = pubJson?.data?.group?.id || null;
          if (!groupId) throw new Error('Group not found');
        }

        const d = await apiFetch(`/api/commander/home-games/groups/${groupId}`, token);
        const g = d.group || d;
        if (!g?.id) throw new Error('Group not found');

        // Role check — the canonical membership table is commander_home_members
        // (see the same BUG-FIX note in ../[slug].js). The old query hit the
        // legacy `home_game_members` security-invoker view, which does not
        // reliably surface the caller's own role row under RLS and locked
        // legitimate hosts out. The group owner is always treated as host, in
        // case no membership row was ever written for them.
        let role = g.owner_id && g.owner_id === user.id ? 'host' : null;
        if (!role) {
          const { data: mem } = await getSb(token)
            .from('commander_home_members')
            .select('role')
            .eq('group_id', g.id)
            .eq('user_id', user.id)
            .maybeSingle();
          role = mem?.role || null;
        }

        if (!role || !HOST_ROLES.includes(role)) {
          setErr('You must be a host or co-host to access this dashboard.');
          setLoading(false);
          return;
        }

        setGroup({ ...g, userRole: role });
        setLoading(false);
      } catch (e) {
        setErr(e.message || 'Failed to load group');
        setLoading(false);
      }
    })();
  }, [slug, token, authChecked, router]);

  if (loading) return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textSec, fontFamily: 'Inter,-apple-system,sans-serif' }}>
      Loading dashboard…
    </div>
  );

  if (err) return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, fontFamily: 'Inter,-apple-system,sans-serif' }}>
      <div style={{ color: '#f87171', fontSize: 15 }}>{err}</div>
      <Link href="/hub/my-clubs" style={{ color: C.teal, fontSize: 13 }}>← My Clubs</Link>
    </div>
  );

  return (
    <>
      <Head>
        <title>{group?.name ? `${group.name} Dashboard` : 'Host Dashboard'} | Smarter.Poker</title>
      </Head>
      <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'Inter,-apple-system,sans-serif', paddingBottom: 80 }}>
        <UniversalHeader pageDepth={2} />

        <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
            {group?.profile_photo_url ? (
              <img src={group.profile_photo_url} alt="" style={{ width: 56, height: 56, borderRadius: 14, objectFit: 'cover', border: `2px solid ${C.tealBorder}` }} />
            ) : (
              <div style={{ width: 56, height: 56, borderRadius: 14, background: 'linear-gradient(135deg,#0d9488,#06b6d4)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 24, fontWeight: 700, border: `2px solid ${C.tealBorder}` }}>
                {(group?.name || 'H')[0].toUpperCase()}
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{group?.name}</h1>
              <div style={{ fontSize: 12, color: C.textSec, marginTop: 2 }}>
                {[group?.city, group?.state].filter(Boolean).join(', ')}
                <span style={{ margin: '0 6px', color: C.textMuted }}>·</span>
                <span style={{ color: C.teal, fontWeight: 700 }}>{group?.userRole}</span>
              </div>
            </div>
          </div>

          {/* Tab Bar */}
          <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,.04)', borderRadius: 10, padding: 4, marginBottom: 20 }}>
            {TABS.map((t, i) => (
              <button key={t} onClick={() => setTab(i)} style={{ flex: 1, padding: '8px 4px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, transition: 'all .15s', background: tab === i ? C.tealDim : 'transparent', color: tab === i ? C.teal : C.textSec }}>
                {t}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          {tab === 0 && <OverviewTab group={group} token={token} />}
          {tab === 1 && <MembersTab group={group} token={token} />}
          {tab === 2 && <ModerationTab group={group} token={token} />}
          {tab === 3 && <SettingsTab group={group} />}
        </div>

        <BottomNavBar />
      </div>
    </>
  );
}
