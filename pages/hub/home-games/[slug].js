/**
 * ══════════════════════════════════════════════════════════════════════════
 *  UNIFIED PUBLIC HOME GAME PAGE
 *  /hub/home-games/[slug]
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  The single canonical URL for any public home game. Pulls from:
 *    - social_pages (slug, avatar/cover, follower_count, post_count)
 *    - commander_home_groups (member_count, schedule, stakes)
 *    - commander_home_games (upcoming sessions)
 *    - social_page_posts (announcements feed)
 *
 *  This REPLACES the disconnect between the old /home-game/[code] share page
 *  (which still works for back-compat) and the hidden /hub/commander/home-games.
 *  Discoverable from /hub/home-games and indexed by search engines.
 */

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import HamburgerMenu from '../../../src/components/ui/HamburgerMenu';
import useTrainingBus from '../../../src/hooks/useTrainingBus';

const GAME_TYPE_LABELS = {
  nlh: "No-Limit Hold'em",
  nlhe: "No-Limit Hold'em",
  plo: 'Pot-Limit Omaha',
  plo4: 'PLO',
  plo5: '5-Card PLO',
  plo8: 'PLO Hi-Lo',
  mixed: 'Mixed Games',
  limit: 'Limit Hold\'em',
  short_deck: 'Short Deck',
};

const FREQUENCY_LABELS = {
  weekly: 'Weekly',
  biweekly: 'Every 2 Weeks',
  monthly: 'Monthly',
  irregular: 'Irregular',
  daily: 'Daily',
};

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

