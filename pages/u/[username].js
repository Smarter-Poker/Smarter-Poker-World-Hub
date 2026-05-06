/**
 * /u/[username] — Public user profile
 * Displays full_name, bio, stats, and a privacy-filtered
 * "Hosts These Games" section (only public home groups shown).
 */
import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import BottomNavBar from '../../src/components/ui/BottomNavBar';
import { createClient } from '@supabase/supabase-js';

let _sb = null;
function getSb() {
  if (!_sb) _sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  );
  return _sb;
}

const C = {
  bg: '#050810', card: 'rgba(15,23,42,.65)', border: 'rgba(148,163,184,.12)',
  text: '#e2e8f0', textSec: '#94a3b8', textMuted: '#475569',
  teal: '#0d9488', tealDim: 'rgba(13,148,136,.15)', tealBorder: 'rgba(13,148,136,.35)',
  cyan: '#06b6d4', violet: '#8b5cf6',
};

function Avatar({ src, name, size = 80 }) {
  const initials = (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  if (src) return <img src={src} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', border: '3px solid rgba(255,255,255,.1)' }} />;
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: 'linear-gradient(135deg,#8b5cf6,#06b6d4)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: size / 3, border: '3px solid rgba(255,255,255,.1)' }}>
      {initials}
    </div>
  );
}

export default function PublicProfilePage() {
  const router = useRouter();
  const { username } = router.query;
  const [profile, setProfile] = useState(null);
  const [hostedGroups, setHostedGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!username) return;
    setLoading(true); setErr('');

    (async () => {
      try {
        // 1. Fetch profile by username via SECURITY DEFINER RPC.
        //    Direct SELECT on public.profiles is now blocked for anon to
        //    prevent harvesting of phone/email columns. The RPC returns
        //    only display-safe columns.
        const { data: rows, error: profErr } = await getSb()
          .rpc('get_public_profile_by_username', { p_username: username });
        const prof = Array.isArray(rows) ? rows[0] : rows;

        if (profErr || !prof) { setErr('User not found'); setLoading(false); return; }
        setProfile(prof);

        // 2. Fetch public home groups they host (privacy filter: is_private = false)
        const { data: memberships } = await getSb()
          .from('home_game_members')
          .select('role, home_game_groups!inner(id, name, slug, city, state, profile_photo_url, default_game_type, default_stakes, is_private)')
          .eq('user_id', prof.id)
          .in('role', ['host', 'co_host'])
          .eq('status', 'active');

        if (memberships && memberships.length > 0) {
          const publicGroups = memberships
            .map(m => m.home_game_groups)
            .filter(g => g && !g.is_private);
          setHostedGroups(publicGroups);
        }

        setLoading(false);
      } catch (e) {
        setErr(e.message || 'Failed to load profile');
        setLoading(false);
      }
    })();
  }, [username]);

  const displayName = profile?.full_name || profile?.display_name || profile?.username || username;
  const joinedYear = profile?.created_at ? new Date(profile.created_at).getFullYear() : null;

  return (
    <>
      <Head>
        <title>{displayName ? `${displayName} | Smarter.Poker` : 'Player Profile | Smarter.Poker'}</title>
        <meta name="description" content={profile?.bio || `${displayName}'s poker profile on Smarter.Poker`} />
      </Head>
      <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'Inter,-apple-system,sans-serif', paddingBottom: 80 }}>
        <UniversalHeader pageDepth={2} />

        {loading && (
          <div style={{ textAlign: 'center', padding: '80px 20px', color: C.textSec }}>Loading profile…</div>
        )}

        {!loading && err && (
          <div style={{ textAlign: 'center', padding: '80px 20px' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🃏</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 8 }}>Player Not Found</div>
            <div style={{ fontSize: 14, color: C.textSec, marginBottom: 24 }}>{err}</div>
            <Link href="/hub/social-media" style={{ color: C.teal, fontWeight: 600, textDecoration: 'none' }}>← Back to Feed</Link>
          </div>
        )}

        {!loading && profile && (
          <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 16px' }}>
            {/* Profile Card */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: 28, marginBottom: 20, position: 'relative', overflow: 'hidden' }}>
              {/* Subtle gradient top-right */}
              <div style={{ position: 'absolute', top: 0, right: 0, width: 200, height: 200, background: `radial-gradient(circle at 100% 0%,rgba(139,92,246,.08),transparent 70%)`, pointerEvents: 'none' }} />

              <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', marginBottom: 18 }}>
                <Avatar src={profile.avatar_url} name={displayName} size={80} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800 }}>{displayName}</h1>
                  <div style={{ fontSize: 14, color: C.textSec, marginBottom: 8 }}>@{profile.username}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {profile.level > 0 && (
                      <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: 'rgba(139,92,246,.12)', border: '1px solid rgba(139,92,246,.3)', color: C.violet }}>
                        Lvl {profile.level}
                      </span>
                    )}
                    {joinedYear && (
                      <span style={{ fontSize: 12, color: C.textMuted, padding: '3px 10px', borderRadius: 20, background: 'rgba(255,255,255,.04)', border: `1px solid ${C.border}` }}>
                        Since {joinedYear}
                      </span>
                    )}
                    {hostedGroups.length > 0 && (
                      <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: C.tealDim, border: `1px solid ${C.tealBorder}`, color: C.teal }}>
                        Home Game Host
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {profile.bio && (
                <p style={{ fontSize: 14, color: C.textSec, lineHeight: 1.6, margin: 0 }}>{profile.bio}</p>
              )}
            </div>

            {/* Hosts These Games */}
            {hostedGroups.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.textSec, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
                  Hosts These Games
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {hostedGroups.map(g => (
                    <Link
                      key={g.id}
                      href={`/hub/home-games/${g.slug || g.id}`}
                      style={{ display: 'flex', alignItems: 'center', gap: 14, background: C.card, border: `1px solid ${C.tealBorder}`, borderRadius: 14, padding: 16, textDecoration: 'none', transition: 'border-color .2s' }}
                    >
                      {g.profile_photo_url ? (
                        <img src={g.profile_photo_url} alt="" style={{ width: 48, height: 48, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 48, height: 48, borderRadius: 12, background: 'linear-gradient(135deg,#0d9488,#06b6d4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>🏠</div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 15, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</div>
                        <div style={{ fontSize: 12, color: C.textSec, marginTop: 3 }}>
                          {[g.city, g.state].filter(Boolean).join(', ')}
                          {g.default_game_type && ` · ${g.default_game_type.toUpperCase()}`}
                          {g.default_stakes && ` · ${g.default_stakes}`}
                        </div>
                      </div>
                      <span style={{ fontSize: 18, color: C.teal, flexShrink: 0 }}>›</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Back link */}
            <div style={{ textAlign: 'center', marginTop: 24 }}>
              <Link href="/hub/social-media" style={{ color: C.textMuted, fontSize: 13, textDecoration: 'none' }}>← Back to Feed</Link>
            </div>
          </div>
        )}

        <BottomNavBar />
      </div>
    </>
  );
}
