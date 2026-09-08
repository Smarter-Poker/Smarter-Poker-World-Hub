/**
 * ClubPagesView — The Club Pages browser: search, category filter, follow/unfollow, and the create-page modal.
 *
 * This file used to open with a verbatim copy of the social-media feed page's
 * "PROTECTED FILE" banner, followed by ~3,000 lines of that page's code:
 * LinkPreviewCard and the whole PostCard component, none of it reachable from
 * here (ClubPagesView never rendered a PostCard). The banner described features that
 * live in pages/hub/social-media/index.js, not in this component, and it
 * carried that page's line numbers - which were wrong even there.
 *
 * Removed 2026-09-08 along with the imports the dead code was the only
 * consumer of. If you need the feed's behaviour, import from the feed's
 * modules; do not copy this file again.
 */

import { useRouter } from 'next/router';
import React, { useState, useEffect } from 'react';

import { getAuthUser } from '../../../src/lib/authUtils';

// God-Mode Stack

import { getAccessToken } from '../../../src/lib/authUtils';

import dynamic from 'next/dynamic';
const SharePostModal = dynamic(() => import('../../../src/components/social/SharePostModal'), {
  ssr: false,
});
const ShareStreakLeaderboard = dynamic(
  () => import('../../../src/components/social/ShareStreakLeaderboard'),
  { ssr: false }
);
// Shared utilities — single source of truth (extracted from this file)
import { SOCIAL_COLORS as C } from '../../../src/lib/socialHelpers';

