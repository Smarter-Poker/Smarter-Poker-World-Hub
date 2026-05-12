/**
 * PUBLIC USER PROFILE PAGE - SmarterPoker style
 * View any user's profile with cover photo, tabs, friends, posts, and poker resume
 * Route: /hub/user/[username]
 */

import SEOHead from '../../../src/components/seo/SEOHead';
import Link from 'next/link';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import { useState, useEffect, useRef } from 'react';
import React from 'react';
import { usePersistedState } from '../../../src/hooks/usePersistedState';
import { supabase } from '../../../src/lib/supabase';
import { SAFE_PROFILE_COLUMNS } from '../../../src/lib/profileColumns';
import { emitCacheInvalidation, onCacheInvalidation } from '../../../src/lib/cacheSync';
import {
  broadcastSync,
  broadcastSyncDebounced,
  listenBroadcast,
  BROADCAST_TAB_ID,
} from '../../../src/lib/broadcastSync';
import { eventBus, busEmit } from '../../../src/engine/EventBus';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import toast from '../../../src/stores/toastStore';

// Components
import PageTransition from '../../../src/components/transitions/PageTransition';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import ArticleCard from '../../../src/components/social/ArticleCard';
import ArticleReaderModal from '../../../src/components/social/ArticleReaderModal';
import ProfileSkeleton from '../../../src/components/skeletons/ProfileSkeleton';
import { getAuthUser, getAccessToken } from '../../../src/lib/authUtils';
import { isHorseOnlineNow } from '../../../src/lib/horsePresence';
import EditPostModal from '../../../src/components/social/EditPostModal';
import HashtagRenderer from '../../../src/components/social/HashtagRenderer';
import SharePostModal from '../../../src/components/social/SharePostModal';
import ReactionPicker from '../../../src/components/social/ReactionPicker';
import PostImageLightbox from '../../../src/components/social/PostImageLightbox';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import ViralGrowthModule from '../../../src/components/social/ViralGrowthModule';
import CrewDashboard from '../../../src/components/social/CrewDashboard';

const PlayerNotes = dynamic(() => import('../../../src/components/poker/PlayerNotes'), {
  ssr: false,
});
const LiveSessionToggle = dynamic(
  () => import('../../../src/components/social/LiveSessionToggle'),
  { ssr: false }
);
const LiveActivityFeed = dynamic(() => import('../../../src/components/social/LiveActivityFeed'), {
  ssr: false,
});

const C = {
  bg: '#F0F2F5',
  card: '#FFFFFF',
  text: '#050505',
  textSec: '#65676B',
  border: '#DADDE1',
  blue: '#1877F2',
  gold: '#FFD700',
  green: '#42B72A',
};

// Helper: Time ago
const timeAgo = (date) => {
  if (!date) return '';
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
};

// Avatar Component with online status
function Avatar({ src, name, size = 120 }) {
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <img
        src={src || '/default-avatar.png'}
        alt={name || 'Player'}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          border: '4px solid white',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          background: '#1a1a2e',
        }}
        loading="lazy"
        onError={(e) => {
          e.target.onerror = null;
          e.target.src = '/default-avatar.png';
        }}
      />
    </div>
  );
}

// Friend Avatar for grid
function FriendAvatar({ friend }) {
  const mutualCount = friend.mutualCount || 0;
  return (
    <Link
      href={`/hub/user/${friend.username}`}
      style={{ textDecoration: 'none', textAlign: 'center' }}
    >
      <div style={{ position: 'relative', marginBottom: 8 }}>
        <img
          src={friend.avatar_url || '/default-avatar.png'}
          alt={friend.username}
          style={{
            width: '100%',
            aspectRatio: '1',
            borderRadius: '50%',
            objectFit: 'cover',
            background: '#e4e6eb',
            border: '3px solid #1877F2',
          }}
          loading="lazy"
        />
      </div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: C.text,
          wordBreak: 'break-word',
          lineHeight: 1.3,
        }}
      >
        {friend.full_name?.split(' ').slice(0, 2).join(' ') || friend.username}
      </div>
      <div style={{ fontSize: 11, color: C.textSec }}>
        {mutualCount > 0 ? `${mutualCount} mutual` : ''}
      </div>
    </Link>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// FRIENDS MODAL — Facebook-style "See All Friends" overlay