export default function PublicHomeGamePage() {
  const router = useRouter();
  const { slug } = router.query;
  useTrainingBus('hub-home-games-slug');

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [data, setData] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copyState, setCopyState] = useState('');

  useEffect(() => {
    if (!router.isReady || !slug) return;

    let cancelled = false;
    setLoading(true);
    setNotFound(false);

    fetch(`/api/public/home-games/${encodeURIComponent(slug)}`)
      .then(async (r) => {
        if (r.status === 404) {
          if (!cancelled) setNotFound(true);
          return null;
        }
        if (!r.ok) throw new Error(`Request failed (${r.status})`);
        return r.json();
      })
      .then((json) => {
        if (!cancelled && json?.success) setData(json.data);
      })
      .catch((e) => {
        console.error('Load home game failed:', e);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [router.isReady, slug]);

  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/hub/home-games/${slug}` : '';

  const copyShareUrl = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
        setCopyState('Copied!');
        setTimeout(() => setCopyState(''), 2000);
      }
    } catch (e) {
      setCopyState('Copy Failed');
      setTimeout(() => setCopyState(''), 2000);
    }
  };

  // ── Loading ──
  if (loading) {
    return (
      <>
        <SEOHead title="Home Game" description="Loading…" noindex={true} />
        <div className="hgs-page">
          <UniversalHeader onMenuClick={() => setMenuOpen(true)} />
          <div className="hgs-loading"><div className="hgs-spinner" /><p>Loading Home Game…</p></div>
          <HamburgerMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} worldKey="hub" />
          <style jsx>{pageStyles}</style>
        </div>
      </>
    );
  }

  // ── Not found ──
  if (notFound || !data) {
    return (
      <>
        <SEOHead title="Home Game Not Found" description="This home game could not be found." noindex={true} />
        <div className="hgs-page">
          <UniversalHeader onMenuClick={() => setMenuOpen(true)} />
          <div className="hgs-notfound">
            <h1>Home Game Not Found</h1>
            <p>The home game you&apos;re looking for isn&apos;t available publicly, or the link may be wrong.</p>
            <Link href="/hub/home-games" className="hgs-primary-btn">Browse Home Games</Link>
          </div>
          <HamburgerMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} worldKey="hub" />
          <style jsx>{pageStyles}</style>
        </div>
      </>
    );
  }

  const { page, group, host, upcoming_games = [], posts = [] } = data;

  const metaTitle = `${page.name} — Home Game in ${page.city || 'the US'}`;
  const metaDesc =
    (group.description || page.description || `Join ${page.name}, a poker home game in ${page.city}, ${page.state}.`).slice(0, 160);

  return (
    <>
      <SEOHead
        title={metaTitle}
        description={metaDesc}
        canonical={`/hub/home-games/${page.slug}`}
        ogImage={page.cover_url || page.avatar_url || undefined}
      />
      <div className="hgs-page">
        <UniversalHeader onMenuClick={() => setMenuOpen(true)} />

        {/* Cover */}
        <div className="hgs-cover">
          {page.cover_url ? (
            <img src={page.cover_url} alt={page.name} className="hgs-cover-img" loading="lazy" />
          ) : (
            <div className="hgs-cover-fallback" aria-hidden="true" />
          )}
          <div className="hgs-cover-fade" />
        </div>

        {/* Profile header */}
        <div className="hgs-header">
          <div className="hgs-avatar">
            {page.avatar_url ? (
              <img src={page.avatar_url} alt="" loading="lazy" />
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
              <span><strong>{page.follower_count}</strong> Followers</span>
              <span><strong>{group.games_hosted}</strong> Games Hosted</span>
            </div>
          </div>
          <div className="hgs-cta-row">
            <button className="hgs-primary-btn" onClick={() => router.push(`/hub/commander/home-games?code=${group.club_code || group.invite_code || ''}`)}>
              Join Group
            </button>
            <button className="hgs-ghost-btn" onClick={copyShareUrl}>
              {copyState || 'Share'}
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="hgs-body">
          {/* Left: about + upcoming */}
          <div className="hgs-col-main">
            {(group.description || group.tagline) && (
              <section className="hgs-section">
                <h2>About</h2>
                <p>{group.description || group.tagline}</p>
              </section>
            )}

            <section className="hgs-section">
              <h2>Upcoming Games</h2>
              {upcoming_games.length === 0 ? (
                <div className="hgs-empty">No upcoming games scheduled. Check back soon.</div>
              ) : (
                <div className="hgs-games-list">
                  {upcoming_games.map((g) => {
                    const seatsLeft = g.max_players ? Math.max(0, g.max_players - (g.rsvp_yes || 0)) : null;
                    return (
                      <div key={g.id} className="hgs-game-card">
                        <div className="hgs-game-date">
                          <div className="hgs-game-mon">{formatDate(g.scheduled_date).split(' ')[1] || ''}</div>
                          <div className="hgs-game-day">{formatDate(g.scheduled_date).split(' ')[2] || ''}</div>
                          <div className="hgs-game-dow">{formatDate(g.scheduled_date).split(' ')[0] || ''}</div>
                        </div>
                        <div className="hgs-game-body">
                          <h3>{g.title || `${GAME_TYPE_LABELS[g.game_type] || g.game_type?.toUpperCase()} ${g.stakes || ''}`.trim()}</h3>
                          <div className="hgs-game-meta">
                            {g.start_time && <span>{formatTime(g.start_time)}</span>}
                            {g.stakes && <span>· {g.stakes}</span>}
                            {seatsLeft !== null && <span>· {seatsLeft} seat{seatsLeft === 1 ? '' : 's'} left</span>}
                            {g.neighborhood && <span>· {g.neighborhood}</span>}
                          </div>
                          {g.description && <p className="hgs-game-desc">{g.description}</p>}
                        </div>
                        <button className="hgs-game-rsvp" onClick={() => router.push(`/hub/commander/home-games/${group.id}`)}>
                          RSVP
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

          {/* Right: schedule + quick facts */}
          <aside className="hgs-col-side">
            <section className="hgs-section hgs-card">
              <h2>Schedule</h2>
              <dl className="hgs-kv">
                <div><dt>Game</dt><dd>{formatStakesLine(group)}</dd></div>
                {formatSchedule(group) && <div><dt>Cadence</dt><dd>{formatSchedule(group)}</dd></div>}
                {group.typical_time && <div><dt>Time</dt><dd>{formatTime(group.typical_time)}</dd></div>}
                {(group.typical_buyin_min || group.typical_buyin_max) && (
                  <div><dt>Buy-in</dt><dd>${group.typical_buyin_min || '?'} – ${group.typical_buyin_max || '?'}</dd></div>
                )}
                {group.max_players && <div><dt>Max</dt><dd>{group.max_players} players</dd></div>}
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
              <Link href="/hub/home-games">← Back to all home games</Link>
            </div>
          </aside>
        </div>

        <HamburgerMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} worldKey="hub" />
        <style jsx>{pageStyles}</style>
      </div>
    </>
  );
}

const pageStyles = `
.hgs-page{min-height:100vh;background:linear-gradient(180deg,#0a0f1c 0%,#050810 100%);color:#fff;font-family:"Inter",-apple-system,sans-serif;padding-bottom:80px}
.hgs-loading,.hgs-notfound{min-height:60vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:40px 20px}
.hgs-spinner{width:40px;height:40px;border:3px solid rgba(255,255,255,.1);border-top-color:#ef4444;border-radius:50%;animation:hgs-spin .8s linear infinite;margin-bottom:12px}
@keyframes hgs-spin{to{transform:rotate(360deg)}}
.hgs-notfound h1{font-size:24px;margin:0 0 8px}
.hgs-notfound p{color:rgba(255,255,255,.6);margin-bottom:20px;max-width:420px}
.hgs-cover{position:relative;height:220px;width:100%;overflow:hidden;background:linear-gradient(135deg,#1e293b,#0f172a)}
.hgs-cover-img{width:100%;height:100%;object-fit:cover}
.hgs-cover-fallback{width:100%;height:100%;background:linear-gradient(135deg,#dc2626 0%,#7c2d12 50%,#0f172a 100%)}
.hgs-cover-fade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(10,15,28,0) 40%,rgba(10,15,28,.85) 100%)}
.hgs-header{max-width:1100px;margin:-60px auto 0;padding:0 20px;display:flex;align-items:flex-end;gap:20px;flex-wrap:wrap;position:relative;z-index:2}
.hgs-avatar{width:128px;height:128px;border-radius:16px;background:#111827;border:4px solid #050810;overflow:hidden;flex-shrink:0;box-shadow:0 8px 24px rgba(0,0,0,.5)}
.hgs-avatar img{width:100%;height:100%;object-fit:cover}
.hgs-avatar-fallback{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:56px;font-weight:900;color:#ef4444;background:#1a1f2e}
.hgs-header-info{flex:1;min-width:260px}
.hgs-name{font-size:28px;font-weight:900;margin:0 0 4px;letter-spacing:-.5px}
.hgs-meta{color:rgba(255,255,255,.65);font-size:14px;margin:0 0 10px}
.hgs-stats{display:flex;gap:18px;flex-wrap:wrap;font-size:13px;color:rgba(255,255,255,.5)}
.hgs-stats strong{color:#fff;font-weight:700;margin-right:4px}
.hgs-cta-row{display:flex;gap:8px;flex-wrap:wrap}
.hgs-primary-btn{padding:10px 18px;background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:800;letter-spacing:.5px;cursor:pointer;box-shadow:0 4px 14px rgba(239,68,68,.3);display:inline-block;text-decoration:none;transition:transform .15s}
.hgs-primary-btn:hover{transform:translateY(-1px)}
.hgs-ghost-btn{padding:10px 18px;background:rgba(255,255,255,.08);color:#fff;border:1px solid rgba(255,255,255,.15);border-radius:8px;font-size:13px;font-weight:700;cursor:pointer}
.hgs-ghost-btn:hover{background:rgba(255,255,255,.14)}
.hgs-full{width:100%}
.hgs-body{max-width:1100px;margin:30px auto 0;padding:0 20px;display:grid;grid-template-columns:1fr 320px;gap:24px}
@media (max-width: 900px){.hgs-body{grid-template-columns:1fr}}
.hgs-section{background:rgba(15,23,42,.55);border:1px solid rgba(148,163,184,.12);border-radius:14px;padding:20px;margin-bottom:18px}
.hgs-section h2{font-size:14px;text-transform:uppercase;letter-spacing:1.5px;color:rgba(255,255,255,.55);margin:0 0 14px;font-weight:800}
.hgs-section p{color:rgba(255,255,255,.78);line-height:1.55;margin:0;white-space:pre-wrap}
.hgs-empty{color:rgba(255,255,255,.4);text-align:center;padding:20px;font-size:14px}
.hgs-games-list{display:flex;flex-direction:column;gap:10px}
.hgs-game-card{display:flex;align-items:stretch;gap:14px;padding:14px;background:rgba(0,0,0,.25);border:1px solid rgba(148,163,184,.1);border-radius:10px}
.hgs-game-date{flex-shrink:0;width:72px;padding:8px;background:linear-gradient(135deg,#ef4444,#dc2626);border-radius:8px;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
.hgs-game-mon{font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:700;opacity:.85}
.hgs-game-day{font-size:24px;font-weight:900;line-height:1}
.hgs-game-dow{font-size:11px;text-transform:uppercase;letter-spacing:.5px;opacity:.85;margin-top:2px}
.hgs-game-body{flex:1;min-width:0}
.hgs-game-body h3{font-size:16px;font-weight:700;margin:0 0 4px}
.hgs-game-meta{font-size:13px;color:rgba(255,255,255,.55);display:flex;gap:6px;flex-wrap:wrap}
.hgs-game-desc{font-size:13px;color:rgba(255,255,255,.5);margin:6px 0 0 !important}
.hgs-game-rsvp{padding:8px 14px;background:rgba(239,68,68,.15);color:#ef4444;border:1px solid rgba(239,68,68,.35);border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;align-self:center;flex-shrink:0}
.hgs-game-rsvp:hover{background:rgba(239,68,68,.25)}
.hgs-posts{display:flex;flex-direction:column;gap:12px}
.hgs-post{background:rgba(0,0,0,.2);border:1px solid rgba(148,163,184,.08);border-radius:10px;padding:14px}
.hgs-post header{display:flex;gap:8px;align-items:center;margin-bottom:8px;font-size:13px;color:rgba(255,255,255,.6)}
.hgs-post header strong{color:#fff;font-size:14px;font-weight:700}
.hgs-post-pin{background:rgba(239,68,68,.15);color:#ef4444;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;margin-left:auto}
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
.hgs-footer-link :global(a){color:rgba(239,68,68,.8);text-decoration:none;font-weight:600}
.hgs-footer-link :global(a:hover){color:#ef4444}
`;