const CATEGORY_LABELS = {
  poker_room: 'Poker Room',
  casino: 'Casino',
  card_club: 'Card Club',
  charity: 'Charity Organization',
  league: 'League / Tour',
  home_game: 'Home Game',
  other: 'Other',
};
function ClubPagesView({
  C,
  pages,
  setPages,
  loading,
  setLoading,
  category,
  setCategory,
  search,
  setSearch,
  followingIds,
  setFollowingIds,
  onClose,
  onViewLiveGames,
}) {
  const router = useRouter();
  const [searchInput, setSearchInput] = useState(search);
  const [showFollowedOnly, setShowFollowedOnly] = useState(false);
  // Hydration-safe: read localStorage only on the client after mount
  const [isStaff, setIsStaff] = useState(false);
  useEffect(() => {
    try {
      setIsStaff(!!JSON.parse(localStorage.getItem('commander_staff') || 'null'));
    } catch (e) {
      console.warn('[App] Handled exception:', e);
    }
  }, []);

  function getAnonUserId() {
    try {
      let uid = localStorage.getItem('sp-anon-uid');
      if (!uid) {
        uid = 'anon-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem('sp-anon-uid', uid);
      }
      return uid;
    } catch {
      return 'anon-fallback';
    }
  }

  // Fetch pages data — only home_games, charity, clubs (no venues/tours/series)
  useEffect(() => {
    const fetchClubPages = async () => {
      setLoading(true);
      try {
        // 2026-08-15 audit: this sent getAnonUserId() ("anon-…", not a UUID)
        // with no bearer token, so the API's follow lookup never ran —
        // is_following was false on every card and "Show Following" always
        // filtered everything out. Send the real user + token instead.
        const authedUser = getAuthUser();
        const accessToken = getAccessToken();
        const baseParams = { sort: 'popular', limit: '80' };
        if (search) baseParams.search = search;
        if (authedUser?.id && accessToken) baseParams.user_id = authedUser.id;
        if (showFollowedOnly && baseParams.user_id) baseParams.followed_only = 'true';
        const fetchHeaders = accessToken ? { Authorization: `Bearer ${accessToken}` } : {};

        let allPages = [];
        if (category === 'all') {
          // Fetch home_games, charity, clubs in parallel
          const [hgRes, charRes, clubRes] = await Promise.all(
            ['home_games', 'charity', 'clubs'].map((cat) =>
              fetch(
                `/api/poker/pages?${new URLSearchParams({ ...baseParams, category: cat })}`,
                { headers: fetchHeaders }
              ).then((r) => r.json())
            )
          );
          if (hgRes.success) allPages.push(...(hgRes.data || []));
          if (charRes.success) allPages.push(...(charRes.data || []));
          if (clubRes.success) allPages.push(...(clubRes.data || []));
        } else {
          const res = await fetch(
            `/api/poker/pages?${new URLSearchParams({ ...baseParams, category })}`,
            { headers: fetchHeaders }
          );
          if (!res.ok) throw new Error(`Request failed (${res.status})`);
          const json = await res.json();
          if (json.success) allPages = json.data || [];
        }

        setPages(allPages);
        const fSet = new Set();
        allPages.forEach((p) => {
          if (p.is_following) fSet.add(`${p.page_type}:${p.page_id}`);
        });
        setFollowingIds(fSet);
      } catch (e) {
        console.warn('Club pages fetch error:', e);
      }
      setLoading(false);
    };
    fetchClubPages();
  }, [category, search, showFollowedOnly]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const handlePageFollow = async (pageType, pageId) => {
    const key = `${pageType}:${pageId}`;
    const isNowFollowing = !followingIds.has(key);
    setFollowingIds((prev) => {
      const next = new Set(prev);
      if (isNowFollowing) next.add(key);
      else next.delete(key);
      return next;
    });
    setPages((prev) =>
      prev.map((p) => {
        if (p.page_type === pageType && p.page_id === pageId) {
          return {
            ...p,
            is_following: isNowFollowing,
            follower_count: isNowFollowing
              ? (p.follower_count || 0) + 1
              : Math.max(0, (p.follower_count || 0) - 1),
          };
        }
        return p;
      })
    );
    try {
      const storageKey = `followed-${pageType === 'venue' ? 'venues' : pageType === 'tour' ? 'tours' : 'series'}`;
      const stored = JSON.parse(localStorage.getItem(storageKey) || '[]');
      if (isNowFollowing) {
        if (!stored.includes(pageId)) stored.push(pageId);
      } else {
        const idx = stored.indexOf(pageId);
        if (idx !== -1) stored.splice(idx, 1);
      }
      localStorage.setItem(storageKey, JSON.stringify(stored));
    } catch (e) {
      console.warn('[App] Handled exception:', e);
    }
    try {
      const _token = getAccessToken();
      if (!_token) return; // Anonymous users: localStorage-only follow (no server persistence)
      // Only venue/tour/series supported by /api/poker/follow — home_game/charity/club skip server persist
      if (!['venue', 'tour', 'series'].includes(pageType)) return;
      await fetch('/api/poker/follow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + _token },
        body: JSON.stringify({
          page_type: pageType,
          page_id: pageId,
          action: isNowFollowing ? 'follow' : 'unfollow',
        }),
      });
    } catch (e) {
      console.warn('[App] Handled exception:', e);
    }
  };

  const cats = [
    { key: 'all', label: 'All' },
    { key: 'home_games', label: 'Home Games' },
    { key: 'charity', label: 'Charity' },
    { key: 'clubs', label: 'Clubs' },
  ];

  const typeColors = {
    venue: { bg: '#1877F2', light: '#E7F3FF' },
    tour: { bg: '#E74C3C', light: '#FDEDEC' },
    series: { bg: '#F39C12', light: '#FEF5E7' },
    home_game: { bg: '#22C55E', light: '#F0FDF4' },
    charity: { bg: '#A855F7', light: '#FAF5FF' },
    club: { bg: '#0EA5E9', light: '#F0F9FF' },
  };

  return (
    <div style={{ paddingBottom: 8 }}>
      {/* Header */}
      <div
        style={{ background: C.card, borderRadius: 12, padding: '16px 16px 12px', marginBottom: 8 }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 12,
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: C.text }}>Club Pages</h2>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: C.textSec }}>
              Follow Home Games, Charity Clubs & More
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {isStaff && (
              <button
                onClick={() => (window.top.location.href = '/hub/commander')}
                style={{
                  background: 'linear-gradient(135deg, #1a1a2e, #0f0f0f)',
                  border: '1px solid #22D3EE',
                  borderRadius: 20,
                  padding: '8px 14px',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  color: '#22D3EE',
                  fontFamily: "'Orbitron', sans-serif",
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  boxShadow: '0 0 8px rgba(34,211,238,0.2)',
                }}
              >
                Commander
              </button>
            )}
            <button
              onClick={onClose}
              style={{
                background: '#E4E6EB',
                border: 'none',
                borderRadius: 20,
                padding: '8px 16px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                color: C.text,
                fontFamily: 'inherit',
              }}
            >
              Back To Feed
            </button>
          </div>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <input
            type="text"
            placeholder="Search Pages..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 36px 10px 14px',
              border: '1px solid #CCD0D5',
              borderRadius: 20,
              fontSize: 14,
              background: '#F0F2F5',
              color: C.text,
              outline: 'none',
              fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
          />
          {searchInput && (
            <button
              onClick={() => {
                setSearchInput('');
                setSearch('');
              }}
              style={{
                position: 'absolute',
                right: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#65676B',
                padding: 4,
              }}
            >
              X
            </button>
          )}
        </div>

        {/* Category Tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
          {cats.map((c) => (
            <button
              key={c.key}
              onClick={() => setCategory(c.key)}
              style={{
                padding: '6px 14px',
                borderRadius: 20,
                border: 'none',
                background: category === c.key ? '#1877F2' : '#E4E6EB',
                color: category === c.key ? '#fff' : C.text,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Following Filter */}
        <button
          onClick={() => setShowFollowedOnly(!showFollowedOnly)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 14px',
            borderRadius: 20,
            border: showFollowedOnly ? '1px solid #1877F2' : '1px solid #CCD0D5',
            background: showFollowedOnly ? '#E7F3FF' : 'transparent',
            color: showFollowedOnly ? '#1877F2' : C.textSec,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill={showFollowedOnly ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          {showFollowedOnly ? 'Following Only' : 'Show Following'}
        </button>
      </div>

      {/* Pages List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: C.textSec }}>
          <div
            style={{
              width: 32,
              height: 32,
              border: '3px solid #E4E6EB',
              borderTopColor: '#1877F2',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
              margin: '0 auto 12px',
            }}
          />
          <p>Loading Pages...</p>
        </div>
      ) : pages.length === 0 ? (
        <div style={{ background: C.card, borderRadius: 12, padding: 40, textAlign: 'center' }}>
          <p style={{ fontSize: 16, fontWeight: 600, color: C.text, margin: '0 0 4px' }}>
            {showFollowedOnly ? 'No followed pages' : 'No pages found'}
          </p>
          <p style={{ fontSize: 13, color: C.textSec, margin: 0 }}>
            {showFollowedOnly
              ? 'Follow some pages to see them here.'
              : 'Try a different search or category.'}
          </p>
          {showFollowedOnly && (
            <button
              onClick={() => setShowFollowedOnly(false)}
              style={{
                marginTop: 12,
                padding: '8px 20px',
                background: '#1877F2',
                border: 'none',
                borderRadius: 20,
                color: '#fff',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Browse All Pages
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {pages.map((page) => {
            const tc = typeColors[page.page_type] || typeColors.venue;
            const isFollowing = followingIds.has(`${page.page_type}:${page.page_id}`);
            return (
              <div
                key={`${page.page_type}-${page.page_id}`}
                style={{
                  background: C.card,
                  borderRadius: 10,
                  border: '1px solid #E4E6EB',
                  overflow: 'hidden',
                }}
              >
                {/* Banner */}
                <div
                  style={{
                    background: tc.bg,
                    padding: '6px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: 'rgba(255,255,255,0.9)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}
                  >
                    {page.page_type === 'venue'
                      ? 'Venue'
                      : page.page_type === 'tour'
                        ? 'Tour'
                        : page.page_type === 'series'
                          ? 'Series'
                          : page.page_type === 'home_game'
                            ? 'Home Game'
                            : page.page_type === 'charity'
                              ? 'Charity'
                              : page.page_type === 'club'
                                ? 'Club'
                                : page.page_type}
                  </span>
                  {page.follower_count > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>
                      {page.follower_count} follower{page.follower_count !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>

                {/* Body */}
                <div style={{ padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    {page.avatar_url ? (
                      <img
                        src={page.avatar_url}
                        alt=""
                        style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: '50%',
                          background: tc.light,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: tc.bg,
                          flexShrink: 0,
                        }}
                      >
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          {page.page_type === 'venue' && (
                            <>
                              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                              <circle cx="12" cy="10" r="3" />
                            </>
                          )}
                          {page.page_type === 'tour' && (
                            <>
                              <circle cx="12" cy="12" r="10" />
                              <line x1="2" y1="12" x2="22" y2="12" />
                              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                            </>
                          )}
                          {page.page_type === 'series' && (
                            <>
                              <rect x="3" y="4" width="18" height="18" rx="2" />
                              <line x1="16" y1="2" x2="16" y2="6" />
                              <line x1="8" y1="2" x2="8" y2="6" />
                              <line x1="3" y1="10" x2="21" y2="10" />
                            </>
                          )}
                          {page.page_type === 'home_game' && (
                            <>
                              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                              <polyline points="9 22 9 12 15 12 15 22" />
                            </>
                          )}
                          {page.page_type === 'charity' && (
                            <>
                              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                            </>
                          )}
                          {page.page_type === 'club' && (
                            <>
                              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                              <circle cx="9" cy="7" r="4" />
                              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                            </>
                          )}
                        </svg>
                      </div>
                    )}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        onClick={() => {
                          if (page.is_social_page) {
                            onViewLiveGames &&
                              onViewLiveGames({ id: page.page_id, name: page.name });
                          } else if (page.detail_url) {
                            router.push(page.detail_url);
                          }
                        }}
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: C.text,
                          cursor: 'pointer',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {page.name}
                      </div>
                      <div style={{ fontSize: 12, color: C.textSec }}>
                        {CATEGORY_LABELS[page.category] || page.category}
                      </div>
                      {(page.location_city || page.location_state) && (
                        <div
                          style={{
                            fontSize: 11,
                            color: C.textSec,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 3,
                          }}
                        >
                          <svg
                            width="10"
                            height="10"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                            <circle cx="12" cy="10" r="3" />
                          </svg>
                          {[page.location_city, page.location_state].filter(Boolean).join(', ')}
                        </div>
                      )}
                    </div>
                  </div>

                  {page.subtitle && (
                    <p style={{ fontSize: 12, color: C.textSec, margin: '0 0 8px' }}>
                      {page.subtitle}
                    </p>
                  )}

                  {/* Meta tags */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
                    {page.page_type === 'venue' && page.has_tournaments && (
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 4,
                          fontSize: 10,
                          fontWeight: 600,
                          background: '#E7F3FF',
                          color: '#1877F2',
                        }}
                      >
                        Tournaments
                      </span>
                    )}
                    {page.page_type === 'series' && page.total_events && (
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 4,
                          fontSize: 10,
                          fontWeight: 600,
                          background: '#FFF4E5',
                          color: '#E67E22',
                        }}
                      >
                        {page.total_events} Events
                      </span>
                    )}
                    {page.page_type === 'series' && page.start_date && (
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 4,
                          fontSize: 10,
                          fontWeight: 600,
                          background: '#E8EAF6',
                          color: '#303F9F',
                        }}
                      >
                        {new Date(page.start_date + 'T00:00:00').toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    )}
                    {page.page_type === 'tour' && page.established && (
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 4,
                          fontSize: 10,
                          fontWeight: 600,
                          background: '#F3E5F5',
                          color: '#7B1FA2',
                        }}
                      >
                        Est. {page.established}
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => handlePageFollow(page.page_type, page.page_id)}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        borderRadius: 20,
                        border: 'none',
                        background: isFollowing ? '#E4E6EB' : '#1877F2',
                        color: isFollowing ? C.text : '#fff',
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                      }}
                    >
                      {isFollowing ? 'Following' : 'Follow'}
                    </button>
                    <button
                      onClick={() => {
                        if (page.is_social_page) {
                          onViewLiveGames && onViewLiveGames({ id: page.page_id, name: page.name });
                        } else if (page.detail_url) {
                          router.push(page.detail_url);
                        }
                      }}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        borderRadius: 20,
                        border: 'none',
                        background: '#E4E6EB',
                        color: C.text,
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      {page.is_social_page ? 'Live Games' : 'View Page'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <button
              onClick={() => router.push('/hub/pages')}
              style={{
                padding: '10px 24px',
                background: '#E4E6EB',
                border: 'none',
                borderRadius: 20,
                color: C.text,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              View All Pages
            </button>
          </div>
        </div>
      )}

      <style>{`
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `}</style>
    </div>
  );
}

export default ClubPagesView;