// Tabs: All Friends | Mutual Friends | Suggested
// ═══════════════════════════════════════════════════════════════════════════
function FriendsModal({ isOpen, onClose, profileId, profileName, currentUserId, socialIdRef }) {
  const [modalTab, setModalTab] = useState('all');
  const [allFriends, setAllFriends] = useState([]);
  const [mutualFriends, setMutualFriends] = useState([]);
  const [suggestedFriends, setSuggestedFriends] = useState([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingRequests, setPendingRequests] = useState(new Set());

  // Reset state + load on open
  useEffect(() => {
    if (!isOpen || !profileId) return;
    setModalLoading(true);
    setSearchQuery('');
    setModalTab('all');
    setPendingRequests(new Set());
    loadFriendsData();
  }, [isOpen, profileId]);

  // Escape key handler + body scroll lock
  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      // Always clear — don't restore saved value (race condition risk)
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen, onClose]);

  const loadFriendsData = async () => {
    try {
      const sid = socialIdRef?.current || profileId;

      // 1. Get ALL of the viewed profile's friends (both directions)
      const [sentRes, recvRes] = await Promise.all([
        supabase
          .from('friendships')
          .select('friend_id')
          .eq('user_id', sid)
          .eq('status', 'accepted'),
        supabase
          .from('friendships')
          .select('user_id')
          .eq('friend_id', sid)
          .eq('status', 'accepted'),
      ]);
      const profileFriendIds = new Set();
      (sentRes.data || []).forEach((r) => profileFriendIds.add(r.friend_id));
      (recvRes.data || []).forEach((r) => profileFriendIds.add(r.user_id));
      const profileFriendArray = [...profileFriendIds];

      if (profileFriendArray.length === 0) {
        setAllFriends([]);
        setMutualFriends([]);
        setSuggestedFriends([]);
        setModalLoading(false);
        return;
      }

      // 2. Get profiles for all friends (batch in chunks of 50 for .in() safety)
      const allProfiles = [];
      for (let i = 0; i < profileFriendArray.length; i += 50) {
        const chunk = profileFriendArray.slice(i, i + 50);
        const { data } = await supabase
          .from('profiles')
          .select('id, username, full_name, avatar_url')
          .in('id', chunk);
        if (data) allProfiles.push(...data);
      }
      const profileMap = new Map(allProfiles.map((p) => [p.id, p]));

      // 3. Get current user's friends (if logged in)
      let myFriendSet = new Set();
      if (currentUserId) {
        const [mySent, myRecv] = await Promise.all([
          supabase
            .from('friendships')
            .select('friend_id')
            .eq('user_id', currentUserId)
            .eq('status', 'accepted'),
          supabase
            .from('friendships')
            .select('user_id')
            .eq('friend_id', currentUserId)
            .eq('status', 'accepted'),
        ]);
        (mySent.data || []).forEach((r) => myFriendSet.add(r.friend_id));
        (myRecv.data || []).forEach((r) => myFriendSet.add(r.user_id));
      }

      // 4. For REAL per-friend mutual counts, batch-fetch friendships for all displayed friends
      //    Then compute: for each friend X, mutualCount = |X's friends ∩ my friends|
      const friendFriendSets = new Map(); // friendId -> Set of their friend IDs
      if (currentUserId && profileFriendArray.length > 0) {
        // Batch in chunks of 30 to avoid URL length limits
        const chunks = [];
        for (let i = 0; i < profileFriendArray.length; i += 30) {
          chunks.push(profileFriendArray.slice(i, i + 30));
        }
        const allFriendships = [];
        for (const chunk of chunks) {
          const [s, r] = await Promise.all([
            supabase
              .from('friendships')
              .select('user_id, friend_id')
              .in('user_id', chunk)
              .eq('status', 'accepted'),
            supabase
              .from('friendships')
              .select('user_id, friend_id')
              .in('friend_id', chunk)
              .eq('status', 'accepted'),
          ]);
          if (s.data) allFriendships.push(...s.data);
          if (r.data) allFriendships.push(...r.data);
        }
        // Build per-friend friend sets
        for (const fid of profileFriendArray) {
          friendFriendSets.set(fid, new Set());
        }
        for (const row of allFriendships) {
          if (friendFriendSets.has(row.user_id))
            friendFriendSets.get(row.user_id).add(row.friend_id);
          if (friendFriendSets.has(row.friend_id))
            friendFriendSets.get(row.friend_id).add(row.user_id);
        }
      }

      // 5. Build friend objects with real mutual counts
      const all = profileFriendArray
        .map((fid) => {
          const profile = profileMap.get(fid);
          if (!profile) return null;
          let mutualCount = 0;
          if (currentUserId && friendFriendSets.has(fid)) {
            const theirFriends = friendFriendSets.get(fid);
            mutualCount = [...theirFriends].filter(
              (id) => myFriendSet.has(id) && id !== currentUserId
            ).length;
          }
          return { ...profile, mutualCount };
        })
        .filter(Boolean);

      // Sort by mutual count descending, then alphabetically
      all.sort(
        (a, b) =>
          b.mutualCount - a.mutualCount ||
          (a.full_name || a.username || '').localeCompare(b.full_name || b.username || '')
      );

      setAllFriends(all);

      if (currentUserId) {
        // Mutual = friends of this profile that ARE also my friends
        setMutualFriends(all.filter((f) => myFriendSet.has(f.id)));
        // Suggested = friends of this profile that are NOT my friends and not me
        setSuggestedFriends(all.filter((f) => !myFriendSet.has(f.id) && f.id !== currentUserId));
      } else {
        setMutualFriends([]);
        setSuggestedFriends([]);
      }
    } catch (e) {
      console.warn('[FriendsModal] Load failed:', e?.message || e);
    }
    setModalLoading(false);
  };

  if (!isOpen) return null;

  const tabs = [
    { key: 'all', label: 'All Friends', count: allFriends.length },
    { key: 'mutual', label: 'Mutual Friends', count: mutualFriends.length },
    { key: 'suggested', label: 'Suggested', count: suggestedFriends.length },
  ];
  // Hide mutual/suggested tabs if not logged in
  const visibleTabs = currentUserId ? tabs : [tabs[0]];
  const activeList =
    modalTab === 'mutual'
      ? mutualFriends
      : modalTab === 'suggested'
        ? suggestedFriends
        : allFriends;
  const filtered = searchQuery.trim()
    ? activeList.filter(
        (f) =>
          (f.full_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
          (f.username || '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    : activeList;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: C.card,
          borderRadius: 12,
          width: '100%',
          maxWidth: 600,
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 12px 48px rgba(0,0,0,0.3)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: `1px solid ${C.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: C.text }}>
            {profileName ? `${profileName.split(' ')[0]}'s Friends` : 'Friends'}
          </h2>
          <button
            onClick={onClose}
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              border: 'none',
              background: C.bg,
              cursor: 'pointer',
              fontSize: 18,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: C.textSec,
            }}
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, padding: '0 20px' }}>
          {visibleTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setModalTab(tab.key)}
              style={{
                padding: '12px 16px',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                fontSize: 15,
                fontWeight: modalTab === tab.key ? 700 : 500,
                color: modalTab === tab.key ? C.blue : C.textSec,
                borderBottom:
                  modalTab === tab.key ? `3px solid ${C.blue}` : '3px solid transparent',
                transition: 'all 0.15s',
              }}
            >
              {tab.label} <span style={{ fontSize: 13, opacity: 0.7 }}>({tab.count})</span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div style={{ padding: '12px 20px' }}>
          <input
            type="text"
            placeholder="Search friends..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: 24,
              border: `1px solid ${C.border}`,
              background: C.bg,
              fontSize: 15,
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Friend List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px' }}>
          {modalLoading ? (
            <div style={{ padding: '8px 0' }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0' }}
                >
                  <div
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: '50%',
                      background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)',
                      backgroundSize: '200% 100%',
                      animation: 'shimmer 1.5s infinite',
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        width: '60%',
                        height: 14,
                        borderRadius: 7,
                        background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)',
                        backgroundSize: '200% 100%',
                        animation: 'shimmer 1.5s infinite',
                        marginBottom: 6,
                      }}
                    />
                    <div
                      style={{
                        width: '35%',
                        height: 10,
                        borderRadius: 5,
                        background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)',
                        backgroundSize: '200% 100%',
                        animation: 'shimmer 1.5s infinite',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: C.textSec }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>
                {modalTab === 'mutual' ? '🤝' : modalTab === 'suggested' ? '💡' : '👥'}
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
                {searchQuery
                  ? 'No results found'
                  : modalTab === 'mutual'
                    ? 'No Mutual Friends'
                    : modalTab === 'suggested'
                      ? 'No Suggestions'
                      : 'No Friends Yet'}
              </div>
              <div style={{ fontSize: 13 }}>
                {modalTab === 'suggested' ? "You're already friends with everyone here!" : ''}
              </div>
            </div>
          ) : (
            filtered.map((friend) => (
              <Link
                key={friend.id}
                href={`/hub/user/${friend.username}`}
                onClick={onClose}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 0',
                  borderBottom: `1px solid ${C.border}`,
                  textDecoration: 'none',
                  color: 'inherit',
                  transition: 'background 0.1s',
                }}
              >
                <img
                  src={friend.avatar_url || '/default-avatar.png'}
                  alt={friend.username}
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: '50%',
                    objectFit: 'cover',
                    background: '#e4e6eb',
                    flexShrink: 0,
                  }}
                  loading="lazy"
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 600,
                      color: C.text,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {friend.full_name || friend.username}
                  </div>
                  {friend.mutualCount > 0 && (
                    <div style={{ fontSize: 13, color: C.textSec }}>
                      {friend.mutualCount} mutual friend{friend.mutualCount !== 1 ? 's' : ''}
                    </div>
                  )}
                </div>
                {modalTab === 'suggested' &&
                  currentUserId &&
                  (pendingRequests.has(friend.id) ? (
                    <span
                      style={{
                        padding: '8px 16px',
                        fontSize: 13,
                        fontWeight: 600,
                        color: C.textSec,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Requested
                    </span>
                  ) : (
                    <button
                      onClick={async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setPendingRequests((prev) => new Set([...prev, friend.id]));
                        try {
                          const { error } = await supabase.from('friendships').insert({
                            user_id: currentUserId,
                            friend_id: friend.id,
                            status: 'pending',
                          });
                          if (error) throw error;
                          toast.success(
                            `Friend request sent to ${friend.full_name?.split(' ')[0] || friend.username}`
                          );
                        } catch (err) {
                          setPendingRequests((prev) => {
                            const n = new Set([...prev]);
                            n.delete(friend.id);
                            return n;
                          });
                          toast.error('Could not send request');
                        }
                      }}
                      style={{
                        padding: '8px 16px',
                        borderRadius: 8,
                        border: 'none',
                        background: C.blue,
                        color: 'white',
                        fontWeight: 600,
                        fontSize: 13,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                      }}
                    >
                      Add Friend
                    </button>
                  ))}
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// Poker Resume Badge - Always shows, with placeholder if no HendonMob linked
function PokerResumeBadge({ hendonData, isOwnProfile = false, onOpenResume }) {
  const hasHendon = hendonData?.hendon_url;
  const hasData =
    hendonData?.hendon_total_cashes != null || hendonData?.hendon_total_earnings != null;

  return (
    <div
      style={{
        background: hasHendon
          ? 'linear-gradient(135deg, #0a0a1a 0%, #1a1a3e 50%, #0d0d2e 100%)'
          : 'linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%)',
        borderRadius: 12,
        padding: 20,
        color: 'white',
        marginBottom: 16,
        border: hasHendon
          ? '1px solid rgba(255, 215, 0, 0.3)'
          : '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: hasHendon
                ? 'linear-gradient(135deg, #FFD700, #FFA500)'
                : 'rgba(255,255,255,0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
            }}
          >
            {hasHendon ? '🏆' : ''}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>POKER RESUME</div>
            <div style={{ fontSize: 11, opacity: 0.6 }}>Tournament Career Statistics</div>
          </div>
        </div>
        {hasHendon ? (
          <div
            style={{
              background: 'rgba(255, 215, 0, 0.15)',
              border: '1px solid rgba(255, 215, 0, 0.4)',
              padding: '3px 10px',
              borderRadius: 16,
              fontSize: 10,
              fontWeight: 600,
              color: C.gold,
            }}
          >
            {' '}
            VERIFIED
          </div>
        ) : (
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              padding: '3px 10px',
              borderRadius: 16,
              fontSize: 10,
              fontWeight: 600,
              color: '#888',
            }}
          >
            NOT LINKED
          </div>
        )}
      </div>
      {hasHendon && hasData ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <div
            style={{
              background: 'rgba(255,255,255,0.05)',
              borderRadius: 10,
              padding: 12,
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 24, fontWeight: 800, color: C.gold }}>
              {hendonData.hendon_total_cashes?.toLocaleString() || '—'}
            </div>
            <div style={{ fontSize: 10, opacity: 0.6, textTransform: 'uppercase' }}>Cashes</div>
          </div>
          <div
            style={{
              background: 'rgba(255,255,255,0.05)',
              borderRadius: 10,
              padding: 12,
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 24, fontWeight: 800, color: '#00ff88' }}>
              ${hendonData.hendon_total_earnings?.toLocaleString() || '—'}
            </div>
            <div style={{ fontSize: 10, opacity: 0.6, textTransform: 'uppercase' }}>Earnings</div>
          </div>
          <div
            style={{
              background: 'rgba(255,255,255,0.05)',
              borderRadius: 10,
              padding: 12,
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 24, fontWeight: 800, color: '#00d4ff' }}>
              $
              {hendonData.hendon_biggest_cash?.toLocaleString() ||
                hendonData.hendon_best_finish ||
                '—'}
            </div>
            <div style={{ fontSize: 10, opacity: 0.6, textTransform: 'uppercase' }}>
              BIGGEST CASH
            </div>
          </div>
        </div>
      ) : hasHendon ? (
        <div style={{ textAlign: 'center', padding: 16, opacity: 0.6 }}>Stats Pending Sync...</div>
      ) : (
        <div style={{ textAlign: 'center', padding: 20 }}>
          <div style={{ fontSize: 14, color: '#888', marginBottom: 8 }}>Resume Not Added Yet</div>
          <div style={{ fontSize: 12, opacity: 0.5, marginBottom: isOwnProfile ? 12 : 0 }}>
            {isOwnProfile
              ? 'Link your HendonMob profile to display your tournament stats'
              : "This player hasn't linked their HendonMob profile yet"}
          </div>
          {isOwnProfile && (
            <Link
              href="/hub/profile-edit"
              style={{
                display: 'inline-block',
                padding: '8px 20px',
                background: 'linear-gradient(135deg, #FFD700, #FFA500)',
                color: '#000',
                borderRadius: 8,
                fontWeight: 700,
                fontSize: 13,
                textDecoration: 'none',
                transition: 'opacity 0.2s',
              }}
            >
              Link Your Resume
            </Link>
          )}
        </div>
      )}
      {hendonData?.hendon_url && onOpenResume && (
        <button
          onClick={() => onOpenResume(hendonData.hendon_url)}
          style={{
            display: 'block',
            width: '100%',
            textAlign: 'center',
            marginTop: 12,
            color: C.gold,
            fontSize: 12,
            textDecoration: 'underline',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          View Full Resume on HendonMob →
        </button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SELF-CONTAINED VIDEO CARD — Handles YouTube embed URLs and direct video files
// Renders a thumbnail + play button overlay; click navigates to Reels viewer
// ═══════════════════════════════════════════════════════════════════════════
function ProfileVideoCard({ url, postId, style = {} }) {
  const router = useRouter();
  const [thumbError, setThumbError] = useState(false);

  // Extract YouTube video ID from watch, embed, shorts, or youtu.be URLs
  // Anchored to domain boundary to prevent matching non-YouTube hosts
  const getYtId = (u) => {
    if (!u) return null;
    const m = u.match(
      /(?:^|\/{2})(?:[\w-]+\.)*(?:youtube(?:-nocookie)?\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]+)/
    );
    return m ? m[1] : null;
  };

  const ytId = getYtId(url);
  const isYouTube = !!ytId;
  const thumbnailUrl = ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : null;

  const handleClick = () => {
    if (postId) router.push(`/hub/reels?id=${postId}`);
  };

  return (
    <div
      onClick={handleClick}
      style={{
        position: 'relative',
        cursor: 'pointer',
        aspectRatio: '16/9',
        maxHeight: 400,
        background: '#000',
        overflow: 'hidden',
        ...style,
      }}
    >
      {/* YouTube: show thumbnail image */}
      {isYouTube && !thumbError && (
        <img
          src={thumbnailUrl}
          alt="Video thumbnail"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          loading="lazy"
          onError={() => setThumbError(true)}
        />
      )}

      {/* Direct video file: show preloaded video frame */}
      {!isYouTube && (
        <video
          src={url}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          muted
          playsInline
          preload="metadata"
        />
      )}

      {/* YouTube fallback when thumbnail fails */}
      {isYouTube && thumbError && (
        <div
          style={{
            width: '100%',
            height: '100%',
            background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
          }}
        >
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="1.5"
          >
            <polygon points="23 7 16 12 23 17 23 7" />
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
          </svg>
          <span style={{ fontSize: 13, opacity: 0.7, marginTop: 8 }}>Video</span>
        </div>
      )}

      {/* Play button overlay */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: 'rgba(255, 255, 255, 0.9)',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
          transition: 'transform 0.15s',
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="#333">
          <polygon points="8,5 19,12 8,19" />
        </svg>
      </div>
    </div>
  );
}

// Post Card Component
function PostCard({
  post,
  author,
  isOwnProfile = false,
  onDelete,
  onPostEdited,
  currentUserId,
  currentUser,
  horseProfileIds = new Set(),
}) {
  const router = useRouter();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [currentReaction, setCurrentReaction] = useState(null);
  const [editablePost, setEditablePost] = useState(post);
  const [likeAnimating, setLikeAnimating] = useState(false);
  const [likeCount, setLikeCount] = useState(post.like_count || 0);
  const [commentCount, setCommentCount] = useState(post.comment_count || 0);
  const [shareCount, setShareCount] = useState(post.share_count || 0);
  const [hasShared, setHasShared] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [typists, setTypists] = useState({}); // { [userId]: { name, avatar_url, timestamp } }
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editCommentText, setEditCommentText] = useState('');

  // Render post content with @mentions and #hashtags
  function renderContent(text) {
    if (!text) return text;
    return React.createElement(HashtagRenderer, {
      text,
      onHashtagClick: (tag) => {
        // Future: navigate to hashtag search
        console.warn('[Hashtag] Clicked:', tag);
      },
    });
  }

  // 📡 Real-time sync for Likes & Comments (Broadcast from WebSocket)
  useEffect(() => {
    if (!post.id) return;
    const cleanupLike = eventBus.on('SOCIAL_LIKE_UPDATE', (payload) => {
      if (payload?.postId === post.id) {
        setLikeCount((prev) => Math.max(0, prev + payload.delta));
      }
    });
    const cleanupComment = eventBus.on('SOCIAL_COMMENT_UPDATE', (payload) => {
      if (payload?.postId === post.id) {
        setCommentCount((prev) => (payload?.removed ? Math.max(0, prev - 1) : prev + 1));
      }
    });
    const cleanupTyping = eventBus.on('SOCIAL_TYPING_UPDATE', (payload) => {
      if (payload?.postId === post.id) {
        setTypists((prev) => {
          const next = { ...prev };
          if (payload.isTyping) {
            next[payload.userId] = { name: payload.name, avatar: payload.avatar, ts: Date.now() };
          } else {
            delete next[payload.userId];
          }
          return next;
        });
      }
    });

    // Auto-clear stale typists after 10s fallback
    const typeInterval = setInterval(() => {
      setTypists((prev) => {
        const now = Date.now();
        let changed = false;
        const next = { ...prev };
        for (const uid in next) {
          if (now - next[uid].ts > 10000) {
            delete next[uid];
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 5000);

    return () => {
      if (cleanupLike) cleanupLike();
      if (cleanupComment) cleanupComment();
      if (cleanupTyping) cleanupTyping();
      clearInterval(typeInterval);
    };
  }, [post.id]);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [shareMsg, setShareMsg] = useState('');
  const isArticleOrLink = post.content_type === 'article' || post.content_type === 'link';

  // Check for existing reaction on mount → initialize currentReaction
  useEffect(() => {
    if (!currentUserId || !post.id) return;
    const token = getAccessToken();
    // Fetch ALL interactions (not just 'like') to detect any reaction type
    fetch('/api/social/interactions?post_id=' + post.id, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.json())
      .then((json) => {
        const reactionTypes = new Set(['like', 'love', 'haha', 'wow', 'sad', 'angry']);
        const myReaction = (json.interactions || []).find(
          (i) => i.user_id === currentUserId && reactionTypes.has(i.interaction_type)
        );
        if (myReaction) {
          setCurrentReaction(myReaction.interaction_type);
        }
      })
      .catch((e) => console.warn('[App] Handled promise rejection:', e?.message || e));
  }, [currentUserId, post.id]);

  const handleComment = async () => {
    setShowComments(!showComments);
    if (!showComments && comments.length === 0) {
      try {
        const token = getAccessToken();
        const res = await fetch('/api/social/interactions?post_id=' + post.id + '&type=comment', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const json = await res.json();
        setComments(json.comments || []);
      } catch (e) {
        console.warn('Load comments error:', e);
      }
    }
  };

  const submitComment = async () => {
    if (!commentText.trim() || !currentUserId) return;
    setSubmittingComment(true);
    try {
      const token = getAccessToken();
      const res = await fetch('/api/social/interactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          post_id: post.id,
          user_id: currentUserId,
          interaction_type: 'comment',
          content: commentText.trim(),
        }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const json = await res.json();
      if (json.comment) {
        setComments((prev) => [...prev, { ...json.comment, author: { username: 'You' } }]);
        setCommentCount((prev) => prev + 1);
        // Notify other views/tabs of new comment
        busEmit.socialCommentAdded(post.id, currentUserId);
      }
      setCommentText('');
    } catch (e) {
      console.warn('Submit comment error:', e);
      toast.error('Could not submit comment');
    }
    setSubmittingComment(false);
  };

  // Typing indicator animation component
  const TypingDot = ({ delay }) => (
    <span
      style={{
        display: 'inline-block',
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: C.textSec,
        margin: '0 2px',
        animation: `sp-bounce 1.4s infinite ease-in-out both`,
        animationDelay: delay,
      }}
    ></span>
  );

  const handleShareComplete = (platformId) => {
    if (currentUserId) {
      const token = getAccessToken();
      fetch('/api/social/interactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          post_id: post.id,
          user_id: currentUserId,
          interaction_type: 'share',
        }),
      }).catch((e) => console.warn('[App] Handled promise rejection:', e?.message || e));
      fetch('/api/social/share-count', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ post_id: post.id }),
      }).catch((e) => console.warn('[App] Handled promise rejection:', e?.message || e));
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onDelete(post.id);
    } catch (e) {
      console.warn('Delete failed:', e);
      toast.error('Could not delete post');
    }
    setDeleting(false);
    setShowDeleteConfirm(false);
  };

  return (
    <div
      style={{
        background: C.card,
        borderRadius: 12,
        marginBottom: 16,
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        position: 'relative',
      }}
    >
      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div
            style={{
              background: C.card,
              borderRadius: 12,
              padding: 24,
              maxWidth: 320,
              width: '100%',
              boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 12 }}>
              Delete Post?
            </div>
            <div style={{ fontSize: 14, color: C.textSec, marginBottom: 20 }}>
              This action cannot be undone. The post will be permanently removed.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  background: C.bg,
                  color: C.text,
                  border: 'none',
                  borderRadius: 20,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  background: '#F02849',
                  color: 'white',
                  border: 'none',
                  borderRadius: 20,
                  fontWeight: 600,
                  cursor: 'pointer',
                  opacity: deleting ? 0.6 : 1,
                }}
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <img
            src={author?.avatar_url || '/default-avatar.png'}
            alt="User avatar"
            width={40}
            height={40}
            style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }}
            loading="lazy"
            decoding="async"
          />
          {horseProfileIds.has(post.author_id) && isHorseOnlineNow(post.author_id) && (
            <span
              style={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                width: 10,
                height: 10,
                background: '#31a24c',
                border: '2px solid white',
                borderRadius: '50%',
              }}
            />
          )}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: C.text }}>
            {author?.username || author?.full_name}
          </div>
          <div style={{ fontSize: 12, color: C.textSec }}>
            {timeAgo(editablePost.created_at)}
            {editablePost.isEdited ||
            (editablePost.updated_at && editablePost.updated_at !== editablePost.created_at)
              ? ' · Edited'
              : ''}{' '}
            · 🌍
          </div>
        </div>
        {isOwnProfile && (
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={() => setShowEditModal(true)}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontSize: 16,
                color: C.textSec,
                padding: 8,
                borderRadius: 20,
              }}
              title="Edit Post"
            >
              ✏️
            </button>
            {onDelete && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 18,
                  color: C.textSec,
                  padding: 8,
                  borderRadius: 20,
                }}
                title="Delete Post"
              >
                🗑️
              </button>
            )}
          </div>
        )}
      </div>
      {editablePost.content && (
        <div style={{ padding: '0 12px 12px', fontSize: 15, color: C.text, lineHeight: 1.4 }}>
          {renderContent(editablePost.content)}
        </div>
      )}
      {isArticleOrLink ? (
        <ArticleCard
          url={
            post.link_url ||
            (() => {
              const match = post.content?.match(/https?:\/\/[^\s"'<>]+/);
              return match ? match[0] : null;
            })()
          }
          title={post.link_title}
          description={post.link_description}
          image={post.link_image || post.media_urls?.[0]}
          siteName={post.link_site_name}
          fallbackContent={post.content}
        />
      ) : (
        post.media_urls?.length > 0 && (
          <div>
            {post.media_urls.length === 1 ? (
              post.content_type === 'video' ? (
                <ProfileVideoCard url={post.media_urls[0]} postId={post.id} />
              ) : (
                <img
                  src={post.media_urls[0]}
                  alt=""
                  style={{
                    maxWidth: '100%',
                    display: 'block',
                    margin: '0 auto',
                    cursor: 'pointer',
                  }}
                  loading="lazy"
                  onClick={() => {
                    setLightboxIndex(0);
                    setLightboxOpen(true);
                  }}
                />
              )
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 2 }}>
                {post.media_urls.slice(0, 4).map((url, i) => (
                  <img
                    key={i}
                    src={url}
                    style={{
                      width: '100%',
                      aspectRatio: '1',
                      objectFit: 'cover',
                      cursor: 'pointer',
                    }}
                    alt="Image"
                    loading="lazy"
                    onClick={() => {
                      setLightboxIndex(i);
                      setLightboxOpen(true);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )
      )}
      <div
        style={{
          padding: '8px 12px',
          display: 'flex',
          justifyContent: 'space-between',
          color: C.textSec,
          fontSize: 13,
        }}
      >
        <span>
          {likeCount > 0 &&
            `${currentReaction ? { like: '👍', love: '❤️', haha: '😂', wow: '😮', sad: '😢', angry: '😡' }[currentReaction] || '👍' : '👍'} ${likeCount}`}
        </span>
        <span style={{ cursor: 'pointer', display: 'flex', gap: 12 }}>
          {commentCount > 0 && (
            <span
              onClick={handleComment}
            >{`${commentCount} ${commentCount === 1 ? 'comment' : 'comments'}`}</span>
          )}
          {shareCount > 0 && (
            <span>{`${shareCount} ${shareCount === 1 ? 'share' : 'shares'}`}</span>
          )}
          {shareMsg && <span>{shareMsg}</span>}
        </span>
      </div>
      <div style={{ borderTop: `1px solid ${C.border}`, display: 'flex' }}>
        <ReactionPicker
          currentReaction={currentReaction}
          onReact={(type) => {
            const wasReacted = currentReaction !== null;
            const isSameReaction = currentReaction === type;
            const prevReaction = currentReaction;

            if (isSameReaction) {
              // Toggle off — remove reaction
              setCurrentReaction(null);
              setLikeCount((prev) => Math.max(0, prev - 1));
            } else if (wasReacted) {
              // Switch reaction type — count stays the same
              setCurrentReaction(type);
            } else {
              // New reaction — add
              setCurrentReaction(type);
              setLikeCount((prev) => prev + 1);
            }

            setLikeAnimating(true);
            setTimeout(() => setLikeAnimating(false), 300);

            if (currentUserId) {
              const token = getAccessToken();
              fetch('/api/social/interactions', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                  post_id: post.id,
                  user_id: currentUserId,
                  interaction_type: type,
                }),
              })
                .then(() => {
                  // Only emit bus event when like_count actually changes:
                  // - toggle OFF (isSameReaction=true): count decreases → added=false
                  // - new ADD (!wasReacted): count increases → added=true
                  // - SWITCH (wasReacted && !isSameReaction): count unchanged → no emission
                  if (isSameReaction) {
                    busEmit.socialPostLiked(post.id, currentUserId, {
                      added: false,
                      reactionType: null,
                    });
                  } else if (!wasReacted) {
                    busEmit.socialPostLiked(post.id, currentUserId, {
                      added: true,
                      reactionType: type,
                    });
                  }
                  // Switch case: no bus emission needed — count doesn't change
                })
                .catch((e) => {
                  console.warn('[App] Handled promise rejection:', e?.message || e);
                });
            }
          }}
        />
        <button
          onClick={handleComment}
          style={{
            flex: 1,
            padding: 10,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            color: showComments ? C.blue : C.textSec,
            fontWeight: 500,
            fontSize: 13,
          }}
        >
          {' '}
          Comment
        </button>
        <button
          onClick={() => setShowShareModal(true)}
          style={{
            flex: 1,
            padding: 10,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            color: hasShared ? C.blue : C.textSec,
            fontWeight: 500,
            fontSize: 13,
          }}
        >
          ↗️ {hasShared ? 'Shared' : 'Share'}
        </button>
      </div>

      {/* Display Animated Typing Indicators (Phase 11) */}
      {Object.values(typists || {}).length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: 8,
            marginTop: 12,
            padding: '0 12px',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', position: 'relative', width: 24, height: 24 }}>
            {Object.values(typists || {})
              .slice(0, 3)
              .map((t, i) => (
                <img
                  key={i}
                  src={t.avatar || '/default-avatar.png'}
                  alt="typing"
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    objectFit: 'cover',
                    border: '2px solid white',
                    position: 'absolute',
                    left: i * 12,
                    zIndex: 3 - i,
                  }}
                />
              ))}
          </div>
          <div
            style={{
              background: C.bg,
              borderRadius: 16,
              padding: '8px 12px',
              fontSize: 12,
              color: C.textSec,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginLeft:
                Object.values(typists || {}).length > 2
                  ? 30
                  : (Object.values(typists || {}).length - 1) * 12,
            }}
          >
            <span>{Object.values(typists || {})[0].name.split(' ')[0]} is typing</span>
            <div style={{ display: 'flex' }}>
              <TypingDot delay="-0.32s" />
              <TypingDot delay="-0.16s" />
              <TypingDot delay="0s" />
            </div>
            <style>{`@keyframes sp-bounce { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }`}</style>
          </div>
        </div>
      )}

      {/* Comment Section */}
      {showComments && (
        <div style={{ borderTop: `1px solid ${C.border}`, padding: 12 }}>
          {comments.length > 0 && (
            <div style={{ marginBottom: 12, maxHeight: 300, overflowY: 'auto' }}>
              {comments.map((c, i) => (
                <div key={c.id || i} style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <img
                    src={c.author?.avatar_url || '/default-avatar.png'}
                    style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }}
                    alt="User avatar"
                    loading="lazy"
                  />
                  <div style={{ flex: 1, background: C.bg, borderRadius: 12, padding: '8px 12px' }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
                        {c.author?.username || c.author?.full_name || 'User'}
                      </div>
                      {c.author_id === currentUserId && editingCommentId !== c.id && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            onClick={() => {
                              setEditingCommentId(c.id);
                              setEditCommentText(c.content || '');
                            }}
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              color: C.textSec,
                              fontSize: 11,
                              padding: 0,
                            }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={async () => {
                              if (!confirm('Delete this comment?')) return;
                              try {
                                const { error } = await supabase
                                  .from('social_comments')
                                  .delete()
                                  .eq('id', c.id)
                                  .eq('author_id', currentUserId);
                                if (error) throw error;
                                setComments((prev) => prev.filter((cm) => cm.id !== c.id));
                                setCommentCount((prev) => Math.max(0, prev - 1));
                                busEmit.socialCommentAdded(post.id, currentUserId, {
                                  removed: true,
                                });
                                try {
                                  await supabase.rpc('decrement_post_count', {
                                    p_post_id: post.id,
                                    p_field: 'comment_count',
                                  });
                                } catch (e) {
                                  console.warn('[App] Handled exception:', e);
                                }
                                toast.success('Comment deleted');
                              } catch (e) {
                                console.warn('Delete comment error:', e);
                                toast.error('Could not delete comment');
                              }
                            }}
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              color: '#F02849',
                              fontSize: 11,
                              padding: 0,
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                    {editingCommentId === c.id ? (
                      <div style={{ marginTop: 4 }}>
                        <textarea
                          value={editCommentText}
                          onChange={(e) => setEditCommentText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') setEditingCommentId(null);
                          }}
                          autoFocus
                          style={{
                            width: '100%',
                            border: `1px solid ${C.border}`,
                            borderRadius: 8,
                            padding: '6px 10px',
                            fontSize: 14,
                            outline: 'none',
                            resize: 'vertical',
                            minHeight: 40,
                            fontFamily: 'inherit',
                            boxSizing: 'border-box',
                          }}
                        />
                        <div
                          style={{
                            display: 'flex',
                            gap: 8,
                            marginTop: 6,
                            justifyContent: 'flex-end',
                          }}
                        >
                          <button
                            onClick={() => setEditingCommentId(null)}
                            style={{
                              padding: '4px 12px',
                              borderRadius: 20,
                              border: `1px solid ${C.border}`,
                              background: 'transparent',
                              color: C.textSec,
                              cursor: 'pointer',
                              fontSize: 12,
                              fontWeight: 500,
                            }}
                          >
                            Cancel
                          </button>
                          <button
                            onClick={async () => {
                              if (!editCommentText.trim()) return;
                              try {
                                const { error } = await supabase
                                  .from('social_comments')
                                  .update({ content: editCommentText.trim() })
                                  .eq('id', c.id)
                                  .eq('author_id', currentUserId);
                                if (error) throw error;
                                setComments((prev) =>
                                  prev.map((cm) =>
                                    cm.id === c.id ? { ...cm, content: editCommentText.trim() } : cm
                                  )
                                );
                                setEditingCommentId(null);
                                busEmit.dataMutated?.('social_comments');
                                toast.success('Comment updated');
                              } catch (e) {
                                console.warn('Edit comment error:', e);
                                toast.error('Could not update comment');
                              }
                            }}
                            disabled={!editCommentText.trim()}
                            style={{
                              padding: '4px 12px',
                              borderRadius: 20,
                              border: 'none',
                              background: C.blue,
                              color: 'white',
                              cursor: 'pointer',
                              fontSize: 12,
                              fontWeight: 600,
                              opacity: editCommentText.trim() ? 1 : 0.5,
                            }}
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div style={{ fontSize: 14, color: C.text, marginTop: 2 }}>
                          {renderContent(c.content)}
                        </div>
                        <div style={{ fontSize: 11, color: C.textSec, marginTop: 4 }}>
                          {timeAgo(c.created_at)}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {comments.length === 0 && (
            <div style={{ textAlign: 'center', padding: 16, color: C.textSec, fontSize: 13 }}>
              No Comments Yet. Be The First!
            </div>
          )}
          {currentUserId && (
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    submitComment();
                  }
                }}
                placeholder="Write A Comment..."
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  background: C.bg,
                  border: 'none',
                  borderRadius: 20,
                  fontSize: 14,
                  outline: 'none',
                  color: C.text,
                }}
              />
              <button
                onClick={submitComment}
                disabled={!commentText.trim() || submittingComment}
                style={{
                  padding: '8px 16px',
                  background: C.blue,
                  color: 'white',
                  border: 'none',
                  borderRadius: 20,
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: commentText.trim() ? 'pointer' : 'not-allowed',
                  opacity: commentText.trim() ? 1 : 0.5,
                }}
              >
                {submittingComment ? '...' : 'Post'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Edit Post Modal */}
      {showEditModal && (
        <EditPostModal
          post={editablePost}
          supabase={supabase}
          onClose={() => setShowEditModal(false)}
          onSaved={(updatedPost) => {
            setEditablePost(updatedPost);
            onPostEdited?.(updatedPost);
          }}
        />
      )}

      {/* Share Post Modal */}
      {showShareModal && (
        <SharePostModal
          post={{ ...editablePost, shareCount }}
          authorUsername={author?.username}
          currentUser={currentUser || (currentUserId ? { id: currentUserId } : null)}
          onClose={() => setShowShareModal(false)}
          onShared={(platform) => {
            setShareCount((s) => s + 1);
            setHasShared(true);
            handleShareComplete(platform);
          }}
        />
      )}

      {/* Post Image Lightbox */}
      {lightboxOpen && post.media_urls?.length > 0 && (
        <PostImageLightbox
          mediaUrls={post.media_urls}
          initialIndex={lightboxIndex}
          contentType={post.content_type}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </div>
  );
}

export default function UserProfilePage() {
  const router = useRouter();
  useTrainingBus('user-profile');
  const { username } = router.query;

  // Core state
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(() => {
    // Synchronous init so isOwnProfile resolves even with SWR cache hydration
    if (typeof window === 'undefined') return null;
    try {
      return getAuthUser();
    } catch (_) {
      return null;
    }
  });
  const [isFriend, setIsFriend] = useState(false);
  const [friendRequestSent, setFriendRequestSent] = useState(false);
  const [showUnfriendConfirm, setShowUnfriendConfirm] = useState(false);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);
  const [showReportInput, setShowReportInput] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  // Stats and content
  const [stats, setStats] = useState({ friends: 0, following: 0, followers: 0, posts: 0 });
  const [friends, setFriends] = useState([]);
  const [currentUserFriends, setCurrentUserFriends] = useState([]);
  const [posts, setPosts] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [videos, setVideos] = useState([]);
  const [reels, setReels] = useState([]);
  const [pastLives, setPastLives] = useState([]);
  const [isPosting, setIsPosting] = useState(false);
  const [horseProfileIds, setHorseProfileIds] = useState(new Set());
  const [postContent, setPostContent] = useState('');
  const [showPostComposer, setShowPostComposer] = useState(false);
  const [coverLoaded, setCoverLoaded] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const shareCopiedTimer = useRef(null);
  const [bioExpanded, setBioExpanded] = useState(false);
  const [animatedStats, setAnimatedStats] = useState({
    friends: 0,
    following: 0,
    followers: 0,
    posts: 0,
  });
  const [statsAnimated, setStatsAnimated] = useState(false);
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const pullStartY = useRef(null);
  const [showFriendsModal, setShowFriendsModal] = useState(false);

  // Poker Activity state
  const [pokerCheckins, setPokerCheckins] = useState([]);
  const [pokerFollowing, setPokerFollowing] = useState([]);
  const [checkinStreak, setCheckinStreak] = useState({
    currentStreak: 0,
    longestStreak: 0,
    totalCheckins: 0,
  });
  const [shareStreak, setShareStreak] = useState({ streak_days: 0, is_active: false });
  const [streakBreakAlert, setStreakBreakAlert] = useState(false);
  const [checkinBadges, setCheckinBadges] = useState([]);
  const [checkinStats, setCheckinStats] = useState(null);
  const [checkinHeatmap, setCheckinHeatmap] = useState(null);

  // Refs
  const profileMenuRef = useRef(null);
  const loadedUsernameRef = useRef(null);
  const socialIdRef = useRef(null); // Resolved horse social identity (may differ from profile.id)

  // Tab state — persisted
  const [activeTab, setActiveTab] = usePersistedState('sp-filters-user-profile', 'all');
  const [articleReader, setArticleReader] = useState({ open: false, url: '', title: '' });
  const [lightboxUrl, setLightboxUrl] = useState(null);

  // Profile menu state
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [profileMenuMsg, setProfileMenuMsg] = useState('');

  // Profile completion decline/dismiss state — persisted in localStorage per-user
  const [declinedFields, setDeclinedFields] = useState(() => {
    if (typeof window === 'undefined') return [];
    try {
      return JSON.parse(
        localStorage.getItem(`sp-profile-completion-declined-${currentUser?.id}`) || '[]'
      );
    } catch {
      return [];
    }
  });
  const [completionDismissed, setCompletionDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem(`sp-profile-completion-dismissed-${currentUser?.id}`) === 'true';
    } catch {
      return false;
    }
  });

  const handleDeclineField = (label) => {
    const updated = [...declinedFields, label];
    setDeclinedFields(updated);
    try {
      localStorage.setItem(
        `sp-profile-completion-declined-${currentUser?.id}`,
        JSON.stringify(updated)
      );
    } catch (e) {
      console.warn('[App] Handled exception:', e);
    }
  };

  const handleDismissCompletion = () => {
    setCompletionDismissed(true);
    try {
      localStorage.setItem(`sp-profile-completion-dismissed-${currentUser?.id}`, 'true');
    } catch (e) {
      console.warn('[App] Handled exception:', e);
    }
  };

  // ── BULLETPROOF AUTH: Listen for late session resolution ──
  // If getAuthUser() returns null on initial render (token not yet in localStorage),
  // this listener catches the session when Supabase SDK finishes initializing
  useEffect(() => {
    if (currentUser) return; // Already have user, no need to listen
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user && !currentUser) {
        setCurrentUser(session.user);
      }
    });
    return () => subscription?.unsubscribe();
  }, [currentUser]);

  // ── Animated Stat Counters: count-up from 0 when stats load ──
  useEffect(() => {
    const target = stats;
    const hasData =
      target.friends > 0 || target.followers > 0 || target.following > 0 || target.posts > 0;
    if (!hasData) {
      setAnimatedStats(target);
      return;
    }
    // Always animate from 0 → target to avoid stale closure bugs
    const duration = 600; // ms
    const steps = 30;
    const interval = duration / steps;
    let step = 0;
    const timer = setInterval(() => {
      step++;
      const progress = Math.min(step / steps, 1);
      // Ease-out cubic
      const ease = 1 - Math.pow(1 - progress, 3);
      setAnimatedStats({
        friends: Math.round(target.friends * ease),
        following: Math.round(target.following * ease),
        followers: Math.round(target.followers * ease),
        posts: Math.round(target.posts * ease),
      });
      if (step >= steps) clearInterval(timer);
    }, interval);
    return () => clearInterval(timer);
  }, [stats]);

  // ── Pull-to-Refresh: mobile gesture handler ──
  useEffect(() => {
    const handleTouchStart = (e) => {
      if (window.scrollY === 0) pullStartY.current = e.touches[0].clientY;
    };
    const handleTouchMove = (e) => {
      if (pullStartY.current === null) return;
      const dy = e.touches[0].clientY - pullStartY.current;
      if (dy > 80 && window.scrollY === 0 && !pullRefreshing) {
        setPullRefreshing(true);
        pullStartY.current = null;
      }
    };
    const handleTouchEnd = () => {
      pullStartY.current = null;
    };
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [pullRefreshing]);

  // ── Pull-to-Refresh: trigger reload ──
  useEffect(() => {
    if (!pullRefreshing || !username) return;
    // Invalidate cache and re-fetch
    try {
      localStorage.removeItem(`sp-profile-cache-${username}`);
    } catch (_) {
      console.warn('[App] Handled exception:', _?.message || _);
    }
    setStatsAnimated(false);
    router.replace(router.asPath).finally(() => setPullRefreshing(false));
  }, [pullRefreshing, username]);

  // Cross-tab avatar/cache sync — re-fetch when profile is edited in another tab
  useEffect(() => {
    if (!username) return;
    const cleanupAvatar = listenBroadcast('smarter_poker_avatar_sync', (msg) => {
      // Self-tab suppression: skip if this tab triggered the avatar change
      if (msg?.tabId === BROADCAST_TAB_ID) return;
      // Avatar changed in another tab — refresh profile to get new avatar
      supabase
        .from('profiles')
        .select('avatar_url, full_name, bio, username')
        .ilike('username', username)
        .maybeSingle()
        .then(({ data }) => {
          if (data) setProfile((prev) => (prev ? { ...prev, ...data } : prev));
        });
    });

    // Cross-tab social sync — refresh posts when another tab creates/deletes a post
    const cleanupSocial = listenBroadcast('smarter_poker_social_sync', (msg) => {
      if (msg?.tabId === BROADCAST_TAB_ID) return;
      if (!profile?.id) return;
      const sid = socialIdRef.current || profile.id;
      // Re-fetch post count
      supabase
        .from('social_posts')
        .select('*', { count: 'exact', head: true })
        .eq('author_id', sid)
        .then(({ count }) => {
          if (count != null) setStats((prev) => ({ ...prev, posts: count }));
        });
      // BUG FIX (2026-05-11 audit P1): prune local state when a sibling tab
      // signals a specific deletion. Before this, deleting a live / reel /
      // post in Tab 1 left the corresponding tile rendered in Tab 2 until
      // manual refresh — the listener only re-fetched the post count.
      if (msg?.deletedLiveId) {
        setPastLives((prev) => prev.filter((l) => l.id !== msg.deletedLiveId));
      }
      if (msg?.deletedReelId) {
        setReels((prev) => prev.filter((r) => r.id !== msg.deletedReelId));
      }
      if (msg?.deletedPostId) {
        setPosts((prev) => prev.filter((p) => p.id !== msg.deletedPostId));
        setPhotos((prev) => prev.filter((p) => p.id !== msg.deletedPostId));
        setVideos((prev) => prev.filter((p) => p.id !== msg.deletedPostId));
      }
    });

    // Cross-tab friends sync — refresh friend count/status when another tab changes friendships
    const cleanupFriends = listenBroadcast('smarter_poker_friends_sync', (msg) => {
      if (msg?.tabId === BROADCAST_TAB_ID) return;
      if (!profile?.id) return;
      const uid = currentUser?.id;
      const sid = socialIdRef.current || profile.id;
      const pid = profile.id; // Always include profile.id (socialId may differ - BUG-6 FIX)
      // Two-direction queries (matches Friends API pattern) — refresh count AND button state
      Promise.all([
        supabase
          .from('friendships')
          .select('friend_id')
          .eq('user_id', sid)
          .eq('status', 'accepted'),
        supabase
          .from('friendships')
          .select('user_id')
          .eq('friend_id', sid)
          .eq('status', 'accepted'),
        ...(uid
          ? [
              // BUG-6 FIX: check both socialId and profile.id so friendship detection is symmetric
              supabase
                .from('friendships')
                .select('status')
                .eq('user_id', uid)
                .or(`friend_id.eq.${sid}${pid !== sid ? `,friend_id.eq.${pid}` : ''}`),
              supabase
                .from('friendships')
                .select('status')
                .or(`user_id.eq.${sid}${pid !== sid ? `,user_id.eq.${pid}` : ''}`)
                .eq('friend_id', uid),
            ]
          : []),
      ])
        .then(([sentRes, receivedRes, f1, f2]) => {
          const friendSet = new Set();
          (sentRes.data || []).forEach((r) => friendSet.add(r.friend_id));
          (receivedRes.data || []).forEach((r) => friendSet.add(r.user_id));
          setStats((prev) => ({ ...prev, friends: friendSet.size }));
          // Also sync button state if logged in
          if (uid) {
            const allF = [...(f1?.data || []), ...(f2?.data || [])];
            if (allF.some((f) => f.status === 'accepted')) {
              setIsFriend(true);
              setFriendRequestSent(false);
            } else if (allF.some((f) => f.status === 'pending')) {
              setIsFriend(false);
              setFriendRequestSent(true);
            } else {
              setIsFriend(false);
              setFriendRequestSent(false);
            }
          }
        })
        .catch((e) => console.warn('[ProfilePage] Cross-tab friend sync error:', e));
    });

    // Same-tab profile-updated — invalidate SWR cache so fresh data is fetched
    const handleProfileUpdated = () => {
      try {
        localStorage.removeItem(`sp-profile-cache-${username}`);
      } catch (_) {
        console.warn('[App] Handled exception:', _?.message || _);
      }
      // Re-fetch profile from Supabase (using safe column list — phone
      // and email are blocked at the column-grant layer for non-self reads)
      supabase
        .from('profiles')
        .select(SAFE_PROFILE_COLUMNS)
        .ilike('username', username)
        .maybeSingle()
        .then(({ data }) => {
          if (data) setProfile(data);
        });
    };
    window.addEventListener('profile-updated', handleProfileUpdated);

    return () => {
      cleanupAvatar();
      cleanupSocial();
      cleanupFriends();
      window.removeEventListener('profile-updated', handleProfileUpdated);
    };
  }, [username, profile?.id]);

  // 📡 Supabase Realtime: Typing broadcast channel for profile page
  // NOTE: Likes & Comments listeners are on the `user-profile:{id}` channel
  // (see the useEffect below with profile?.id dep) to avoid double-counting.
  useEffect(() => {
    // Channel matching the backend 'social-feed' for broadcast typing events
    const typingChannel = supabase
      .channel(`social-feed-${Date.now()}`)
      .on('broadcast', { event: 'typing' }, (payload) => {
        const p = payload?.payload;
        if (p) {
          eventBus.emit(
            'SOCIAL_TYPING_UPDATE',
            {
              postId: p.post_id,
              userId: p.user_id,
              name: p.name,
              avatar: p.avatar_url || null,
              isTyping: p.isTyping,
            },
            'ProfileRealtime'
          );
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(typingChannel);
    };
  }, []);

  // Phase 15: Load horse profile IDs for online presence
  useEffect(() => {
    supabase
      .from('content_authors')
      .select('profile_id')
      .eq('is_active', true)
      .not('profile_id', 'is', null)
      .then(({ data }) => {
        if (data) setHorseProfileIds(new Set(data.map((h) => h.profile_id)));
      });
  }, []);

  useEffect(() => {
    if (!username) return;
    // Reset visual state when navigating between profiles
    clearTimeout(shareCopiedTimer.current);
    setCoverLoaded(false);
    setShareCopied(false);
    setBioExpanded(false);
    setStatsAnimated(false);
    setAnimatedStats({ friends: 0, following: 0, followers: 0, posts: 0 });
    socialIdRef.current = null; // Reset horse social identity for new profile

    // Only show loading skeleton if we're loading a DIFFERENT profile.
    // If same profile is already loaded (e.g. back-navigation), keep it visible
    // during background revalidation to prevent the completion indicator from flashing.
    if (loadedUsernameRef.current !== username) {
      setProfile(null);
      setLoading(true);
    }

    // --- PHASE 1: SWR CACHE HYDRATION (Instant Render) ---
    const CACHE_KEY = `sp-profile-cache-${username}`;
    const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours (SWR revalidates in background anyway)
    try {
      const cachedData = localStorage.getItem(CACHE_KEY);
      if (cachedData) {
        const parsed = JSON.parse(cachedData);
        // Only hydrate if cache is still fresh
        if (parsed._cachedAt && Date.now() - parsed._cachedAt < CACHE_TTL_MS) {
          if (parsed.profile) setProfile(parsed.profile);
          if (parsed.stats) setStats(parsed.stats);
          if (parsed.friends) setFriends(parsed.friends);
          if (parsed.posts) setPosts(parsed.posts);
          if (parsed.photos) setPhotos(parsed.photos);
          if (parsed.videos) setVideos(parsed.videos);
          if (parsed.reels) setReels(parsed.reels);
          setLoading(false); // Zero-delay render achieved!
        } else {
          // Expired cache — remove it
          localStorage.removeItem(CACHE_KEY);
        }
      }
    } catch (e) {
      console.warn('SWR Cache Hydration error:', e);
    }

    // --- PHASE 2: BACKGROUND STALE-WHILE-REVALIDATE FETCH ---
    const fetchProfile = async () => {
      // Track variables in outer scope for cache save
      let finalFriends = [];
      let finalPhotos = [];
      let finalStats = { friends: 0, following: 0, followers: 0, posts: 0 };

      try {
        // Get current user
        const user = getAuthUser();
        if (user) setCurrentUser(user);

        // Fetch the profile by username
        // BUG FIX (USER-LOOKUP-1): select('*') triggers a 403 from PostgREST because
        // phone + email columns have column-level REVOKE for non-service-role callers
        // (see src/lib/profileColumns.js header). The 403 is caught as `error`, the
        // null-data branch fires, and the user sees 'User Not Found' even when the
        // profile exists in the DB. Use SAFE_PROFILE_COLUMNS (already imported at L15)
        // which lists every public column except phone/email.
        const { data, error } = await supabase
          .from('profiles')
          .select(SAFE_PROFILE_COLUMNS)
          .ilike('username', username)
          .maybeSingle();

        if (error || !data) {
          setProfile(null);
          setLoading(false);
          return;
        }

        setProfile(data);
        loadedUsernameRef.current = username;

        // ═══════════════════════════════════════════════════════════
        // HORSE SOCIAL IDENTITY RESOLUTION
        // ═══════════════════════════════════════════════════════════
        // Horses have TWO profiles: a "real name" profile (e.g. daphne.winterfield)
        // and an "alias" profile (e.g. Prairiegal) stored in content_authors.profile_id.
        // Posts, friendships, and follows are all tied to the alias profile_id.
        // We need to detect this and use the correct ID for social queries.
        let socialId = data.id; // Default: use the loaded profile's ID
        try {
          // Check 1: Is this profile directly referenced by content_authors?
          const { data: caDirectMatch } = await supabase
            .from('content_authors')
            .select('profile_id')
            .eq('profile_id', data.id)
            .eq('is_active', true)
            .limit(1)
            .maybeSingle();

          if (!caDirectMatch) {
            // Check 2: Does content_authors have a horse whose full_name matches this profile?
            // This catches the case where the user navigates to the "real name" profile
            // but the horse's social data lives under a different profile_id (the alias profile).
            const profileName = data.full_name || data.username || '';
            if (profileName) {
              const { data: caNameMatch } = await supabase
                .from('content_authors')
                .select('profile_id')
                .eq('is_active', true)
                .not('profile_id', 'is', null)
                .ilike('name', profileName)
                .limit(1)
                .maybeSingle();

              if (caNameMatch && caNameMatch.profile_id && caNameMatch.profile_id !== data.id) {
                socialId = caNameMatch.profile_id;
              }
            }
          }
        } catch (e) {
          // Non-fatal: fall back to data.id
          console.warn('[Profile] Horse social ID resolution failed:', e?.message || e);
        }
        // CRITICAL: Always sync ref AFTER resolution so realtime listeners
        // (which depend on profile.id) read the correct social ID.
        socialIdRef.current = socialId;

        // ═══════════════════════════════════════════════════════════
        // PARALLEL BATCH 1: Friendship + Stats (all independent)
        // ═══════════════════════════════════════════════════════════
        const batch1Promises = [
          // FRIEND COUNT: Two-direction queries (matches Friends API pattern exactly)
          // Query 1: friendships where profile is the sender
          supabase
            .from('friendships')
            .select('friend_id', { count: 'exact' })
            .eq('user_id', socialId)
            .eq('status', 'accepted')
            .limit(20),
          // Query 2: friendships where profile is the receiver
          supabase
            .from('friendships')
            .select('user_id', { count: 'exact' })
            .eq('friend_id', socialId)
            .eq('status', 'accepted')
            .limit(20),
          supabase
            .from('social_follows')
            .select('*', { count: 'exact', head: true })
            .eq('follower_id', socialId),
          supabase
            .from('social_follows')
            .select('*', { count: 'exact', head: true })
            .eq('following_id', socialId),
          supabase
            .from('social_posts')
            .select('*', { count: 'exact', head: true })
            .eq('author_id', socialId),
        ];

        // Friendship status checks (only if logged in)
        // BUG-6 FIX: Check BOTH socialId (horse identity) AND profile.id to catch
        // cases where friendship rows were stored using one or the other identifier.
        if (user) {
          const profileId = data?.id || '';
          batch1Promises.push(
            // Direction 1: current user sent to target
            supabase
              .from('friendships')
              .select('status')
              .eq('user_id', user.id)
              .or(`friend_id.eq.${socialId}${profileId !== socialId ? `,friend_id.eq.${profileId}` : ''}`),
            // Direction 2: target sent to current user
            supabase
              .from('friendships')
              .select('status')
              .or(`user_id.eq.${socialId}${profileId !== socialId ? `,user_id.eq.${profileId}` : ''}`)
              .eq('friend_id', user.id),
            // Current user's friend IDs (two-direction)
            supabase
              .from('friendships')
              .select('friend_id')
              .eq('user_id', user.id)
              .eq('status', 'accepted'),
            supabase
              .from('friendships')
              .select('user_id')
              .eq('friend_id', user.id)
              .eq('status', 'accepted'),
            // Follow check
            supabase
              .from('social_follows')
              .select('id')
              .eq('follower_id', user.id)
              .eq('following_id', socialId)
              .maybeSingle()
          );
        }

        const batch1Results = await Promise.all(batch1Promises);

        const [
          sentFriendsRes,
          receivedFriendsRes,
          followingRes,
          followersRes,
          postsRes,
          ...authResults
        ] = batch1Results;

        // Union both directions into a deduplicated Set (for the friends grid)
        const uniqueFriendIds = new Set();
        (sentFriendsRes.data || []).forEach((r) => uniqueFriendIds.add(r.friend_id));
        (receivedFriendsRes.data || []).forEach((r) => uniqueFriendIds.add(r.user_id));

        // Sum the exact counts
        finalStats = {
          friends: (sentFriendsRes.count || 0) + (receivedFriendsRes.count || 0),
          following: followingRes.count || 0,
          followers: followersRes.count || 0,
          posts: postsRes.count || 0,
        };
        setStats(finalStats);

        // Process friendship status
        let myFriendIds = [];
        if (user && authResults.length >= 5) {
          const f1 = authResults[0];
          const f2 = authResults[1];
          const mySentFriendsRes = authResults[2];
          const myReceivedFriendsRes = authResults[3];
          const followRes = authResults[4];

          const allFriendships = [...(f1.data || []), ...(f2.data || [])];
          if (allFriendships.some((f) => f.status === 'accepted')) {
            setIsFriend(true);
            setFriendRequestSent(false);
          } else if (allFriendships.some((f) => f.status === 'pending')) {
            setIsFriend(false);
            setFriendRequestSent(true);
          } else {
            setIsFriend(false);
            setFriendRequestSent(false);
          }

          // Union both directions for current user's friend list
          const myFriendSet = new Set();
          (mySentFriendsRes.data || []).forEach((r) => myFriendSet.add(r.friend_id));
          (myReceivedFriendsRes.data || []).forEach((r) => myFriendSet.add(r.user_id));
          myFriendIds = [...myFriendSet];
          setCurrentUserFriends(myFriendIds);

          // Set follow status
          if (followRes?.data) {
            setIsFollowing(true);
          }
        }

        // Process friend profiles (use the already-computed uniqueFriendIds Set)
        const allFriendIdArray = [...uniqueFriendIds];
        if (allFriendIdArray.length > 0) {
          const friendIds = allFriendIdArray.slice(0, 20); // Limit to 20 for display
          const { data: friendProfiles } = await supabase
            .from('profiles')
            .select('id, username, full_name, avatar_url')
            .in('id', friendIds);

          if (friendProfiles) {
            // REAL per-friend mutual counts: for each friend X, count |X's friends ∩ my friends|
            const myFriendSet = new Set(myFriendIds);
            const friendFriendSets = new Map();
            if (myFriendIds.length > 0 && friendIds.length > 0) {
              // Batch-fetch all friendships involving displayed friends
              const [ffSent, ffRecv] = await Promise.all([
                supabase
                  .from('friendships')
                  .select('user_id, friend_id')
                  .in('user_id', friendIds)
                  .eq('status', 'accepted'),
                supabase
                  .from('friendships')
                  .select('user_id, friend_id')
                  .in('friend_id', friendIds)
                  .eq('status', 'accepted'),
              ]);
              for (const fid of friendIds) friendFriendSets.set(fid, new Set());
              for (const row of [...(ffSent.data || []), ...(ffRecv.data || [])]) {
                if (friendFriendSets.has(row.user_id))
                  friendFriendSets.get(row.user_id).add(row.friend_id);
                if (friendFriendSets.has(row.friend_id))
                  friendFriendSets.get(row.friend_id).add(row.user_id);
              }
            }
            const friendsWithMutual = friendProfiles.map((friend) => {
              let mutualCount = 0;
              if (friendFriendSets.has(friend.id)) {
                const theirFriends = friendFriendSets.get(friend.id);
                mutualCount = [...theirFriends].filter(
                  (id) => myFriendSet.has(id) && id !== user?.id
                ).length;
              }
              return { ...friend, mutualCount };
            });
            friendsWithMutual.sort((a, b) => b.mutualCount - a.mutualCount);
            setFriends(friendsWithMutual);
            finalFriends = friendsWithMutual;
          }
        }

        // ═══════════════════════════════════════════════════════════
        // PARALLEL BATCH 2: Content (posts, photos, videos, reels, poker activity) — all independent
        // ═══════════════════════════════════════════════════════════
        const contentPromises = [
          // Posts (use socialId for horse-aware lookup)
          supabase
            .from('social_posts')
            .select('*')
            .eq('author_id', socialId)
            .order('created_at', { ascending: false })
            .limit(20),
          // Photos (posts with media)
          supabase
            .from('social_posts')
            .select('id, media_urls, content, created_at, content_type')
            .eq('author_id', socialId)
            .not('media_urls', 'is', null)
            .order('created_at', { ascending: false })
            .limit(50),
          // Videos
          supabase
            .from('social_posts')
            .select('id, media_urls, content, created_at, content_type')
            .eq('author_id', socialId)
            .eq('content_type', 'video')
            .not('media_urls', 'is', null)
            .order('created_at', { ascending: false })
            .limit(30),
          // Reels
          supabase
            .from('social_reels')
            .select('id, video_url, caption, thumbnail_url, view_count, created_at')
            .eq('author_id', socialId)
            .order('created_at', { ascending: false })
            .limit(30),
          // Past Lives (posted recordings only)
          // BUG FIX (2026-05-11 audit): added feed_post_id so handleDeleteLive can
          // explicitly clean up the linked "X went live" social_posts entry on delete.
          // The live_streams.feed_post_id → social_posts.id FK is ON DELETE SET NULL
          // (not CASCADE), so without this id in scope the defense-in-depth cleanup
          // was a silent no-op — the past-live tile would disappear but the social
          // post would linger pointing at a now-deleted stream.
          supabase
            .from('live_streams')
            .select('id, title, video_url, thumbnail_url, viewer_count, created_at, feed_post_id, social_posts:feed_post_id(thumbnail_url, media_urls)')
            .eq('broadcaster_id', socialId)
            .eq('status', 'ended')
            .eq('is_posted', true)
            .not('video_url', 'is', null)
            .order('created_at', { ascending: false })
            .limit(20),
        ];

        const [postsData, photosData, videosData, reelsData, livesData] =
          await Promise.all(contentPromises);

        const userPosts = postsData.data || [];
        setPosts(userPosts);

        // Filter photos to image-only (exclude all video posts)
        const photoList = (photosData.data || []).filter((p) => {
          // Exclude anything explicitly marked as video
          if (p.content_type === 'video') return false;
          // Images are explicitly marked or have image-like URLs
          if (p.content_type === 'image') return true;
          // Fallback: check if URLs look like images (not YouTube/video files)
          return (
            p.media_urls &&
            p.media_urls.some(
              (url) =>
                url &&
                !url.includes('youtube.com') &&
                !url.includes('youtu.be') &&
                !url.match(/\.(mp4|webm|mov|avi)(\?|$)/i) &&
                (url.includes('.jpg') ||
                  url.includes('.jpeg') ||
                  url.includes('.png') ||
                  url.includes('.gif') ||
                  url.includes('.webp') ||
                  url.includes('/image'))
            )
          );
        });
        setPhotos(photoList);
        finalPhotos = photoList;

        const userVideos = videosData.data || [];
        setVideos(userVideos);

        const userReels = reelsData.data || [];
        setReels(userReels);

        const userLives = livesData?.data || [];
        setPastLives(userLives);

        // Fetch poker activity (fire-and-forget, non-blocking)
        let anonUid = null;
        try {
          anonUid = localStorage.getItem('sp-anon-uid');
        } catch (ex) {
          console.warn('[App] Handled exception:', ex?.message || ex);
        }
        const pokerUid = data.id || anonUid;
        if (pokerUid) {
          const token = getAccessToken();
          const headers = token ? { Authorization: `Bearer ${token}` } : {};
          fetch('/api/poker/checkins?user_id=' + encodeURIComponent(pokerUid), { headers })
            .then(function (r) {
              return r.json();
            })
            .then(function (j) {
              if (j.success) setPokerCheckins(j.checkins || j.data || []);
            })
            .catch((e) => console.warn('[App] Handled promise rejection:', e?.message || e));
          fetch('/api/poker/follow?user_id=' + encodeURIComponent(pokerUid), { headers })
            .then(function (r) {
              return r.json();
            })
            .then(function (j) {
              if (j.success) setPokerFollowing(j.data || []);
            })
            .catch((e) => console.warn('[App] Handled promise rejection:', e?.message || e));
          // Fetch check-in streak data
          fetch('/api/poker/checkins/streak?user_id=' + encodeURIComponent(pokerUid), { headers })
            .then(function (r) {
              return r.json();
            })
            .then(function (j) {
              if (j.success)
                setCheckinStreak({
                  currentStreak: j.currentStreak || 0,
                  longestStreak: j.longestStreak || 0,
                  totalCheckins: j.totalCheckins || 0,
                });
            })
            .catch((e) => console.warn('[App] Handled promise rejection:', e?.message || e));
          // Fetch share streak data from share_streaks view
          supabase
            .from('share_streaks')
            .select('streak_days, is_active, streak_end')
            .eq('user_id', pokerUid)
            .eq('is_active', true)
            .order('streak_days', { ascending: false })
            .limit(1)
            .maybeSingle()
            .then(({ data: ss }) => {
              if (ss) {
                setShareStreak({ streak_days: ss.streak_days || 0, is_active: ss.is_active });
              } else if (user?.id && user.id === data.id) {
                // Streak is NOT active — check if user had a multiplier that just reset
                // Only show the notification once per session to avoid spam
                const notifKey = `sp-streak-break-notif-${pokerUid}`;
                const alreadyShown = sessionStorage.getItem(notifKey);
                if (!alreadyShown) {
                  supabase
                    .from('profiles')
                    .select('diamond_multiplier')
                    .eq('id', pokerUid)
                    .maybeSingle()
                    .then(({ data: prof }) => {
                      // If multiplier > 1.0 it hasn't been reset yet by the nightly job
                      // Show the warning so the user knows to share today to re-activate
                      if (prof?.diamond_multiplier && prof.diamond_multiplier > 1.0) {
                        // The reset function will clean this up on next share
                        setStreakBreakAlert(true);
                        try {
                          sessionStorage.setItem(notifKey, '1');
                        } catch (_) {}
                      }
                    })
                    .catch(() => {});
                }
              }
            })
            .catch(() => {});
          // Fetch check-in badges
          fetch('/api/poker/checkins/badges?user_id=' + encodeURIComponent(pokerUid), { headers })
            .then(function (r) {
              return r.json();
            })
            .then(function (j) {
              if (j.success && j.badges) {
                var b = j.badges;
                b._nextBadge = j.nextBadge || null;
                setCheckinBadges(b);
              }
            })
            .catch((e) => console.warn('[App] Handled promise rejection:', e?.message || e));
          // Fetch check-in aggregate stats
          fetch('/api/poker/checkins/stats?user_id=' + encodeURIComponent(pokerUid), { headers })
            .then(function (r) {
              return r.json();
            })
            .then(function (j) {
              if (j.success) setCheckinStats(j);
            })
            .catch((e) => console.warn('[App] Handled promise rejection:', e?.message || e));
          // Fetch check-in heatmap data
          fetch('/api/poker/checkins/heatmap?user_id=' + encodeURIComponent(pokerUid), { headers })
            .then(function (r) {
              return r.json();
            })
            .then(function (j) {
              if (j.success) setCheckinHeatmap(j);
            })
            .catch((e) => console.warn('[App] Handled promise rejection:', e?.message || e));
        }

        // --- SWR CACHE SAVE (with TTL timestamp) ---
        try {
          const cachePayload = {
            _cachedAt: Date.now(),
            profile: data || null,
            stats: finalStats,
            friends: finalFriends,
            posts: userPosts,
            photos: finalPhotos,
            videos: userVideos,
            reels: userReels,
          };
          localStorage.setItem(CACHE_KEY, JSON.stringify(cachePayload));
        } catch (cacheErr) {
          console.warn('Failed to save SWR cache payload', cacheErr);
        }
      } catch (e) {
        console.warn('Error fetching profile:', e);
      }
      setLoading(false);
    };

    fetchProfile();
  }, [username]);
  // Realtime subscription — live updates
  useEffect(() => {
    if (!profile?.id) return;

    // Handler that re-triggers the main data fetch
    const handleRealtimeUpdate = async () => {
      // Clear the profile cache so next fetch gets fresh data
      try {
        localStorage.removeItem(`sp-profile-cache-${username}`);
      } catch (_) {
        console.warn('[App] Handled exception:', _?.message || _);
      }

      // Fetch fresh profile data inline (lightweight re-fetch of posts/follows only)
      const refreshContent = async () => {
        try {
          const sid = socialIdRef.current || profile.id; // Use horse social ID if resolved
          const [
            postsData,
            postsCountRes,
            followingRes,
            followersRes,
            sentFriendsRes,
            receivedFriendsRes,
          ] = await Promise.all([
            supabase
              .from('social_posts')
              .select('*')
              .eq('author_id', sid)
              .order('created_at', { ascending: false })
              .limit(20),
            supabase
              .from('social_posts')
              .select('*', { count: 'exact', head: true })
              .eq('author_id', sid),
            supabase
              .from('social_follows')
              .select('*', { count: 'exact', head: true })
              .eq('follower_id', sid),
            supabase
              .from('social_follows')
              .select('*', { count: 'exact', head: true })
              .eq('following_id', sid),
            // Two-direction friend count (matches Friends API)
            supabase
              .from('friendships')
              .select('*', { count: 'exact', head: true })
              .eq('user_id', sid)
              .eq('status', 'accepted'),
            supabase
              .from('friendships')
              .select('*', { count: 'exact', head: true })
              .eq('friend_id', sid)
              .eq('status', 'accepted'),
          ]);
          if (postsData.data) setPosts(postsData.data);

          setStats((prev) => ({
            ...prev,
            following: followingRes.count || prev.following,
            followers: followersRes.count || prev.followers,
            friends: (sentFriendsRes.count || 0) + (receivedFriendsRes.count || 0),
            posts: postsCountRes.count ?? prev.posts,
          }));
        } catch (e) {
          console.warn('[Profile Realtime] Refresh failed:', e);
        }
      };
      refreshContent();
      // Also re-query friendship status (button state can go stale on accept/remove)
      // BUG-6 FIX: check both socialId (horse identity) AND profile.id for complete coverage
      if (currentUser?.id && profile?.id) {
        const sid2 = socialIdRef.current || profile.id;
        const pid2 = profile.id;
        const [f1, f2] = await Promise.all([
          supabase
            .from('friendships')
            .select('status')
            .eq('user_id', currentUser.id)
            .or(`friend_id.eq.${sid2}${pid2 !== sid2 ? `,friend_id.eq.${pid2}` : ''}`),
          supabase
            .from('friendships')
            .select('status')
            .or(`user_id.eq.${sid2}${pid2 !== sid2 ? `,user_id.eq.${pid2}` : ''}`)
            .eq('friend_id', currentUser.id),
        ]);
        const allF = [...(f1.data || []), ...(f2.data || [])];
        if (allF.some((f) => f.status === 'accepted')) {
          setIsFriend(true);
          setFriendRequestSent(false);
        } else if (allF.some((f) => f.status === 'pending')) {
          setIsFriend(false);
          setFriendRequestSent(true);
        } else {
          setIsFriend(false);
          setFriendRequestSent(false);
        }
      }
    };

    // Get current user ID for filtering own events (prevents optimistic + realtime double-count)
    const myUserId = currentUser?.id;

    const realtimeId = socialIdRef.current || profile.id;
    const _ch = supabase
      .channel(`user-profile:${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'social_posts',
          filter: `author_id=eq.${realtimeId}`,
        },
        handleRealtimeUpdate
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'social_follows' },
        handleRealtimeUpdate
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'friendships',
          filter: `friend_id=eq.${realtimeId}`,
        },
        handleRealtimeUpdate
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'friendships',
          filter: `user_id=eq.${realtimeId}`,
        },
        handleRealtimeUpdate
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'friendships' },
        handleRealtimeUpdate
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'social_likes' },
        (payload) => {
          // Skip own likes — already handled by optimistic UI in handleLike
          if (payload.new && payload.new.post_id && payload.new.user_id !== myUserId) {
            eventBus.emit(
              'SOCIAL_LIKE_UPDATE',
              { postId: payload.new.post_id, delta: 1 },
              'SocialRealtime'
            );
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'social_likes' },
        (payload) => {
          // Skip own unlikes — already handled by optimistic UI in handleLike
          if (payload.old && payload.old.post_id && payload.old.user_id !== myUserId) {
            eventBus.emit(
              'SOCIAL_LIKE_UPDATE',
              { postId: payload.old.post_id, delta: -1 },
              'SocialRealtime'
            );
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'social_comments' },
        (payload) => {
          // Skip own comments — already handled by optimistic UI in submitComment
          // NOTE: social_comments uses 'author_id', NOT 'user_id'
          if (payload.new && payload.new.post_id && payload.new.author_id !== myUserId) {
            eventBus.emit(
              'SOCIAL_COMMENT_UPDATE',
              { postId: payload.new.post_id },
              'SocialRealtime'
            );
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'social_comments' },
        (payload) => {
          if (payload.old && payload.old.post_id && payload.old.author_id !== myUserId) {
            eventBus.emit(
              'SOCIAL_COMMENT_UPDATE',
              { postId: payload.old.post_id, removed: true },
              'SocialRealtime'
            );
          }
        }
      )
      .subscribe();

    // Cross-tab cache sync: when another tab invalidates this profile's cache
    const unsubCacheSync = onCacheInvalidation((cacheKey, action) => {
      if (cacheKey === `sp-profile-cache-${username}`) {
        if (action === 'invalidate') {
          handleRealtimeUpdate(); // Re-fetch fresh data
        } else if (action === 'update') {
          // Another tab wrote fresh data — hydrate from cache
          try {
            const raw = localStorage.getItem(cacheKey);
            if (raw) {
              const parsed = JSON.parse(raw);
              if (parsed.profile) setProfile(parsed.profile);
              if (parsed.stats) setStats(parsed.stats);
              if (parsed.friends) setFriends(parsed.friends);
              if (parsed.posts) setPosts(parsed.posts);
            }
          } catch {
            /* noop */
          }
        }
      }
    });

    return () => {
      supabase.removeChannel(_ch);
      unsubCacheSync();
    };
  }, [profile?.id, username, currentUser?.id]);

  // Helper — invalidate profile cache + notify friends page cross-tab
  const invalidateProfileCache = () => {
    const cacheKey = `sp-profile-cache-${username}`;
    try {
      localStorage.removeItem(cacheKey);
    } catch {
      /* noop */
    }
    emitCacheInvalidation(cacheKey);
  };

  const notifyFriendsSync = () => {
    busEmit.dataMutated('friends');
    broadcastSyncDebounced('smarter_poker_friends_sync', {
      action: 'refresh',
      tabId: BROADCAST_TAB_ID,
    });
  };

  const handleAddFriend = async () => {
    if (!currentUser || !profile || friendRequestSent || isFriend) return;
    const targetId = socialIdRef.current || profile.id;
    // Optimistic update
    setFriendRequestSent(true);
    try {
      const { error } = await supabase.from('friendships').insert({
        user_id: currentUser.id,
        friend_id: targetId,
        status: 'pending',
      });
      if (error) throw error;
      toast.success('Friend request sent!');
      invalidateProfileCache();
      busEmit.friendRequestSent(targetId);
      notifyFriendsSync();
      // Insert in-app notification for the recipient
      const senderName = currentUser?.user_metadata?.full_name || currentUser?.user_metadata?.username || 'Someone';
      const senderUsername = currentUser?.user_metadata?.username || currentUser?.id;
      supabase.from('notifications').insert({
        user_id: targetId,
        actor_id: currentUser.id,
        type: 'friend_request',
        title: senderName,
        message: 'sent you a friend request',
        action_url: `/hub/user/${senderUsername}`,
        data: { sender_id: currentUser.id, sender_name: senderName },
        read: false,
      }).then().catch(e => console.warn('[profile] Notification insert (non-fatal):', e));
    } catch (e) {
      // Rollback optimistic update on failure
      setFriendRequestSent(false);
      console.warn('[App] Handled exception:', e?.message || e);
      toast.error('Could not send friend request. Please try again.');
    }
  };

  const handleCancelFriendRequest = async () => {
    if (!currentUser || !profile || !friendRequestSent) return;
    const targetId = socialIdRef.current || profile.id;
    // Optimistic update
    setFriendRequestSent(false);
    try {
      const { error } = await supabase
        .from('friendships')
        .delete()
        .eq('user_id', currentUser.id)
        .eq('friend_id', targetId)
        .eq('status', 'pending');
      if (error) throw error;
      invalidateProfileCache();
      notifyFriendsSync();
    } catch (e) {
      console.warn('[App] Handled exception:', e?.message || e);
    }
  };

  const handleFollowToggle = async () => {
    if (!currentUser || !profile || followLoading) return;
    setFollowLoading(true);
    const wasFollowing = isFollowing;
    // Optimistic update
    setIsFollowing(!wasFollowing);
    setStats((prev) => ({
      ...prev,
      followers: wasFollowing ? Math.max(0, prev.followers - 1) : prev.followers + 1,
    }));
    try {
      const targetId = socialIdRef.current || profile.id;
      if (wasFollowing) {
        const { error } = await supabase
          .from('social_follows')
          .delete()
          .eq('follower_id', currentUser.id)
          .eq('following_id', targetId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('social_follows').insert({
          follower_id: currentUser.id,
          following_id: targetId,
        });
        if (error) throw error;
        // Create follow notification via server-side API (bypasses RLS)
        const token = getAccessToken();
        if (token) {
          fetch('/api/notifications/follow', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ followingUserId: targetId }),
          })
            .then(() => {
              busEmit.dataMutated('notifications');
            })
            .catch((e) => {
              console.warn('[App] Handled promise rejection:', e?.message || e);
            });
        }
      }
      invalidateProfileCache();
      busEmit.dataMutated('follows');
    } catch (e) {
      // Rollback on failure
      setIsFollowing(wasFollowing);
      setStats((prev) => ({
        ...prev,
        followers: wasFollowing ? prev.followers + 1 : Math.max(0, prev.followers - 1),
      }));
      console.warn('[App] Handled exception:', e?.message || e);
      toast.error(wasFollowing ? 'Could not unfollow' : 'Could not follow');
    }
    setFollowLoading(false);
  };

  const handleMessage = () => {
    // Deep-link into messenger with compose mode — auto-starts conversation with this user
    const targetId = socialIdRef.current || profile.id;
    router.push(`/hub/messenger?compose=${profile.username}&uid=${targetId}`);
  };

  const handleRemoveFriend = async () => {
    if (!currentUser || !profile) return;
    const targetId = socialIdRef.current || profile.id;
    // Optimistic update
    const wasFriend = isFriend;
    const prevStats = { ...stats };
    setIsFriend(false);
    setFriendRequestSent(false);
    setShowUnfriendConfirm(false);
    setStats((prev) => ({ ...prev, friends: Math.max(0, prev.friends - 1) }));
    
    // Create an array of possible target IDs to catch horse/profile identity overlaps
    const possibleTargetIds = Array.from(new Set([targetId, profile.id]));

    try {
      // Delete both directions in parallel to avoid orphan records
      const [res1, res2] = await Promise.all([
        supabase
          .from('friendships')
          .delete()
          .eq('user_id', currentUser.id)
          .in('friend_id', possibleTargetIds),
        supabase
          .from('friendships')
          .delete()
          .in('user_id', possibleTargetIds)
          .eq('friend_id', currentUser.id),
      ]);
      if (res1.error || res2.error) throw res1.error || res2.error; // Either failed — rollback
      
      toast.success('Friend removed', { id: 'unfriend-success' });
      invalidateProfileCache();
      notifyFriendsSync();
    } catch (e) {
      console.warn('[App] Unfriend failed:', e?.message || e);
      toast.error('Failed to remove friend');
      // Rollback
      setIsFriend(wasFriend);
      setStats(prevStats);
    }
  };

  const handleDeletePost = async (postId) => {
    // BUG FIX (USER-DELETE-1): handleDeletePost was fire-and-forget on the DB.
    // It optimistically filtered the post out of state, fired
    // invalidateProfileCache() + busEmit.dataMutated('social') + broadcastSync(),
    // and only THEN issued the DB delete. The same-tab cache-invalidation listener
    // (onCacheInvalidation) runs handleRealtimeUpdate() -> refreshContent() which
    // re-queries social_posts. Because the DB delete had not landed yet, the
    // refetch pulled the post back into state and the user had to click delete a
    // second time. Fix: optimistic UI -> AWAIT the DB delete -> then broadcast.
    //
    // BUG FIX (USER-DELETE-2): the post -> reel relationship uses
    // ON DELETE SET NULL on social_reels.source_post_id, so deleting the post
    // left an orphan reel that kept playing in /hub/reels. Until the migration
    // changing that FK to ON DELETE CASCADE has propagated to every environment,
    // explicitly delete the matching reel rows here.
    const prevPosts = posts;
    const prevPhotos = photos;
    const prevVideos = videos;
    const prevStats = { ...stats };
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    setPhotos((prev) => prev.filter((p) => p.id !== postId));
    setVideos((prev) => prev.filter((p) => p.id !== postId));
    setStats((prev) => ({ ...prev, posts: Math.max(0, prev.posts - 1) }));

    // AWAIT the DB delete — this is what serializes the broadcast below.
    const { error } = await supabase.from('social_posts').delete().eq('id', postId);

    if (error) {
      // Rollback UI on DB failure
      setPosts(prevPosts);
      setPhotos(prevPhotos);
      setVideos(prevVideos);
      setStats(prevStats);
      console.warn('Error deleting post:', error);
      return;
    }

    // Defense in depth — also delete any reel rows whose source_post_id matched
    // this post. The migration moves the FK to ON DELETE CASCADE so this becomes
    // a no-op once it lands, but until then it prevents orphan reels.
    try {
      await supabase.from('social_reels').delete().eq('source_post_id', postId);
    } catch (e) {
      console.warn('[App] Reel cleanup after post delete failed (non-fatal):', e?.message || e);
    }

    // Defense in depth (2026-05-11) — also clean up any live_streams row whose
    // feed_post_id matched this post. The FK live_streams.feed_post_id ->
    // social_posts.id is ON DELETE SET NULL (not CASCADE), so a post-delete
    // would otherwise leave the live_streams row orphaned with feed_post_id=NULL
    // — the past-lives tab still shows it and the replay still plays.
    //
    // BUG FIX (2026-05-11 audit P1, L2): route through /api/live/end-stream
    // instead of an inline DELETE. Inline DELETE leaves the .mp4 in the
    // live-recordings storage bucket orphaned because storage isn't governed
    // by the FK. The endpoint does ownership verification, removes the .mp4,
    // and deletes the row atomically. Same fix already in handleDeleteLive.
    // RLS guard on broadcaster_id is preserved at the endpoint side.
    try {
      const { data: ownedStreams } = await supabase
        .from('live_streams')
        .select('id')
        .eq('feed_post_id', postId)
        .eq('broadcaster_id', currentUser?.id);
      if (ownedStreams && ownedStreams.length) {
        const token = typeof getAccessToken === 'function' ? getAccessToken() : null;
        await Promise.all(
          ownedStreams.map((s) =>
            fetch('/api/live/end-stream', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              credentials: 'same-origin',
              body: JSON.stringify({ stream_id: s.id, action: 'delete' }),
            }).catch((err) => {
              console.warn(
                '[App] Live-stream endpoint delete failed (non-fatal):',
                err?.message || err
              );
            })
          )
        );
      }
    } catch (e) {
      console.warn(
        '[App] Live-stream cleanup after post delete failed (non-fatal):',
        e?.message || e
      );
    }

    // Only broadcast / invalidate cache AFTER the DB delete is confirmed —
    // otherwise listeners refetch and see the still-present row.
    invalidateProfileCache();
    busEmit.dataMutated('social');
    broadcastSync('smarter_poker_social_sync', {
      action: 'refresh_feed',
      tabId: BROADCAST_TAB_ID,
      deletedPostId: postId,
    });
  };

  // Delete a reel directly (separate from handleDeletePost, which targets
  // social_posts). The Reels tab queries social_reels directly — many older
  // reels have source_post_id=NULL because they were uploaded straight to
  // the reels feed (not via a social_post mirror). Those won't cascade when
  // a post is deleted because there's no post to delete. This handler lets
  // an owner remove a reel from their profile by reel.id directly. Includes
  // the same defense-in-depth pattern as handleDeletePost: optimistic UI
  // first, then AWAIT the DB delete, then broadcast cache invalidation.
  const handleDeleteReel = async (reelId) => {
    if (!reelId || !currentUser?.id) return;
    if (
      typeof window !== 'undefined' &&
      !window.confirm('Delete this reel? This cannot be undone.')
    )
      return;
    const prevReels = reels;
    const prevStats = { ...stats };
    setReels((prev) => prev.filter((r) => r.id !== reelId));
    setStats((prev) => ({ ...prev, reels: Math.max(0, (prev.reels || 0) - 1) }));
    const { error } = await supabase
      .from('social_reels')
      .delete()
      .eq('id', reelId)
      .eq('author_id', currentUser.id); // RLS-safety: only delete own reels
    if (error) {
      setReels(prevReels);
      setStats(prevStats);
      console.warn('Error deleting reel:', error);
      return;
    }
    invalidateProfileCache();
    busEmit.dataMutated('social');
    broadcastSync('smarter_poker_social_sync', {
      action: 'refresh_feed',
      tabId: BROADCAST_TAB_ID,
      deletedReelId: reelId,
    });
  };

  // Delete a past live stream from the profile. Symmetric to handleDeleteReel —
  // wired because the profile's Lives tab queries live_streams directly and
  // there's no other delete affordance. The FK direction is
  // live_streams.feed_post_id -> social_posts.id ON DELETE SET NULL, which
  // means deleting the social_post leaves the live_streams row orphaned with
  // feed_post_id=NULL (still appears under "Past Lives"). To make
  // delete-from-profile work, we delete the live_streams row directly
  // (cascades to live_comments, live_reactions, live_viewers, live_gifts,
  // live_pins, live_signaling, live_bans, live_ban_audit) AND explicitly
  // delete the linked social_posts row (the "X went live" feed entry) since
  // the FK SET NULL leaves it behind. RLS-safety: only own streams.
  const handleDeleteLive = async (liveId /* feedPostId unused — endpoint handles it */) => {
    if (!liveId || !currentUser?.id) return;
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        'Delete this live replay? Comments, reactions, viewer history, and the recording file will also be removed. This cannot be undone.'
      )
    )
      return;
    // BUG FIX (2026-05-11 audit): route through /api/live/end-stream?action=delete
    // instead of inline Supabase deletes. That endpoint ALSO removes the .mp4
    // from the live-recordings storage bucket — inline deletes left the file
    // orphaned (the storage-GC cron would eventually clean it but not
    // immediately). The endpoint does ownership verification, deletes the
    // linked social_posts entry, deletes storage, deletes live_streams.
    // Same path pages/hub/lives.js uses for draft-delete (proven).
    const prevLives = pastLives;
    setPastLives((prev) => prev.filter((l) => l.id !== liveId));
    try {
      const token = typeof getAccessToken === 'function' ? getAccessToken() : null;
      const resp = await fetch('/api/live/end-stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'same-origin',
        body: JSON.stringify({ stream_id: liveId, action: 'delete' }),
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${resp.status}`);
      }
    } catch (e) {
      setPastLives(prevLives);
      console.warn('[App] Error deleting live stream:', e?.message || e);
      return;
    }
    invalidateProfileCache();
    busEmit.dataMutated('social');
    broadcastSync('smarter_poker_social_sync', {
      action: 'refresh_feed',
      tabId: BROADCAST_TAB_ID,
      deletedLiveId: liveId,
    });
  };

  const handlePost = async (
    content,
    urls = [],
    type = 'text',
    mentions = [],
    linkPreview = null
  ) => {
    if (!currentUser?.id) {
      console.warn('Cannot post: user not logged in');
      return false;
    }

    setIsPosting(true);
    try {
      let cleanContent = content;
      let finalUrls = [...urls];
      let finalType = type;

      // Detect YouTube URLs in content
      const youtubeRegex =
        /(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/g;
      const youtubeMatch = content.match(youtubeRegex);

      // Detect general URLs in content
      const generalUrlRegex = /(https?:\/\/[^\s]+)/g;
      const urlMatch = content.match(generalUrlRegex);

      if (youtubeMatch && finalType === 'text') {
        // Extract YouTube URL and remove from content
        const fullUrl = youtubeMatch[0].startsWith('http')
          ? youtubeMatch[0]
          : `https://${youtubeMatch[0]}`;
        finalUrls = [fullUrl];
        finalType = 'video';
        cleanContent = content.replace(youtubeRegex, '').trim();
      } else if (urlMatch && finalType === 'text') {
        // Extract general URL and remove from content
        finalUrls = [urlMatch[0]];
        finalType = 'link';
        cleanContent = content.replace(generalUrlRegex, '').trim();
      }

      const insertPayload = {
        author_id: currentUser.id,
        content: cleanContent,
        content_type: finalType,
        media_urls: finalUrls,
        visibility: 'public',
      };

      // Add link metadata if available
      if (linkPreview) {
        insertPayload.link_url = linkPreview.url || finalUrls[0];
        insertPayload.link_title = linkPreview.title || null;
        insertPayload.link_description = linkPreview.description || null;
        insertPayload.link_image = linkPreview.image || null;
        insertPayload.link_site_name = linkPreview.domain || null;
      }

      const { data, error } = await supabase
        .from('social_posts')
        .insert(insertPayload)
        .select()
        .maybeSingle();

      if (error) {
        console.warn('Post creation error:', error);
        setIsPosting(false);
        return false;
      }

      if (!data) {
        console.warn('Post creation returned null');
        setIsPosting(false);
        return false;
      }

      // Add the new post to the local state
      const newPost = {
        ...data,
        author: {
          id: currentUser.id,
          username: currentUser.user_metadata?.username,
          full_name: currentUser.user_metadata?.full_name,
          avatar_url: currentUser.user_metadata?.avatar_url,
        },
      };
      setPosts((prev) => [newPost, ...prev]);
      setStats((prev) => ({ ...prev, posts: prev.posts + 1 }));
      setIsPosting(false);
      invalidateProfileCache();
      busEmit.dataMutated('social');
      broadcastSync('smarter_poker_social_sync', {
        action: 'refresh_feed',
        tabId: BROADCAST_TAB_ID,
      });
      return true;
    } catch (e) {
      console.warn('Error creating post:', e);
      setIsPosting(false);
      return false;
    }
  };

  // Route prefetch — preload likely navigation targets
  useEffect(() => {
    router.prefetch('/hub/social-media');
    router.prefetch('/hub/messenger');
    router.prefetch('/hub/profile-edit');
    router.prefetch('/hub/friends');
  }, [router]);

  // Profile menu close-on-outside-click
  useEffect(() => {
    if (!showProfileMenu) return;
    const handleClickOutside = (e) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target)) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showProfileMenu]);

  if (loading) {
    return <ProfileSkeleton />;
  }

  if (!profile) {
    return (
      <div
        style={{
          minHeight: '100vh',
          paddingBottom: 70,
          width: '100%',
          maxWidth: '100vw',
          overflowX: 'hidden',
          boxSizing: 'border-box',
          background: C.bg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}></div>
          <h2 style={{ color: C.text, margin: '0 0 8px' }}>User Not Found</h2>
          <p style={{ color: C.textSec }}>The Profile You're Looking For Doesn't Exist.</p>
          <Link href="/hub/social-media" style={{ color: C.blue, fontWeight: 600 }}>
            Back To Social
          </Link>
        </div>
      </div>
    );
  }

  const isOwnProfile = currentUser?.id === profile.id;
  // Display name = real name (full_name) first, username as fallback
  // Poker alias (@username) is shown separately as a handle badge
  const displayName = profile.full_name || profile.username || 'Player';
  const pokerAlias = profile.username && profile.full_name ? profile.username : null; // Only show alias badge if they have both
  const locationParts = [
    profile.city,
    profile.state,
    profile.country === 'US' ? null : profile.country,
  ].filter(Boolean);

  return (
    <PageTransition>
      <SEOHead
        title={`${displayName} — Player Profile`}
        description={`View ${displayName}'s poker profile, stats, and achievements on Smarter.Poker.`}
        ogImage={profile.avatar_url || profile.cover_photo_url || undefined}
        canonical={`/hub/user/${profile.username}`}
      />

      {/* BUG FIX (USER-LAYOUT-1): explicit width + box-sizing prevents the page
                from rendering in a narrow column when an ancestor container has a
                stale width / flex-basis. Reported on mobile after USER-LOOKUP-1
                fix made the page actually render. */}
      <div
        className="sp-profile-page"
        style={{
          minHeight: '100vh',
          width: '100%',
          maxWidth: '100vw',
          boxSizing: 'border-box',
          overflowX: 'hidden',
          background: C.bg,
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif',
        }}
      >
        <UniversalHeader pageDepth={2} />

        {/* Pull-to-Refresh Indicator */}
        {pullRefreshing && (
          <div
            style={{
              textAlign: 'center',
              padding: '10px 0',
              background: C.bg,
              color: C.blue,
              fontSize: 13,
              fontWeight: 600,
              borderBottom: `1px solid ${C.border}`,
            }}
          >
            <span
              style={{
                display: 'inline-block',
                animation: 'spin 0.8s linear infinite',
                marginRight: 6,
                fontSize: 16,
              }}
            >
              ⟳
            </span>
            Refreshing...
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* COVER PHOTO */}
        <div
          style={{
            height: 200,
            background:
              'linear-gradient(135deg, #0a0e1a 0%, #0d1f3c 25%, #1a3a5c 50%, #0f2847 75%, #0a1628 100%)',
            position: 'relative',
            borderRadius: '0 0 12px 12px',
            overflow: 'hidden',
          }}
        >
          {/* Cover Photo with fade-in + error fallback */}
          {profile.cover_photo_url && (
            <img
              src={profile.cover_photo_url}
              alt="Cover photo"
              onLoad={() => setCoverLoaded(true)}
              onError={() => setCoverLoaded(false)}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition: profile.cover_photo_position || '50% 50%',
                opacity: coverLoaded ? 1 : 0,
                transition: 'opacity 0.5s ease-in-out',
              }}
            />
          )}
          {/* Dark overlay for better text visibility */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(to top, rgba(0,0,0,0.4), transparent)',
              borderRadius: '0 0 12px 12px',
            }}
          />

          {/* Cover Photo Upload Button - Own profile only */}
          {isOwnProfile && (
            <Link
              href="/hub/profile-edit"
              style={{
                position: 'absolute',
                bottom: 16,
                right: 16,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 16px',
                background: 'rgba(0,0,0,0.6)',
                borderRadius: 8,
                color: 'white',
                fontSize: 14,
                fontWeight: 600,
                textDecoration: 'none',
                backdropFilter: 'blur(4px)',
                border: '1px solid rgba(255,255,255,0.2)',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              <svg viewBox="0 0 24 24" width={18} height={18} fill="currentColor">
                <path d="M4 6h4l1.5-2h5L16 6h4c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V8c0-1.1.9-2 2-2zm8 11c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm0-8c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3z" />
              </svg>
              Edit Cover Photo
            </Link>
          )}
        </div>

        {/* PROFILE HEADER - SmarterPoker Style */}
        <div style={{ padding: '0 16px', marginTop: -50, position: 'relative', zIndex: 10 }}>
          <div className="sp-profile-header-row">
            {/* Avatar */}
            <div style={{ position: 'relative', display: 'inline-block', flexShrink: 0 }}>
              <Avatar src={profile.avatar_url} name={displayName} size={120} />
              {(() => {
                const hid = socialIdRef.current || profile.id;
                return horseProfileIds.has(hid) && isHorseOnlineNow(hid);
              })() && (
                <span
                  style={{
                    position: 'absolute',
                    bottom: 4,
                    right: 4,
                    width: 18,
                    height: 18,
                    background: '#31a24c',
                    border: `3px solid ${C.bg}`,
                    borderRadius: '50%',
                    zIndex: 5,
                  }}
                />
              )}
              {isOwnProfile && (
                <Link
                  href="/hub/profile-edit"
                  style={{
                    position: 'absolute',
                    bottom: -2,
                    right: 4,
                    width: 34,
                    height: 34,
                    background: '#E4E6EB',
                    border: `2px solid ${C.bg}`,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#050505',
                    zIndex: 10,
                    transition: 'background 0.2s',
                    textDecoration: 'none',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#D8DADF')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = '#E4E6EB')}
                >
                  <svg viewBox="0 0 24 24" width={18} height={18} fill="currentColor">
                    <path d="M4 6h4l1.5-2h5L16 6h4c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V8c0-1.1.9-2 2-2zm8 11c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm0-8c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3z" />
                  </svg>
                </Link>
              )}
            </div>

            {/* Streak Break Alert — shown once per session when user's streak expired */}
            {isOwnProfile && streakBreakAlert && (
              <div
                style={{
                  margin: '0 0 12px',
                  padding: '10px 14px',
                  borderRadius: 10,
                  background:
                    'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(251,191,36,0.10))',
                  border: '1px solid rgba(245,158,11,0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 18 }}>⚡</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b' }}>
                      Your Share Streak Boost Lapsed
                    </div>
                    <div style={{ fontSize: 12, color: '#92400e' }}>
                      Share a post today to re-activate your diamond multiplier!
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setStreakBreakAlert(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#f59e0b',
                    fontSize: 18,
                    lineHeight: 1,
                    padding: 0,
                    flexShrink: 0,
                  }}
                  aria-label="Dismiss"
                >
                  ×
                </button>
              </div>
            )}

            {/* Name & Stats */}
            <div className="sp-profile-name-stats">
              <h1
                style={{ fontSize: 26, fontWeight: 700, margin: 0, color: C.text, lineHeight: 1 }}
              >
                {displayName}
              </h1>
              {pokerAlias && (
                <div
                  style={{
                    fontSize: 13,
                    color: C.blue,
                    fontWeight: 600,
                    marginTop: 3,
                    letterSpacing: 0.2,
                  }}
                >
                  @{pokerAlias}
                </div>
              )}
              {(profile.created_at || locationParts.length > 0) && (
                <div
                  style={{
                    fontSize: 11,
                    color: C.textSec,
                    marginTop: 4,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    flexWrap: 'wrap',
                  }}
                >
                  {profile.created_at && (
                    <>
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                      Member Since {new Date(profile.created_at).getFullYear()}
                    </>
                  )}
                  {locationParts.length > 0 && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      {profile.created_at && '·'}
                      <svg
                        width="11"
                        height="11"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                        <circle cx="12" cy="10" r="3" />
                      </svg>
                      {locationParts.join(', ')}
                    </span>
                  )}
                </div>
              )}

              <div className="sp-profile-stats-row">
                {[
                  { val: animatedStats.friends, label: 'Friends', tab: 'friends' },
                  { val: animatedStats.followers, label: 'Followers', tab: 'followers' },
                  { val: animatedStats.following, label: 'Following', tab: 'following' },
                  { val: animatedStats.posts, label: 'Posts', tab: null },
                ].map((s, i) => (
                  <React.Fragment key={s.label}>
                    {i > 0 && <span className="sp-stat-dot">·</span>}
                    {s.tab ? (
                      <Link
                        href={`/hub/friends?tab=${s.tab}`}
                        style={{ textDecoration: 'none', color: 'inherit', whiteSpace: 'nowrap' }}
                      >
                        <span
                          style={{ cursor: 'pointer', transition: 'color 0.15s' }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = C.blue)}
                          onMouseLeave={(e) => (e.currentTarget.style.color = '')}
                        >
                          <strong
                            style={{ display: 'inline-block', minWidth: 12, textAlign: 'center' }}
                          >
                            {s.val}
                          </strong>{' '}
                          {s.label}
                        </span>
                      </Link>
                    ) : (
                      <span style={{ whiteSpace: 'nowrap' }}>
                        <strong
                          style={{ display: 'inline-block', minWidth: 12, textAlign: 'center' }}
                        >
                          {s.val}
                        </strong>{' '}
                        {s.label}
                      </span>
                    )}
                  </React.Fragment>
                ))}
                {checkinStreak.currentStreak >= 2 && (
                  <>
                    <span className="sp-stat-dot">·</span>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 3,
                        background:
                          'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(239,68,68,0.15))',
                        border: '1px solid rgba(245,158,11,0.3)',
                        borderRadius: 12,
                        padding: '2px 8px',
                        fontSize: 12,
                        fontWeight: 700,
                        color: '#f59e0b',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="#f59e0b" stroke="none">
                        <path d="M12 23c-3.5-2.4-6-5.3-7.5-8.5C3 11 3.5 7.5 5.5 5.5S10 2 12 2s4.5 1.5 6.5 3.5S21 11 19.5 14.5C18 17.7 15.5 20.6 12 23z" />
                      </svg>
                      {checkinStreak.currentStreak}-Day Streak
                      {checkinStreak.longestStreak > checkinStreak.currentStreak && (
                        <span
                          style={{
                            fontSize: 10,
                            color: 'rgba(245,158,11,0.6)',
                            fontWeight: 500,
                            marginLeft: 4,
                          }}
                        >
                          (Best: {checkinStreak.longestStreak})
                        </span>
                      )}
                    </span>
                  </>
                )}
                {shareStreak.is_active && shareStreak.streak_days >= 2 && (
                  <>
                    <span className="sp-stat-dot">·</span>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 3,
                        background:
                          'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.15))',
                        border: '1px solid rgba(99,102,241,0.35)',
                        borderRadius: 12,
                        padding: '2px 8px',
                        fontSize: 12,
                        fontWeight: 700,
                        color: '#818cf8',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="#818cf8" stroke="none">
                        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                      </svg>
                      💎 {shareStreak.streak_days}-Day Shares
                    </span>
                  </>
                )}
                {isOwnProfile && profile?.diamond_multiplier > 1.0 && (
                  <>
                    <span className="sp-stat-dot">·</span>
                    <span
                      title="Your active share streak is boosting all diamond earnings!"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 3,
                        background:
                          'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(251,191,36,0.12))',
                        border: '1px solid rgba(245,158,11,0.4)',
                        borderRadius: 12,
                        padding: '2px 8px',
                        fontSize: 12,
                        fontWeight: 700,
                        color: '#f59e0b',
                        whiteSpace: 'nowrap',
                        cursor: 'default',
                      }}
                    >
                      ⚡ {Number(profile.diamond_multiplier).toFixed(2)}× Boost
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
          {/* Mobile-responsive profile header styles */}
          <style>{`
                        .sp-profile-header-row {
                            display: flex;
                            gap: 16px;
                            align-items: flex-start;
                        }
                        .sp-profile-name-stats {
                            flex: 1;
                            padding-top: 51px;
                            padding-bottom: 8px;
                            min-width: 0;
                        }
                        .sp-profile-stats-row {
                            display: flex;
                            gap: 8px;
                            font-size: 14px;
                            color: #65676B;
                            margin-top: 6px;
                            flex-wrap: nowrap;
                            align-items: center;
                            white-space: nowrap;
                        }
                        /* Mobile portrait: stack avatar above name+stats for more horizontal room */
                        @media (max-width: 480px) {
                            .sp-profile-header-row {
                                flex-direction: column;
                                align-items: flex-start;
                                gap: 0;
                            }
                            .sp-profile-name-stats {
                                padding-top: 8px;
                                width: 100%;
                            }
                            .sp-profile-stats-row {
                                flex-wrap: wrap;
                                font-size: 14px;
                            }
                        }
                        /* Landscape / tablets: keep side-by-side but allow wrapping if needed */
                        @media (min-width: 481px) and (max-width: 768px) {
                            .sp-profile-stats-row {
                                font-size: 13px;
                                gap: 6px;
                            }
                        }
                    `}</style>

          {/* Intro Bar - Work, Social */}
          {(profile.occupation || profile.instagram) && (
            <div
              style={{
                marginTop: 12,
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                fontSize: 14,
                color: C.textSec,
              }}
            >
              {profile.occupation && <span>💼 {profile.occupation}</span>}
              {profile.occupation && profile.instagram && <span>·</span>}
              {profile.instagram && (
                <a
                  href={`https://instagram.com/${profile.instagram.replace('@', '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: C.textSec, textDecoration: 'none' }}
                >
                  📸 @{profile.instagram.replace('@', '')}
                </a>
              )}
            </div>
          )}

          {/* Friends Row - "Friends with..." + Mutual Friends Badge */}
          {friends.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
              <div style={{ display: 'flex' }}>
                {friends.slice(0, 3).map((f, i) => (
                  <img
                    key={f.id}
                    src={f.avatar_url || '/default-avatar.png'}
                    alt={f.username || f.full_name || 'Friend'}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      objectFit: 'cover',
                      border: '2px solid white',
                      marginLeft: i > 0 ? -10 : 0,
                    }}
                  />
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 13, color: C.textSec }}>
                  Friends with{' '}
                  <strong>
                    {friends
                      .slice(0, 2)
                      .map((f) => f.full_name?.split(' ')[0] || f.username)
                      .join(', ')}
                  </strong>
                  {friends.length > 2 && ` and ${friends.length - 2} others`}
                </span>
                {!isOwnProfile &&
                  (() => {
                    const mutualTotal = friends.filter((f) => f.mutualCount > 0).length;
                    return mutualTotal > 0 ? (
                      <span style={{ fontSize: 12, color: C.blue, fontWeight: 600 }}>
                        {mutualTotal} mutual friend{mutualTotal !== 1 ? 's' : ''}
                      </span>
                    ) : null;
                  })()}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            {isOwnProfile ? (
              <>
                <Link
                  href="/hub/profile-edit"
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    background: '#e4e6eb',
                    color: C.text,
                    borderRadius: 8,
                    textDecoration: 'none',
                    fontWeight: 600,
                    textAlign: 'center',
                    fontSize: 14,
                  }}
                >
                  Edit Profile
                </Link>
                <Link
                  href="/hub/social-media"
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    background: C.blue,
                    color: 'white',
                    borderRadius: 8,
                    textDecoration: 'none',
                    fontWeight: 600,
                    textAlign: 'center',
                    fontSize: 14,
                  }}
                >
                  Social Feed
                </Link>
                <button
                  onClick={async () => {
                    const url = `https://smarter.poker/hub/user/${profile.username}`;
                    // Try native Web Share API first (mobile)
                    if (navigator.share) {
                      try {
                        await navigator.share({ title: `${displayName} on Smarter.Poker`, url });
                        return;
                      } catch {
                        /* User cancelled or not supported — fall through to clipboard */
                      }
                    }
                    // Clipboard copy with inline feedback
                    try {
                      if (navigator.clipboard) {
                        await navigator.clipboard.writeText(url);
                      } else {
                        const input = document.createElement('input');
                        input.value = url;
                        document.body.appendChild(input);
                        input.select();
                        document.execCommand('copy');
                        document.body.removeChild(input);
                      }
                      clearTimeout(shareCopiedTimer.current);
                      setShareCopied(true);
                      shareCopiedTimer.current = setTimeout(() => setShareCopied(false), 2000);
                    } catch {
                      toast.error('Could not copy link');
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.target.click();
                    }
                  }}
                  style={{
                    padding: '10px 14px',
                    background: shareCopied ? '#42B72A' : '#e4e6eb',
                    color: shareCopied ? 'white' : C.text,
                    borderRadius: 20,
                    border: 'none',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontSize: 14,
                    transition: 'all 0.3s ease',
                    outline: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  {shareCopied ? (
                    '✓ Copied!'
                  ) : (
                    <>
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                        <polyline points="16 6 12 2 8 6" />
                        <line x1="12" y1="2" x2="12" y2="15" />
                      </svg>{' '}
                      Share
                    </>
                  )}
                </button>
              </>
            ) : (
              <>
                {isFriend ? (
                  <button
                    onClick={() => setShowUnfriendConfirm(true)}
                    title="Unfriend"
                    style={{
                      padding: '10px 20px',
                      background: '#e4e6eb',
                      color: C.text,
                      borderRadius: 8,
                      border: 'none',
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontSize: 14,
                    }}
                  >
                    {' '}
                    ✓ Friends
                  </button>
                ) : friendRequestSent ? (
                  <button
                    onClick={handleCancelFriendRequest}
                    title="Click to cancel friend request"
                    style={{
                      padding: '10px 20px',
                      background: '#e4e6eb',
                      color: C.textSec,
                      borderRadius: 8,
                      border: 'none',
                      fontWeight: 600,
                      fontSize: 14,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    ⏳ Request Sent
                  </button>
                ) : (
                  <button
                    onClick={handleAddFriend}
                    style={{
                      padding: '10px 20px',
                      background: C.blue,
                      color: 'white',
                      borderRadius: 8,
                      border: 'none',
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontSize: 14,
                    }}
                  >
                    ➕ Add Friend
                  </button>
                )}
                {currentUser && !isOwnProfile && (
                  <button
                    onClick={handleFollowToggle}
                    disabled={followLoading}
                    style={{
                      padding: '10px 16px',
                      background: isFollowing ? '#e4e6eb' : 'transparent',
                      color: isFollowing ? C.text : C.blue,
                      borderRadius: 8,
                      border: isFollowing ? 'none' : `1px solid ${C.blue}`,
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontSize: 14,
                      opacity: followLoading ? 0.6 : 1,
                      transition: 'all 0.2s',
                    }}
                  >
                    {isFollowing ? '✓ Following' : 'Follow'}
                  </button>
                )}
                <button
                  onClick={handleMessage}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    background: C.blue,
                    color: 'white',
                    borderRadius: 8,
                    border: 'none',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontSize: 14,
                  }}
                >
                  {' '}
                  Message
                </button>
                <div style={{ position: 'relative' }} ref={profileMenuRef}>
                  <button
                    onClick={() => setShowProfileMenu(!showProfileMenu)}
                    style={{
                      padding: '10px 14px',
                      background: '#e4e6eb',
                      color: C.text,
                      borderRadius: 8,
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 14,
                    }}
                  >
                    ⋮
                  </button>
                  {showProfileMenu && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '100%',
                        right: 0,
                        marginTop: 4,
                        background: C.card,
                        borderRadius: 10,
                        padding: 4,
                        minWidth: 220,
                        boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                        zIndex: 100,
                        border: `1px solid ${C.border}`,
                      }}
                    >
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(window.location.href);
                          setProfileMenuMsg('Link copied!');
                          setTimeout(() => setProfileMenuMsg(''), 2000);
                          setShowProfileMenu(false);
                        }}
                        style={{
                          width: '100%',
                          padding: '10px 14px',
                          background: 'transparent',
                          border: 'none',
                          textAlign: 'left',
                          cursor: 'pointer',
                          fontSize: 14,
                          color: C.text,
                          borderRadius: 6,
                          display: 'flex',
                          gap: 10,
                        }}
                      >
                        🔗 Copy Profile Link
                      </button>
                      <button
                        onClick={() => {
                          window.open(window.location.href, '_blank');
                          setShowProfileMenu(false);
                        }}
                        style={{
                          width: '100%',
                          padding: '10px 14px',
                          background: 'transparent',
                          border: 'none',
                          textAlign: 'left',
                          cursor: 'pointer',
                          fontSize: 14,
                          color: C.text,
                          borderRadius: 6,
                          display: 'flex',
                          gap: 10,
                        }}
                      >
                        ↗️ Open In New Tab
                      </button>
                      <div style={{ height: 1, background: C.border, margin: '4px 0' }} />
                      <button
                        onClick={() => {
                          if (!currentUser) {
                            setProfileMenuMsg('Log in to block');
                            return;
                          }
                          setShowBlockConfirm(true);
                          setShowProfileMenu(false);
                        }}
                        style={{
                          width: '100%',
                          padding: '10px 14px',
                          background: 'transparent',
                          border: 'none',
                          textAlign: 'left',
                          cursor: 'pointer',
                          fontSize: 14,
                          color: '#F02849',
                          borderRadius: 6,
                          display: 'flex',
                          gap: 10,
                        }}
                      >
                        🚫 Block User
                      </button>
                      <button
                        onClick={() => {
                          if (!currentUser) {
                            setProfileMenuMsg('Log in to report');
                            return;
                          }
                          setShowReportInput(true);
                          setShowProfileMenu(false);
                        }}
                        style={{
                          width: '100%',
                          padding: '10px 14px',
                          background: 'transparent',
                          border: 'none',
                          textAlign: 'left',
                          cursor: 'pointer',
                          fontSize: 14,
                          color: '#F02849',
                          borderRadius: 6,
                          display: 'flex',
                          gap: 10,
                        }}
                      >
                        {' '}
                        Report User
                      </button>
                    </div>
                  )}
                  {profileMenuMsg && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '100%',
                        right: 0,
                        marginTop: 4,
                        background: C.text,
                        color: 'white',
                        padding: '6px 12px',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        zIndex: 101,
                      }}
                    >
                      {profileMenuMsg}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Profile Completion Indicator — own profile only */}
        {isOwnProfile &&
          !completionDismissed &&
          (() => {
            const fields = [
              { label: 'Profile Photo', done: !!profile.avatar_url },
              { label: 'Bio', done: !!profile.bio },
              { label: 'Location', done: !!(profile.city || profile.state) },
              { label: 'Cover Photo', done: !!profile.cover_photo_url },
              { label: 'Display Name', done: !!profile.full_name },
            ];
            // Auto-reset declined fields that user has since completed
            const activeDeclined = declinedFields.filter((label) => {
              const field = fields.find((f) => f.label === label);
              return field && !field.done; // Only keep declined if still not done
            });
            // Fields that count toward completion: done ones + declined ones
            const effectiveCompleted = fields.filter(
              (f) => f.done || activeDeclined.includes(f.label)
            ).length;
            const pct = Math.round((effectiveCompleted / fields.length) * 100);
            if (pct >= 100) return null; // Hide when effectively complete
            const missing = fields.filter((f) => !f.done && !activeDeclined.includes(f.label));
            if (missing.length === 0) return null;
            return (
              <div
                style={{
                  background: C.card,
                  borderRadius: 10,
                  padding: '14px 16px',
                  margin: '12px 16px 0',
                  border: `1px solid ${C.border}`,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 8,
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
                    Profile Completion
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      style={{ fontSize: 13, fontWeight: 700, color: pct >= 80 ? C.green : C.blue }}
                    >
                      {pct}%
                    </span>
                    <button
                      onClick={handleDismissCompletion}
                      title="Dismiss"
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: 14,
                        color: C.textSec,
                        padding: '0 2px',
                        lineHeight: 1,
                        opacity: 0.6,
                        transition: 'opacity 0.2s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                      onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.6')}
                    >
                      ✕
                    </button>
                  </div>
                </div>
                <div
                  style={{
                    width: '100%',
                    height: 6,
                    background: '#e4e6eb',
                    borderRadius: 3,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${pct}%`,
                      height: '100%',
                      borderRadius: 3,
                      background:
                        pct >= 80
                          ? 'linear-gradient(90deg, #42B72A, #2d8c1f)'
                          : 'linear-gradient(90deg, #1877F2, #42B72A)',
                      transition: 'width 0.6s ease',
                    }}
                  />
                </div>
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {missing.map((f) => (
                    <div
                      key={f.label}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '5px 10px',
                        borderRadius: 6,
                        background: 'rgba(24, 119, 242, 0.06)',
                      }}
                    >
                      <Link
                        href="/hub/profile-edit"
                        style={{
                          fontSize: 12,
                          color: C.blue,
                          textDecoration: 'none',
                          fontWeight: 600,
                          flex: 1,
                        }}
                      >
                        Add {f.label} →
                      </Link>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleDeclineField(f.label);
                        }}
                        title={`Skip ${f.label}`}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: 11,
                          color: C.textSec,
                          padding: '2px 4px',
                          opacity: 0.5,
                          transition: 'opacity 0.2s',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                        onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.5')}
                      >
                        Skip
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

        {/* TABS - All | Photos | Videos | Reels */}
        <div
          style={{
            display: 'flex',
            borderBottom: `1px solid ${C.border}`,
            marginTop: 16,
            background: C.card,
            padding: '0 16px',
            position: 'sticky',
            top: 0,
            zIndex: 50,
            boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
          }}
        >
          {['all', 'poker', 'photos', 'videos', 'reels', 'lives'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '14px 24px',
                background: 'none',
                border: 'none',
                fontSize: 15,
                fontWeight: 600,
                cursor: 'pointer',
                color: activeTab === tab ? C.blue : C.textSec,
                borderBottom: activeTab === tab ? `3px solid ${C.blue}` : '3px solid transparent',
                textTransform: 'capitalize',
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* TAB CONTENT */}
        <div style={{ padding: 16 }}>
          {/* ALL TAB */}
          {activeTab === 'all' && (
            <>
              {/* Poker Resume - At Top */}
              <PokerResumeBadge
                hendonData={profile}
                isOwnProfile={isOwnProfile}
                onOpenResume={(url) =>
                  setArticleReader({ open: true, url, title: 'HendonMob Poker Resume' })
                }
              />

              {/* Player Notes Component */}
              {!isOwnProfile && currentUser && profile && (
                <div style={{ marginBottom: 16 }}>
                  <PlayerNotes targetPlayerId={profile.id} targetPlayerName={profile.username} />
                </div>
              )}

              {/* Live Session Toggle (Own Profile Only) */}
              {isOwnProfile && currentUser && (
                <div style={{ marginBottom: 16 }}>
                  <LiveSessionToggle currentUser={currentUser} />
                </div>
              )}

              {/* Live Activity Feed — Friends Currently Playing */}
              {currentUser && (
                <div style={{ marginBottom: 16 }}>
                  <LiveActivityFeed currentUser={currentUser} />
                </div>
              )}

              {/* Viral Growth & Crews (Only for Own Profile) */}
              {isOwnProfile && (
                <>
                  <ViralGrowthModule currentUser={currentUser} />
                  <CrewDashboard currentUser={currentUser} />
                </>
              )}

              {/* Bio — below Poker Resume */}
              {profile.bio && (
                <div
                  style={{
                    background: C.card,
                    borderRadius: 12,
                    padding: 16,
                    marginBottom: 16,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                  }}
                >
                  <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: C.text }}>
                    About
                  </h3>
                  <div style={{ fontSize: 14, color: C.textSec, lineHeight: 1.5 }}>
                    {profile.bio.length > 150 && !bioExpanded ? (
                      <>
                        <HashtagRenderer text={profile.bio.slice(0, 150).trim() + '...'} />{' '}
                        <span
                          onClick={() => setBioExpanded(true)}
                          style={{ color: C.blue, cursor: 'pointer', fontWeight: 600 }}
                        >
                          See More
                        </span>
                      </>
                    ) : (
                      <>
                        <HashtagRenderer text={profile.bio} />
                        {profile.bio.length > 150 && (
                          <>
                            {' '}
                            <span
                              onClick={() => setBioExpanded(false)}
                              style={{ color: C.blue, cursor: 'pointer', fontWeight: 600 }}
                            >
                              See Less
                            </span>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Personal Details Card */}
              <div
                style={{
                  background: C.card,
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 16,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                }}
              >
                <h3 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700, color: C.text }}>
                  Personal Details
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {profile.city && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        fontSize: 14,
                        color: C.text,
                      }}
                    >
                      <span style={{ fontSize: 18 }}></span>
                      <span>
                        Lives In{' '}
                        <strong>
                          {profile.city}
                          {profile.state ? `, ${profile.state}` : ''}
                        </strong>
                      </span>
                    </div>
                  )}
                  {profile.hometown && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        fontSize: 14,
                        color: C.text,
                      }}
                    >
                      <span style={{ fontSize: 18 }}>🏠</span>
                      <span>
                        From <strong>{profile.hometown}</strong>
                      </span>
                    </div>
                  )}
                  {profile.birth_year && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        fontSize: 14,
                        color: C.text,
                      }}
                    >
                      <span style={{ fontSize: 18 }}>🎂</span>
                      <span>
                        Born In <strong>{profile.birth_year}</strong>
                      </span>
                    </div>
                  )}
                  {profile.favorite_game && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        fontSize: 14,
                        color: C.text,
                      }}
                    >
                      <span style={{ fontSize: 18 }}></span>
                      <span>
                        Favorite Game: <strong>{profile.favorite_game}</strong>
                      </span>
                    </div>
                  )}
                  {profile.home_casino && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        fontSize: 14,
                        color: C.text,
                      }}
                    >
                      <span style={{ fontSize: 18 }}>🏨</span>
                      <span>
                        Home Casino: <strong>{profile.home_casino}</strong>
                      </span>
                    </div>
                  )}
                  {profile.occupation && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        fontSize: 14,
                        color: C.text,
                      }}
                    >
                      <span style={{ fontSize: 18 }}>💼</span>
                      <span>
                        Works As <strong>{profile.occupation}</strong>
                      </span>
                    </div>
                  )}
                  {/* Favorite Hands — Hold'em and/or PLO */}
                  {(profile.favorite_hand || profile.favorite_hand_plo) &&
                    (() => {
                      const RANK_ORDER = {
                        a: 14,
                        k: 13,
                        q: 12,
                        j: 11,
                        10: 10,
                        9: 9,
                        8: 8,
                        7: 7,
                        6: 6,
                        5: 5,
                        4: 4,
                        3: 3,
                        2: 2,
                      };
                      const getRank = (code) => {
                        const r = code.split('_')[1];
                        return RANK_ORDER[r] || 0;
                      };
                      const renderHand = (handStr, label, tiltAngles) => {
                        if (!handStr) return null;
                        const cards = handStr.split(',').filter(Boolean);
                        if (cards.length === 0) return null;
                        const sorted = [...cards].sort((a, b) => getRank(b) - getRank(a));
                        return (
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 12,
                              fontSize: 14,
                              color: C.text,
                            }}
                          >
                            <span>{label}:</span>
                            {handStr.includes('_') ? (
                              <div
                                style={{
                                  display: 'flex',
                                  gap: 0,
                                  position: 'relative',
                                  paddingLeft: 4,
                                  paddingRight: 4,
                                }}
                              >
                                {sorted.map((code, idx) => (
                                  <img
                                    key={idx}
                                    src={`/cards/${code}.png`}
                                    alt={code}
                                    style={{
                                      width: 40,
                                      height: 56,
                                      borderRadius: 5,
                                      border: '2px solid #1877F2',
                                      boxShadow:
                                        '0 0 10px rgba(24,119,242,0.35), 0 2px 6px rgba(0,0,0,0.2)',
                                      transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                                      transform: `rotate(${tiltAngles[idx] || 0}deg)`,
                                      marginLeft: idx > 0 ? -6 : 0,
                                      zIndex: idx,
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.transform = `rotate(${tiltAngles[idx] || 0}deg) scale(1.12)`;
                                      e.currentTarget.style.boxShadow =
                                        '0 0 16px rgba(24,119,242,0.5)';
                                      e.currentTarget.style.zIndex = 10;
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.transform = `rotate(${tiltAngles[idx] || 0}deg) scale(1)`;
                                      e.currentTarget.style.boxShadow =
                                        '0 0 10px rgba(24,119,242,0.35), 0 2px 6px rgba(0,0,0,0.2)';
                                      e.currentTarget.style.zIndex = idx;
                                    }}
                                  />
                                ))}
                              </div>
                            ) : (
                              <strong>{handStr}</strong>
                            )}
                          </div>
                        );
                      };
                      return (
                        <>
                          {renderHand(profile.favorite_hand, 'Favorite Hand', [-5, 5])}
                          {renderHand(
                            profile.favorite_hand_plo,
                            'Favorite PLO Hand',
                            [-6, -2, 2, 6]
                          )}
                        </>
                      );
                    })()}
                  {/* Social Media Links */}
                  {(profile.instagram || profile.twitter || profile.website) && (
                    <div
                      style={{
                        borderTop: `1px solid ${C.border}`,
                        paddingTop: 12,
                        marginTop: 4,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      {profile.instagram && (
                        <a
                          href={`https://instagram.com/${profile.instagram.replace('@', '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            fontSize: 14,
                            color: C.blue,
                            textDecoration: 'none',
                          }}
                        >
                          <span style={{ fontSize: 18 }}>📸</span>
                          <span>@{profile.instagram.replace('@', '')}</span>
                        </a>
                      )}
                      {profile.twitter && (
                        <a
                          href={`https://x.com/${profile.twitter.replace('@', '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            fontSize: 14,
                            color: C.blue,
                            textDecoration: 'none',
                          }}
                        >
                          <span style={{ fontSize: 18 }}>𝕏</span>
                          <span>@{profile.twitter.replace('@', '')}</span>
                        </a>
                      )}
                      {profile.website && (
                        <a
                          href={
                            profile.website.startsWith('http')
                              ? profile.website
                              : `https://${profile.website}`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            fontSize: 14,
                            color: C.blue,
                            textDecoration: 'none',
                          }}
                        >
                          <span style={{ fontSize: 18 }}>🌐</span>
                          <span>{profile.website.replace(/^https?:\/\//, '')}</span>
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Friends Section */}
              {(friends.length > 0 || loading) && (
                <div
                  style={{
                    background: C.card,
                    borderRadius: 12,
                    padding: 16,
                    marginBottom: 16,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 12,
                    }}
                  >
                    <div>
                      <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.text }}>
                        Friends
                      </h3>
                      <div style={{ fontSize: 14, color: C.textSec }}>{stats.friends} friends</div>
                    </div>
                    <button
                      onClick={() => setShowFriendsModal(true)}
                      style={{
                        color: C.blue,
                        fontSize: 14,
                        fontWeight: 500,
                        textDecoration: 'none',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    >
                      See All
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                    {friends.length > 0
                      ? friends
                          .slice(0, 8)
                          .map((friend) => <FriendAvatar key={friend.id} friend={friend} />)
                      : /* Shimmer skeleton placeholders */
                        Array.from({ length: 8 }).map((_, i) => (
                          <div key={`shimmer-${i}`} style={{ textAlign: 'center' }}>
                            <div
                              style={{
                                width: '100%',
                                paddingBottom: '100%',
                                borderRadius: '50%',
                                background:
                                  'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)',
                                backgroundSize: '200% 100%',
                                animation: 'shimmer 1.5s infinite',
                              }}
                            />
                            <div
                              style={{
                                height: 10,
                                borderRadius: 5,
                                marginTop: 8,
                                width: '70%',
                                margin: '8px auto 0',
                                background:
                                  'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)',
                                backgroundSize: '200% 100%',
                                animation: 'shimmer 1.5s infinite',
                              }}
                            />
                          </div>
                        ))}
                  </div>
                  <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
                </div>
              )}

              {/* All Posts Section */}
              <div style={{ marginTop: 16 }}>
                <h3 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700, color: C.text }}>
                  All Posts
                </h3>

                {/* Post Composer (for own profile) */}
                {isOwnProfile && currentUser && (
                  <div
                    style={{
                      background: C.card,
                      borderRadius: 12,
                      padding: 16,
                      marginBottom: 16,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                    }}
                  >
                    {!showPostComposer ? (
                      <div
                        style={{
                          display: 'flex',
                          gap: 12,
                          alignItems: 'center',
                          cursor: 'pointer',
                        }}
                        onClick={() => setShowPostComposer(true)}
                      >
                        <img
                          src={
                            profile.avatar_url ||
                            currentUser.user_metadata?.avatar_url ||
                            '/default-avatar.png'
                          }
                          alt="User avatar"
                          width={40}
                          height={40}
                          style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }}
                          loading="lazy"
                          decoding="async"
                        />
                        <div
                          style={{
                            flex: 1,
                            padding: '10px 16px',
                            background: C.bg,
                            borderRadius: 20,
                            color: C.textSec,
                            fontSize: 15,
                          }}
                        >
                          What's on your mind,{' '}
                          {profile.full_name?.split(' ')[0] || profile.username}?
                        </div>
                      </div>
                    ) : (
                      <>
                        <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                          <img
                            src={
                              profile.avatar_url ||
                              currentUser.user_metadata?.avatar_url ||
                              '/default-avatar.png'
                            }
                            alt="User avatar"
                            width={40}
                            height={40}
                            style={{
                              width: 40,
                              height: 40,
                              borderRadius: '50%',
                              objectFit: 'cover',
                            }}
                            loading="lazy"
                            decoding="async"
                          />
                          <textarea
                            value={postContent}
                            onChange={(e) => setPostContent(e.target.value)}
                            placeholder={`What's on your mind, ${profile.full_name?.split(' ')[0] || profile.username}?`}
                            style={{
                              flex: 1,
                              minHeight: 80,
                              padding: 12,
                              border: 'none',
                              borderRadius: 8,
                              fontSize: 15,
                              resize: 'vertical',
                              outline: 'none',
                              fontFamily: 'inherit',
                            }}
                            autoFocus
                          />
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            gap: 8,
                            justifyContent: 'flex-end',
                            borderTop: `1px solid ${C.border}`,
                            paddingTop: 12,
                          }}
                        >
                          <button
                            onClick={() => {
                              setShowPostComposer(false);
                              setPostContent('');
                            }}
                            style={{
                              padding: '8px 16px',
                              borderRadius: 6,
                              border: 'none',
                              background: C.bg,
                              color: C.text,
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            Cancel
                          </button>
                          <button
                            onClick={async () => {
                              const success = await handlePost(postContent);
                              if (success) {
                                setPostContent('');
                                setShowPostComposer(false);
                              }
                            }}
                            disabled={!postContent.trim() || isPosting}
                            style={{
                              padding: '8px 20px',
                              borderRadius: 6,
                              border: 'none',
                              background: C.blue,
                              color: 'white',
                              fontWeight: 600,
                              cursor: postContent.trim() && !isPosting ? 'pointer' : 'not-allowed',
                              opacity: postContent.trim() && !isPosting ? 1 : 0.5,
                            }}
                          >
                            {isPosting ? 'Posting...' : 'Post'}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* See All Media Links */}
                {(photos.length > 0 || videos.length > 0) && (
                  <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                    {photos.length > 0 && (
                      <button
                        onClick={() => setActiveTab('photos')}
                        style={{
                          flex: 1,
                          padding: '10px 16px',
                          background: C.card,
                          border: `1px solid ${C.border}`,
                          borderRadius: 8,
                          fontSize: 13,
                          fontWeight: 600,
                          color: C.blue,
                          cursor: 'pointer',
                          transition: 'background 0.2s',
                        }}
                      >
                        📸 See All Photos ({photos.length})
                      </button>
                    )}
                    {videos.length > 0 && (
                      <button
                        onClick={() => setActiveTab('videos')}
                        style={{
                          flex: 1,
                          padding: '10px 16px',
                          background: C.card,
                          border: `1px solid ${C.border}`,
                          borderRadius: 8,
                          fontSize: 13,
                          fontWeight: 600,
                          color: C.blue,
                          cursor: 'pointer',
                          transition: 'background 0.2s',
                        }}
                      >
                        🎬 See All Videos ({videos.length})
                      </button>
                    )}
                  </div>
                )}

                {/* Posts Feed */}
                {posts.length > 0 ? (
                  posts.map((post) => (
                    <PostCard
                      key={post.id}
                      post={post}
                      author={profile}
                      isOwnProfile={isOwnProfile}
                      onDelete={handleDeletePost}
                      onPostEdited={(updatedPost) => {
                        setPosts((prev) =>
                          prev.map((p) => (p.id === updatedPost.id ? { ...p, ...updatedPost } : p))
                        );
                        invalidateProfileCache();
                      }}
                      currentUserId={currentUser?.id}
                      currentUser={currentUser}
                      horseProfileIds={horseProfileIds}
                    />
                  ))
                ) : (
                  <div
                    style={{
                      background: C.card,
                      borderRadius: 12,
                      padding: 40,
                      textAlign: 'center',
                      color: C.textSec,
                    }}
                  >
                    <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.6 }}>📝</div>
                    <p style={{ fontWeight: 600, fontSize: 16, margin: '0 0 4px', color: C.text }}>
                      {isOwnProfile ? 'Share Your First Post' : 'No Posts Yet'}
                    </p>
                    <p style={{ fontSize: 13, margin: 0 }}>
                      {isOwnProfile
                        ? "Tell the poker community what you're up to!"
                        : `${displayName} hasn't shared any posts yet.`}
                    </p>
                  </div>
                )}
              </div>
            </>
          )}

          {/* POKER ACTIVITY TAB */}
          {activeTab === 'poker' && (
            <div>
              {/* Followed Pages */}
              <div
                style={{
                  background: C.card,
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 16,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                }}
              >
                <h3 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700, color: C.text }}>
                  Followed Pages
                </h3>
                {pokerFollowing.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {pokerFollowing.map((f, i) => {
                      var pageUrl =
                        f.page_type === 'venue'
                          ? `/hub/venues/${f.page_id}`
                          : f.page_type === 'tour'
                            ? `/hub/tours/${f.page_id}`
                            : f.page_type === 'series'
                              ? `/hub/series/${f.page_id}`
                              : '/hub/pages';
                      var typeLabel =
                        f.page_type === 'venue'
                          ? 'Venue'
                          : f.page_type === 'tour'
                            ? 'Tour'
                            : f.page_type === 'series'
                              ? 'Series'
                              : 'Page';
                      var typeColor =
                        f.page_type === 'venue'
                          ? '#1877F2'
                          : f.page_type === 'tour'
                            ? '#E74C3C'
                            : '#F39C12';
                      return (
                        <Link key={f.id || i} href={pageUrl} style={{ textDecoration: 'none' }}>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 12,
                              padding: '10px 12px',
                              borderRadius: 8,
                              border: `1px solid ${C.border}`,
                              transition: 'background 0.15s',
                              cursor: 'pointer',
                            }}
                          >
                            <div
                              style={{
                                width: 40,
                                height: 40,
                                borderRadius: 8,
                                background: typeColor + '18',
                                color: typeColor,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 700,
                                fontSize: 14,
                                flexShrink: 0,
                              }}
                            >
                              {typeLabel.charAt(0)}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div
                                style={{
                                  fontWeight: 600,
                                  fontSize: 14,
                                  color: C.text,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {f.page_name ||
                                  (f.page_id && f.page_id.length > 20
                                    ? `${typeLabel} Page`
                                    : f.page_id)}
                              </div>
                              <div style={{ fontSize: 12, color: C.textSec }}>{typeLabel}</div>
                            </div>
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke={C.textSec}
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polyline points="9 18 15 12 9 6" />
                            </svg>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: 20, color: C.textSec }}>
                    <p style={{ margin: 0 }}>No Followed Pages Yet</p>
                    <Link
                      href="/hub/pages"
                      style={{
                        color: C.blue,
                        fontWeight: 600,
                        fontSize: 14,
                        marginTop: 8,
                        display: 'inline-block',
                        textDecoration: 'none',
                      }}
                    >
                      Browse Pages
                    </Link>
                  </div>
                )}
              </div>

              {/* Check-In Badges */}
              {checkinBadges.length > 0 && (
                <div
                  style={{
                    background: C.card,
                    borderRadius: 12,
                    padding: 16,
                    marginBottom: 16,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                  }}
                >
                  <h3 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 700, color: C.text }}>
                    Check-In Badges
                  </h3>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {checkinBadges.map(function (b) {
                      var tierColor =
                        b.tier === 'platinum'
                          ? '#e5e7eb'
                          : b.tier === 'gold'
                            ? '#f59e0b'
                            : b.tier === 'silver'
                              ? '#94a3b8'
                              : '#92400e';
                      return (
                        <div
                          key={b.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '6px 10px',
                            borderRadius: 20,
                            background: `${tierColor}15`,
                            border: `1px solid ${tierColor}30`,
                            fontSize: 12,
                            fontWeight: 600,
                            color: tierColor,
                          }}
                        >
                          <span style={{ fontSize: 14 }}>{b.icon}</span>
                          {b.name}
                        </div>
                      );
                    })}
                  </div>
                  {/* Next Badge Progress */}
                  {checkinBadges._nextBadge && (
                    <div
                      style={{
                        marginTop: 12,
                        padding: '10px 12px',
                        borderRadius: 8,
                        background: 'rgba(59,130,246,0.06)',
                        border: '1px solid rgba(59,130,246,0.12)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: 6,
                        }}
                      >
                        <span style={{ fontSize: 12, color: C.textSec }}>
                          Next: <b style={{ color: C.text }}>{checkinBadges._nextBadge.name}</b>
                        </span>
                        <span style={{ fontSize: 11, color: '#3b82f6', fontWeight: 700 }}>
                          {checkinBadges._nextBadge.current}/{checkinBadges._nextBadge.threshold}
                        </span>
                      </div>
                      <div
                        style={{
                          height: 6,
                          borderRadius: 3,
                          background: 'rgba(59,130,246,0.1)',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            height: '100%',
                            borderRadius: 3,
                            background: 'linear-gradient(90deg, #3b82f6, #60a5fa)',
                            width: Math.round(checkinBadges._nextBadge.progress * 100) + '%',
                            transition: 'width 0.6s ease',
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Check-In Stats Card */}
              {checkinStats && checkinStats.totalCheckins > 0 && (
                <div
                  style={{
                    background: C.card,
                    borderRadius: 12,
                    padding: 16,
                    marginBottom: 16,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                  }}
                >
                  <h3 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 700, color: C.text }}>
                    Check-In Stats
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {[
                      {
                        val: checkinStats.totalCheckins,
                        label: 'Total Check-Ins',
                        color: '#22c55e',
                      },
                      { val: checkinStats.uniqueVenues, label: 'Venues Visited', color: '#3b82f6' },
                      { val: checkinStats.uniqueStates, label: 'States', color: '#a78bfa' },
                      { val: checkinStats.avgPerWeek, label: 'Avg / Week', color: '#f59e0b' },
                    ].map(function (stat) {
                      return (
                        <div
                          key={stat.label}
                          style={{
                            padding: '12px',
                            borderRadius: 10,
                            background: `${stat.color}10`,
                            border: `1px solid ${stat.color}25`,
                            textAlign: 'center',
                          }}
                        >
                          <div style={{ fontSize: 22, fontWeight: 800, color: stat.color }}>
                            {stat.val}
                          </div>
                          <div style={{ fontSize: 11, color: C.textSec, marginTop: 2 }}>
                            {stat.label}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {checkinStats.favoriteVenue && (
                    <div
                      style={{
                        marginTop: 10,
                        padding: '8px 12px',
                        borderRadius: 8,
                        background: 'rgba(245,158,11,0.08)',
                        border: '1px solid rgba(245,158,11,0.15)',
                        fontSize: 13,
                      }}
                    >
                      <span style={{ color: C.textSec }}>Favorite Venue:</span>{' '}
                      <Link
                        href={'/hub/venues/' + checkinStats.favoriteVenue.id}
                        style={{ color: '#f59e0b', fontWeight: 600, textDecoration: 'none' }}
                      >
                        {checkinStats.favoriteVenue.name}
                      </Link>
                      <span style={{ color: C.textSec }}>
                        {' '}
                        ({checkinStats.favoriteVenue.count} visits)
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Check-In Map Mini */}
              {pokerCheckins.length > 0 && (
                <div
                  style={{
                    background: C.card,
                    borderRadius: 12,
                    padding: 16,
                    marginBottom: 16,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                  }}
                >
                  <h3 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 700, color: C.text }}>
                    Check-In Map
                  </h3>
                  <div
                    style={{
                      height: 160,
                      borderRadius: 8,
                      overflow: 'hidden',
                      background: 'rgba(59,130,246,0.05)',
                      border: '1px solid ' + C.border,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      position: 'relative',
                    }}
                  >
                    <div style={{ textAlign: 'center', color: C.textSec, fontSize: 13 }}>
                      <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#3b82f6"
                        strokeWidth="2"
                        style={{ display: 'block', margin: '0 auto 6px' }}
                      >
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                        <circle cx="12" cy="10" r="3" />
                      </svg>
                      {pokerCheckins.length} check-in{pokerCheckins.length !== 1 ? 's' : ''} across{' '}
                      {checkinStats?.uniqueVenues || '—'} venues
                    </div>
                  </div>
                </div>
              )}

              {/* Check-In Heatmap */}
              {checkinHeatmap && checkinHeatmap.dailyTotals && checkinHeatmap.totalCheckins > 0 && (
                <div
                  style={{
                    background: C.card,
                    borderRadius: 12,
                    padding: 16,
                    marginBottom: 16,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                  }}
                >
                  <h3 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 700, color: C.text }}>
                    Activity Pattern
                  </h3>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 60 }}>
                    {checkinHeatmap.dailyTotals.map(function (dt) {
                      var maxT = Math.max(
                        ...checkinHeatmap.dailyTotals.map(function (x) {
                          return x.total;
                        }),
                        1
                      );
                      var pct = Math.max(8, (dt.total / maxT) * 100);
                      var intensity = dt.total / maxT;
                      var barColor =
                        intensity > 0.7
                          ? '#22c55e'
                          : intensity > 0.3
                            ? '#60a5fa'
                            : intensity > 0
                              ? 'rgba(96,165,250,0.3)'
                              : 'rgba(255,255,255,0.05)';
                      return (
                        <div key={dt.day} style={{ flex: 1, textAlign: 'center' }}>
                          <div
                            style={{
                              height: pct + '%',
                              minHeight: 4,
                              background: barColor,
                              borderRadius: 3,
                              transition: 'height 0.4s ease',
                              marginBottom: 4,
                            }}
                            title={dt.day + ': ' + dt.total}
                          />
                          <div style={{ fontSize: 10, color: C.textSec }}>{dt.day}</div>
                        </div>
                      );
                    })}
                  </div>
                  {checkinHeatmap.peakDay && (
                    <div
                      style={{ fontSize: 11, color: C.textSec, marginTop: 8, textAlign: 'center' }}
                    >
                      Most active: <b style={{ color: C.text }}>{checkinHeatmap.peakDay}</b> at{' '}
                      <b style={{ color: C.text }}>
                        {checkinHeatmap.peakHour === 0
                          ? '12a'
                          : checkinHeatmap.peakHour < 12
                            ? checkinHeatmap.peakHour + 'a'
                            : checkinHeatmap.peakHour === 12
                              ? '12p'
                              : checkinHeatmap.peakHour - 12 + 'p'}
                      </b>
                    </div>
                  )}
                </div>
              )}

              {/* Recent Check-ins */}
              <div
                style={{
                  background: C.card,
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 16,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 16,
                  }}
                >
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.text }}>
                    Recent Check-Ins
                  </h3>
                  {pokerCheckins.length > 10 && (
                    <button
                      onClick={function () {
                        var el = document.getElementById('checkins-list');
                        if (el)
                          el.dataset.expanded = el.dataset.expanded === 'true' ? 'false' : 'true';
                        // Force re-render
                        var btn = document.getElementById('checkins-toggle');
                        if (btn)
                          btn.textContent =
                            el && el.dataset.expanded === 'true'
                              ? 'Show Less'
                              : 'View All (' + pokerCheckins.length + ')';
                      }}
                      id="checkins-toggle"
                      style={{
                        background: 'none',
                        border: 'none',
                        color: C.blue,
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    >
                      View All ({pokerCheckins.length})
                    </button>
                  )}
                </div>
                {pokerCheckins.length > 0 ? (
                  <div
                    id="checkins-list"
                    data-expanded="false"
                    style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
                  >
                    {pokerCheckins.slice(0, 10).map((c, i) => {
                      var venueUrl = `/hub/venues/${c.venue_id}`;
                      return (
                        <Link key={c.id || i} href={venueUrl} style={{ textDecoration: 'none' }}>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 12,
                              padding: '10px 12px',
                              borderRadius: 8,
                              border: `1px solid ${C.border}`,
                              cursor: 'pointer',
                            }}
                          >
                            <div
                              style={{
                                width: 40,
                                height: 40,
                                borderRadius: 8,
                                background: 'rgba(66,183,42,0.1)',
                                color: '#42B72A',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                              }}
                            >
                              <svg
                                width="18"
                                height="18"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                                <circle cx="12" cy="10" r="3" />
                              </svg>
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div
                                style={{
                                  fontWeight: 600,
                                  fontSize: 14,
                                  color: C.text,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {c.venue_name || 'Unknown Venue'}
                              </div>
                              <div style={{ fontSize: 12, color: C.textSec }}>
                                {c.venue_city && c.venue_state
                                  ? `${c.venue_city}, ${c.venue_state} · `
                                  : ''}
                                {c.created_at ? timeAgo(c.created_at) : ''}
                              </div>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: 20, color: C.textSec }}>
                    <p style={{ margin: 0 }}>No Check-Ins Yet</p>
                    <Link
                      href="/hub/poker-near-me/lobby"
                      style={{
                        color: C.blue,
                        fontWeight: 600,
                        fontSize: 14,
                        marginTop: 8,
                        display: 'inline-block',
                        textDecoration: 'none',
                      }}
                    >
                      Find Nearby Venues
                    </Link>
                  </div>
                )}
              </div>

              {/* Quick Links */}
              <div
                style={{
                  background: C.card,
                  borderRadius: 12,
                  padding: 16,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                }}
              >
                <h3 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 700, color: C.text }}>
                  Poker Hub
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    {
                      href: '/hub/pages',
                      label: 'Browse All Pages',
                      icon: 'M2 3h20v18H2V3zm0 6h20',
                    },
                    {
                      href: '/hub/poker-near-me/lobby',
                      label: 'Poker Near Me',
                      icon: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z',
                    },
                    {
                      href: '/hub/daily-tournaments',
                      label: 'Daily Tournaments',
                      icon: 'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z',
                    },
                    {
                      href: '/hub/promotions',
                      label: 'Promotions & Deals',
                      icon: 'M2 5h20v14H2V5zm0 5h20',
                    },
                  ].map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 12px',
                        borderRadius: 8,
                        textDecoration: 'none',
                        color: C.text,
                        fontSize: 14,
                        fontWeight: 500,
                        border: `1px solid ${C.border}`,
                        transition: 'background 0.15s',
                      }}
                    >
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke={C.blue}
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d={link.icon} />
                      </svg>
                      {link.label}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* PHOTOS TAB */}
          {activeTab === 'photos' && (
            <div>
              <h3 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700, color: C.text }}>
                Photos
              </h3>
              {photos.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
                  {photos.map((photo) =>
                    photo.media_urls?.map((url, i) => (
                      <div
                        key={`${photo.id}-${i}`}
                        style={{
                          aspectRatio: '1',
                          overflow: 'hidden',
                          cursor: 'pointer',
                          borderRadius: 4,
                          position: 'relative',
                        }}
                        onClick={() => setLightboxUrl(url)}
                      >
                        <img
                          src={url}
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            transition: 'opacity 0.3s',
                          }}
                          alt="Photo"
                          loading="lazy"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            e.currentTarget.parentNode.style.background = '#e4e6eb';
                            e.currentTarget.parentNode.innerHTML =
                              '<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;color:#999;font-size:12px">Photo unavailable</div>';
                          }}
                        />
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div
                  style={{
                    background: C.card,
                    borderRadius: 12,
                    padding: 40,
                    textAlign: 'center',
                    color: C.textSec,
                  }}
                >
                  <svg
                    width="48"
                    height="48"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={C.textSec}
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ opacity: 0.4, marginBottom: 12 }}
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                  <p style={{ fontWeight: 600, fontSize: 16, margin: '0 0 4px', color: C.text }}>
                    {isOwnProfile ? 'Share Your First Photo' : 'No Photos Yet'}
                  </p>
                  <p style={{ fontSize: 13, margin: '0 0 12px' }}>
                    {isOwnProfile
                      ? 'Post photos to build your poker portfolio!'
                      : `${displayName} hasn't shared any photos yet.`}
                  </p>
                  {isOwnProfile && (
                    <Link
                      href="/hub/social-media"
                      style={{
                        display: 'inline-block',
                        padding: '8px 20px',
                        background: C.blue,
                        color: 'white',
                        borderRadius: 8,
                        fontWeight: 600,
                        fontSize: 13,
                        textDecoration: 'none',
                      }}
                    >
                      Create a Post
                    </Link>
                  )}
                </div>
              )}
            </div>
          )}

          {/* VIDEOS TAB */}
          {activeTab === 'videos' && (
            <div>
              <h3 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700, color: C.text }}>
                Videos
              </h3>
              {videos.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                  {videos.map((video) =>
                    video.media_urls?.map((url, i) => (
                      <div
                        key={`${video.id}-${i}`}
                        style={{ overflow: 'hidden', borderRadius: 8, background: '#000' }}
                      >
                        <ProfileVideoCard url={url} postId={video.id} />
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div
                  style={{
                    background: C.card,
                    borderRadius: 12,
                    padding: 40,
                    textAlign: 'center',
                    color: C.textSec,
                  }}
                >
                  <svg
                    width="48"
                    height="48"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={C.textSec}
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ opacity: 0.4, marginBottom: 12 }}
                  >
                    <polygon points="23 7 16 12 23 17 23 7" />
                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                  </svg>
                  <p style={{ fontWeight: 600, fontSize: 16, margin: '0 0 4px', color: C.text }}>
                    {isOwnProfile ? 'Upload Your First Video' : 'No Videos Yet'}
                  </p>
                  <p style={{ fontSize: 13, margin: '0 0 12px' }}>
                    {isOwnProfile
                      ? 'Share hand replays, vlogs, and poker content!'
                      : `${displayName} hasn't shared any videos yet.`}
                  </p>
                  {isOwnProfile && (
                    <Link
                      href="/hub/social-media"
                      style={{
                        display: 'inline-block',
                        padding: '8px 20px',
                        background: C.blue,
                        color: 'white',
                        borderRadius: 8,
                        fontWeight: 600,
                        fontSize: 13,
                        textDecoration: 'none',
                      }}
                    >
                      Create a Post
                    </Link>
                  )}
                </div>
              )}
            </div>
          )}

          {/* REELS TAB */}
          {activeTab === 'reels' && (
            <div>
              <h3 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700, color: C.text }}>
                Reels
              </h3>
              {reels.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
                  {reels.map((reel) => (
                    <div key={reel.id} style={{ position: 'relative' }}>
                      <Link href={`/hub/reels?id=${reel.id}`} style={{ textDecoration: 'none' }}>
                        <div
                          style={{
                            aspectRatio: '9/16',
                            position: 'relative',
                            overflow: 'hidden',
                            borderRadius: 8,
                            background: '#000',
                          }}
                        >
                          {reel.thumbnail_url ? (
                            <img
                              src={reel.thumbnail_url}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              alt="Video thumbnail"
                              loading="lazy"
                            />
                          ) : (
                            <video
                              src={reel.video_url}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              muted
                            />
                          )}
                          <div
                            style={{
                              position: 'absolute',
                              bottom: 8,
                              left: 8,
                              color: 'white',
                              fontSize: 12,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            ▶️ {reel.view_count || 0}
                          </div>
                        </div>
                      </Link>
                      {/* Own-profile delete affordance — many older reels have
                                                source_post_id=NULL and won't cascade when a post is
                                                deleted, so the only way to remove them is a direct
                                                reel delete. See handleDeleteReel above. */}
                      {isOwnProfile && (
                        <button
                          type="button"
                          aria-label="Delete this reel"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleDeleteReel(reel.id);
                          }}
                          style={{
                            position: 'absolute',
                            top: 6,
                            right: 6,
                            width: 28,
                            height: 28,
                            borderRadius: '50%',
                            background: 'rgba(0,0,0,0.65)',
                            color: '#ff5560',
                            border: '1px solid rgba(255,255,255,0.18)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: 0,
                            zIndex: 2,
                          }}
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden
                          >
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                            <path d="M10 11v6" />
                            <path d="M14 11v6" />
                            <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  style={{
                    background: C.card,
                    borderRadius: 12,
                    padding: 40,
                    textAlign: 'center',
                    color: C.textSec,
                  }}
                >
                  <svg
                    width="48"
                    height="48"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={C.textSec}
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ opacity: 0.4, marginBottom: 12 }}
                  >
                    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                    <line x1="12" y1="11" x2="12" y2="17" />
                    <line x1="9" y1="14" x2="15" y2="14" />
                  </svg>
                  <p style={{ fontWeight: 600, fontSize: 16, margin: '0 0 4px', color: C.text }}>
                    {isOwnProfile ? 'Create Your First Reel' : 'No Reels Yet'}
                  </p>
                  <p style={{ fontSize: 13, margin: '0 0 12px' }}>
                    {isOwnProfile
                      ? 'Short-form poker content gets more engagement!'
                      : `${displayName} hasn't created any reels yet.`}
                  </p>
                  {isOwnProfile && (
                    <Link
                      href="/hub/social-media"
                      style={{
                        display: 'inline-block',
                        padding: '8px 20px',
                        background: C.blue,
                        color: 'white',
                        borderRadius: 8,
                        fontWeight: 600,
                        fontSize: 13,
                        textDecoration: 'none',
                      }}
                    >
                      Create a Reel
                    </Link>
                  )}
                </div>
              )}
            </div>
          )}
          {/* LIVES TAB */}
          {activeTab === 'lives' && (
            <div>
              <h3 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700, color: C.text }}>
                Past Lives
              </h3>
              {pastLives.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                  {pastLives.map((live) => (
                    <div key={live.id} style={{ position: 'relative' }}>
                      <Link href={`/hub/lives?id=${live.id}`} style={{ textDecoration: 'none' }}>
                        <div
                          style={{
                            borderRadius: 12,
                            overflow: 'hidden',
                            background: '#000',
                            position: 'relative',
                            aspectRatio: '16/9',
                          }}
                        >
                          {/* Bug8: fall back to social_posts thumbnail if live_streams.thumbnail_url is missing */}
                          {(() => {
                            const effectiveThumbnail =
                              live.thumbnail_url ||
                              live.social_posts?.thumbnail_url ||
                              (Array.isArray(live.social_posts?.media_urls) && live.social_posts.media_urls[0]) ||
                              null;
                            return effectiveThumbnail ? (
                              <img
                                src={effectiveThumbnail}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                alt={live.title}
                                loading="lazy"
                                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                              />
                            ) : (
                              <div
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: 'rgba(255,255,255,0.5)',
                                  fontSize: 36,
                                }}
                              >
                                📺
                              </div>
                            );
                          })()}
                          <div
                            style={{
                              position: 'absolute',
                              bottom: 0,
                              left: 0,
                              right: 0,
                              padding: '24px 10px 8px',
                              background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)',
                            }}
                          >
                            <div
                              style={{
                                color: 'white',
                                fontSize: 13,
                                fontWeight: 600,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {live.title || 'Live Replay'}
                            </div>
                            <div
                              style={{
                                color: 'rgba(255,255,255,0.65)',
                                fontSize: 11,
                                marginTop: 2,
                              }}
                            >
                              👁 {live.viewer_count || 0} ·{' '}
                              {new Date(live.created_at).toLocaleDateString()}
                            </div>
                          </div>
                          <div
                            style={{
                              position: 'absolute',
                              top: 8,
                              left: 8,
                              background: '#FA383E',
                              color: 'white',
                              fontSize: 10,
                              fontWeight: 700,
                              padding: '3px 7px',
                              borderRadius: 4,
                            }}
                          >
                            LIVE
                          </div>
                        </div>
                      </Link>
                      {/* Own-profile delete affordance — symmetric to the trash-icon
                                                on the Reels tab. live_streams has no direct cascade FROM
                                                social_posts (the FK is SET NULL), so a "delete the post"
                                                path leaves the stream orphaned. This button calls
                                                handleDeleteLive which removes the stream + cascade-cleans
                                                viewers/comments/reactions + nukes the feed-post entry. */}
                      {isOwnProfile && (
                        <button
                          type="button"
                          aria-label="Delete this live replay"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleDeleteLive(live.id, live.feed_post_id);
                          }}
                          style={{
                            position: 'absolute',
                            top: 8,
                            right: 8,
                            width: 28,
                            height: 28,
                            borderRadius: '50%',
                            background: 'rgba(0,0,0,0.65)',
                            color: '#ff5560',
                            border: '1px solid rgba(255,255,255,0.18)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: 0,
                            zIndex: 2,
                          }}
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden
                          >
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                            <path d="M10 11v6" />
                            <path d="M14 11v6" />
                            <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  style={{
                    background: C.card,
                    borderRadius: 12,
                    padding: 40,
                    textAlign: 'center',
                    color: C.textSec,
                  }}
                >
                  <div style={{ fontSize: 40, marginBottom: 12 }}>🔴</div>
                  <p style={{ fontWeight: 600, fontSize: 16, margin: '0 0 4px', color: C.text }}>
                    {isOwnProfile ? 'No Past Lives Yet' : 'No Past Lives'}
                  </p>
                  <p style={{ fontSize: 13, margin: '0 0 12px' }}>
                    {isOwnProfile
                      ? 'Go live and post the replay to see it here.'
                      : `${displayName} hasn't posted any live replays.`}
                  </p>
                  {isOwnProfile && (
                    <Link
                      href="/hub/social-media"
                      style={{
                        display: 'inline-block',
                        padding: '8px 20px',
                        background: '#FA383E',
                        color: 'white',
                        borderRadius: 8,
                        fontWeight: 600,
                        fontSize: 13,
                        textDecoration: 'none',
                      }}
                    >
                      Go Live
                    </Link>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom padding */}
        <div style={{ height: 80 }} />
      </div>

      {/* Unfriend Confirmation Modal */}
      {showUnfriendConfirm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setShowUnfriendConfirm(false)}
        >
          <div
            style={{
              background: C.card,
              borderRadius: 12,
              padding: 24,
              maxWidth: 320,
              width: '100%',
              boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 12 }}>
              Unfriend {profile?.username || profile?.full_name}?
            </div>
            <div style={{ fontSize: 14, color: C.textSec, marginBottom: 20 }}>
              Are you sure you want to remove this person from your friends list?
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setShowUnfriendConfirm(false)}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  background: '#e4e6eb',
                  color: C.text,
                  border: 'none',
                  borderRadius: 8,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleRemoveFriend}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  background: '#F02849',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Unfriend
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Block User Confirmation Modal */}
      {showBlockConfirm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setShowBlockConfirm(false)}
        >
          <div
            style={{
              background: C.card,
              borderRadius: 12,
              padding: 24,
              maxWidth: 320,
              width: '100%',
              boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 12 }}>
              Block {profile?.username || profile?.full_name}?
            </div>
            <div style={{ fontSize: 14, color: C.textSec, marginBottom: 20 }}>
              They won't be able to see your posts or message you.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setShowBlockConfirm(false)}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  background: '#e4e6eb',
                  color: C.text,
                  border: 'none',
                  borderRadius: 8,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                id="block-confirm-btn"
                onClick={async (e) => {
                  const btn = e.currentTarget;
                  if (btn.disabled) return;
                  btn.disabled = true;
                  btn.textContent = 'Blocking...';
                  if (!currentUser?.id || !profile?.id) {
                    setProfileMenuMsg('Please log in');
                    setTimeout(() => setProfileMenuMsg(''), 2000);
                    setShowBlockConfirm(false);
                    btn.disabled = false;
                    btn.textContent = 'Block';
                    return;
                  }
                  try {
                    // BUG-FIX-LIVE-AUDIT (B2): write to blocked_users, NOT user_blocks.
                    // Canonical table read by privacy-service.isUserBlocked,
                    // settings export, and the new get_visible_live_streams /
                    // get_visible_live_comments RPCs. Writing to user_blocks
                    // silently no-op'd — the block didn't take effect anywhere.
                    await supabase.from('blocked_users').insert({
                      blocker_id: currentUser.id,
                      blocked_id: profile.id,
                    });
                    setProfileMenuMsg('User blocked');
                  } catch (e) {
                    setProfileMenuMsg('Already blocked or error');
                  } finally {
                    btn.disabled = false;
                    btn.textContent = 'Block';
                  }
                  setTimeout(() => setProfileMenuMsg(''), 2000);
                  setShowBlockConfirm(false);
                }}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  background: '#F02849',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Block
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Report User Modal */}
      {showReportInput && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => {
            setShowReportInput(false);
            setReportReason('');
          }}
        >
          <div
            style={{
              background: C.card,
              borderRadius: 12,
              padding: 24,
              maxWidth: 360,
              width: '100%',
              boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 12 }}>
              Report {profile?.username || profile?.full_name}
            </div>
            <div style={{ fontSize: 14, color: C.textSec, marginBottom: 12 }}>
              Why are you reporting this user?
            </div>
            <textarea
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder="Describe the issue..."
              style={{
                width: '100%',
                minHeight: 80,
                padding: 12,
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                fontSize: 14,
                resize: 'vertical',
                outline: 'none',
                fontFamily: 'inherit',
                marginBottom: 16,
                boxSizing: 'border-box',
              }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => {
                  setShowReportInput(false);
                  setReportReason('');
                }}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  background: '#e4e6eb',
                  color: C.text,
                  border: 'none',
                  borderRadius: 8,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                id="report-submit-btn"
                disabled={!reportReason.trim()}
                onClick={async (e) => {
                  const btn = e.currentTarget;
                  if (btn.dataset.submitting === 'true') return;
                  btn.dataset.submitting = 'true';
                  btn.textContent = 'Submitting...';
                  if (!currentUser?.id || !profile?.id) {
                    setProfileMenuMsg('Please log in');
                    setTimeout(() => setProfileMenuMsg(''), 2000);
                    setShowReportInput(false);
                    setReportReason('');
                    return;
                  }
                  try {
                    await supabase.from('user_reports').insert({
                      reporter_id: currentUser.id,
                      reported_id: profile.id,
                      reason: reportReason.trim(),
                    });
                    setProfileMenuMsg('Report submitted');
                  } catch (e) {
                    setProfileMenuMsg('Report failed');
                  } finally {
                    btn.dataset.submitting = 'false';
                    btn.textContent = 'Submit Report';
                  }
                  setTimeout(() => setProfileMenuMsg(''), 2000);
                  setShowReportInput(false);
                  setReportReason('');
                }}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  background: '#F02849',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  fontWeight: 600,
                  cursor: reportReason.trim() ? 'pointer' : 'not-allowed',
                  opacity: reportReason.trim() ? 1 : 0.5,
                }}
              >
                Submit Report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Photo Lightbox Modal */}
      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl(null)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setLightboxUrl(null);
          }}
          tabIndex={0}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0,0,0,0.92)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'zoom-out',
            animation: 'fadeIn 0.2s ease',
          }}
        >
          <img
            src={lightboxUrl}
            alt="Full size photo"
            style={{
              maxWidth: '90vw',
              maxHeight: '90vh',
              objectFit: 'contain',
              borderRadius: 8,
              boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
            }}
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setLightboxUrl(null)}
            style={{
              position: 'absolute',
              top: 20,
              right: 20,
              background: 'rgba(255,255,255,0.15)',
              border: 'none',
              color: 'white',
              width: 40,
              height: 40,
              borderRadius: '50%',
              fontSize: 20,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backdropFilter: 'blur(4px)',
            }}
          >
            ✕
          </button>
          <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`}</style>
        </div>
      )}

      {/* Article Reader Modal for HendonMob */}
      {articleReader.open && (
        <ArticleReaderModal
          url={articleReader.url}
          title={articleReader.title}
          onClose={() => setArticleReader({ open: false, url: '', title: '' })}
        />
      )}
      <FriendsModal
        isOpen={showFriendsModal}
        onClose={() => setShowFriendsModal(false)}
        profileId={profile?.id}
        profileName={profile?.full_name || profile?.username}
        currentUserId={currentUser?.id}
        socialIdRef={socialIdRef}
      />
      <BottomNavBar />
    </PageTransition>
  );
}
