/**
 * PublicGameBoard — The public game board for a club page: live tables, seats and the join flow.
 *
 * This file used to open with a verbatim copy of the social-media feed page's
 * "PROTECTED FILE" banner, followed by ~3,000 lines of that page's code:
 * LinkPreviewCard and the whole PostCard component, none of it reachable from
 * here (PublicGameBoard never rendered a PostCard). The banner described features that
 * live in pages/hub/social-media/index.js, not in this component, and it
 * carried that page's line numbers - which were wrong even there.
 *
 * Removed 2026-09-08 along with the imports the dead code was the only
 * consumer of. If you need the feed's behaviour, import from the feed's
 * modules; do not copy this file again.
 */

import { useRouter } from 'next/router';
import React, { useState, useEffect } from 'react';

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

function PublicGameBoard({ C, pageId, pageName, userId, userName, onClose }) {
  const router = useRouter();
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [gameSource, setGameSource] = useState(null); // 'commander' or null
  const [commanderVenueId, setCommanderVenueId] = useState(null);
  const [playerName, setPlayerName] = useState(userName || '');
  // Sync playerName when userName prop updates (arrives async after auth)
  useEffect(() => {
    if (userName && !playerName) setPlayerName(userName);
  }, [userName]);
  const [actionMsg, setActionMsg] = useState('');
  const [followStatus, setFollowStatus] = useState(null); // null = not checked, 'none' | 'pending' | 'approved'
  const [followLoading, setFollowLoading] = useState(true);
  // Timer tick for live countdown clocks
  const [timerTick, setTimerTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTimerTick((p) => p + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Check follow status
  const checkFollowStatus = async () => {
    if (!userId) {
      setFollowStatus('none');
      setFollowLoading(false);
      return;
    }
    try {
      const res = await fetch(`/api/social/pages/follow?page_id=${pageId}&requester_id=${userId}`);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const json = await res.json();
      if (json.success) {
        setFollowStatus(json.my_status || (json.is_following ? 'approved' : 'none'));
      } else {
        setFollowStatus('none');
      }
    } catch {
      setFollowStatus('none');
    }
    setFollowLoading(false);
  };

  const fetchGames = async () => {
    try {
      const res = await fetch(`/api/social/pages/games?page_id=${pageId}`);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const json = await res.json();
      if (json.success) {
        setGames(json.data || []);
        setTimerTick(0);
        if (json.source === 'commander' && json.venue_id) {
          setGameSource('commander');
          setCommanderVenueId(json.venue_id);
        }
      }
    } catch (e) {
      console.warn('Public games fetch error:', e);
    }
    setLoading(false);
  };

  useEffect(() => {
    checkFollowStatus();
    fetchGames();
    const interval = setInterval(fetchGames, 15000);
    return () => clearInterval(interval);
  }, [pageId]);

  const showMsg = (msg) => {
    setActionMsg(msg);
    setTimeout(() => setActionMsg(''), 3000);
  };

  const handleFollow = async () => {
    if (!userId) {
      showMsg('You must be logged in to follow this page');
      return;
    }
    if (followLoading) return;
    setFollowLoading(true);

    // EAGER STATE: Show optimistic pending state immediately
    const prevStatus = followStatus;
    setFollowStatus('pending');

    try {
      const token = getAccessToken();
      const res = await fetch('/api/social/pages/follow', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ page_id: pageId, user_id: userId, action: 'follow' }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const json = await res.json();
      if (json.success) {
        const newStatus = json.status || 'approved';
        setFollowStatus(newStatus);
        if (newStatus === 'pending') showMsg('Follow request sent! Waiting for approval.');
        else showMsg('You are now following this page!');
      } else {
        setFollowStatus(prevStatus);
        showMsg(json.error || 'Could not follow page');
      }
    } catch {
      setFollowStatus(prevStatus);
      showMsg('Error following page');
    } finally {
      setFollowLoading(false);
    }
  };

  const handleTakeSeat = async (gameId, seatNumber) => {
    if (!playerName.trim()) {
      showMsg('Please enter your name first');
      return;
    }
    try {
      const token = getAccessToken();
      const res = await fetch('/api/social/pages/games', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          action: 'take_seat',
          game_id: gameId,
          seat_number: seatNumber,
          player_id: userId || null,
          player_name: playerName.trim(),
        }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const json = await res.json();
      if (json.success) {
        showMsg(`Seat ${seatNumber} reserved!`);
        fetchGames();
      } else {
        showMsg(json.error || 'Could not take seat');
      }
    } catch (e) {
      showMsg('Error reserving seat');
    }
  };

  const handleJoinWaitlist = async (gameId) => {
    if (!playerName.trim()) {
      showMsg('Please enter your name first');
      return;
    }
    // Commander games: navigate to the Commander waitlist page
    if (gameSource === 'commander' && commanderVenueId) {
      router.push(`/hub/commander/waitlist/${commanderVenueId}`);
      return;
    }
    try {
      const token = getAccessToken();
      const res = await fetch('/api/social/pages/games', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          action: 'join_waitlist',
          game_id: gameId,
          player_id: userId || null,
          player_name: playerName.trim(),
        }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const json = await res.json();
      if (json.success) {
        showMsg(`Added to waitlist (position #${json.position})`);
        fetchGames();
      } else {
        showMsg(json.error || 'Could not join waitlist');
      }
    } catch (e) {
      showMsg('Error joining waitlist');
    }
  };

  const handleLeave = async (gameId) => {
    if (!playerName.trim()) return;
    try {
      const token = getAccessToken();
      await fetch('/api/social/pages/games', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ action: 'leave', game_id: gameId, player_name: playerName.trim() }),
      });
      showMsg('You have been removed from the game');
      fetchGames();
    } catch (e) {
      showMsg('Error leaving game');
    }
  };

  const canInteract = followStatus === 'approved';

  return (
    <div style={{ paddingBottom: 8 }}>
      {/* Header */}
      <div
        style={{
          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
          borderRadius: 12,
          padding: 16,
          marginBottom: 8,
          color: '#fff',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 10,
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Live Games</h2>
            <p style={{ margin: '2px 0 0', fontSize: 13, opacity: 0.8 }}>
              {pageName || 'Club Games'}
            </p>
          </div>
          {onClose && (
            <button
              onClick={() => (onClose ? onClose() : router.back())}
              style={{
                padding: '6px 14px',
                borderRadius: 20,
                border: 'none',
                background: 'rgba(255,255,255,0.15)',
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              ← Back
            </button>
          )}
        </div>

        {/* Follow Status Banner */}
        {followLoading ? (
          <div
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              background: 'rgba(255,255,255,0.1)',
              fontSize: 13,
            }}
          >
            Checking Access...
          </div>
        ) : followStatus === 'none' ? (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 8,
              background: 'rgba(24,119,242,0.3)',
              border: '1px solid rgba(24,119,242,0.5)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>Follow To Play</div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>
                  You Must Follow This Page Before You Can Sign Up For Games.
                </div>
              </div>
              <button
                onClick={handleFollow}
                style={{
                  padding: '8px 20px',
                  borderRadius: 20,
                  border: 'none',
                  background: '#1877F2',
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  whiteSpace: 'nowrap',
                }}
              >
                {!userId ? '🔒 Sign In' : '➕ Follow Page'}
              </button>
            </div>
          </div>
        ) : followStatus === 'pending' ? (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 8,
              background: 'rgba(245,158,11,0.2)',
              border: '1px solid rgba(245,158,11,0.5)',
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700 }}>⏳ Follow Request Pending</div>
            <div style={{ fontSize: 12, opacity: 0.85 }}>
              The Host Needs To Approve Your Request Before You Can Sign Up For Games. Check Back
              Soon!
            </div>
          </div>
        ) : (
          <>
            {/* Player Name — locked to Smarter Poker profile name */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label style={{ fontSize: 12, fontWeight: 600, opacity: 0.8 }}>Signed In As:</label>
              <span
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid rgba(255,255,255,0.15)',
                  background: 'rgba(255,255,255,0.06)',
                  color: '#fff',
                  fontSize: 14,
                  fontFamily: 'inherit',
                }}
              >
                {playerName || 'Player'}
              </span>
            </div>
          </>
        )}
        {actionMsg && (
          <div
            style={{
              marginTop: 8,
              padding: '6px 12px',
              borderRadius: 6,
              background:
                actionMsg.includes('Error') ||
                actionMsg.includes('Please') ||
                actionMsg.includes('Could not') ||
                actionMsg.includes('must')
                  ? 'rgba(240,40,73,0.2)'
                  : 'rgba(34,197,94,0.2)',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {actionMsg}
          </div>
        )}
      </div>

      {/* Games */}
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
          Loading Live Games...
        </div>
      ) : games.length === 0 ? (
        <div style={{ background: C.card, borderRadius: 12, padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 24, marginBottom: 8, fontWeight: 700 }}>No Live Games</div>
          <p style={{ fontSize: 16, fontWeight: 600, color: C.text, margin: '0 0 4px' }}>
            No Live Games Right Now
          </p>
          <p style={{ fontSize: 13, color: C.textSec, margin: 0 }}>
            Check Back Soon For Upcoming Games!
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {games.map((game) => {
            const seatArr = Array.from({ length: game.max_seats }, (_, i) => {
              const taken = (game.seats || []).find(
                (s) => s.seat_number === i + 1 && s.status !== 'waitlist'
              );
              return { number: i + 1, taken };
            });
            const waitlist = (game.seats || [])
              .filter((s) => s.status === 'waitlist')
              .sort((a, b) => (a.waitlist_position || 0) - (b.waitlist_position || 0));
            const occupiedCount = seatArr.filter((s) => s.taken).length;
            const openSeats = game.max_seats - occupiedCount;
            const myReservation = (game.seats || []).find(
              (s) => (s.player_id && userId ? s.player_id === userId : s.player_name === playerName.trim())
            );

            // Arc-length parameterized ellipse: equal visual spacing
            const rx = 47,
              ry = 22,
              cxE = 50,
              cyE = 50;
            const STEPS = 360;
            const startAngle = Math.PI / 2; // dealer at bottom (90°)
            const cumArc = [0];
            for (let i = 1; i <= STEPS; i++) {
              const t0 = startAngle + ((i - 1) / STEPS) * 2 * Math.PI;
              const t1 = startAngle + (i / STEPS) * 2 * Math.PI;
              const dx = rx * (Math.cos(t1) - Math.cos(t0));
              const dy = ry * (Math.sin(t1) - Math.sin(t0));
              cumArc.push(cumArc[i - 1] + Math.sqrt(dx * dx + dy * dy));
            }
            const totalArc = cumArc[STEPS];
            const allPos = [];
            for (let p = 0; p < 10; p++) {
              const target = (p / 10) * totalArc;
              let idx = 1;
              while (idx <= STEPS && cumArc[idx] < target) idx++;
              const angle = startAngle + (idx / STEPS) * 2 * Math.PI;
              allPos.push({
                top: `${cyE + ry * Math.sin(angle)}%`,
                left: `${cxE + rx * Math.cos(angle)}%`,
              });
            }
            // pos[0]=dealer(bottom), pos[1-9]=seats going counter-clockwise
            const dealerTop = allPos[0].top;
            const dealerLeft = allPos[0].left;
            const seatPositions = allPos.slice(1);
            // Clamp top seat to not float above rail
            seatPositions.forEach((p) => {
              const t = parseFloat(p.top);
              if (t < 30) p.top = '30%';
            });

            return (
              <div
                key={game.id}
                style={{
                  background: '#1a1a2e',
                  borderRadius: 16,
                  border: '1px solid #2d2d44',
                  overflow: 'hidden',
                }}
              >
                {/* Game Header */}
                <div
                  style={{
                    padding: '12px 16px',
                    background:
                      game.status === 'running'
                        ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
                        : 'linear-gradient(135deg, #1877F2 0%, #1565c0 100%)',
                    color: '#fff',
                  }}
                >
                  {/* Interest List banner for non-running games */}
                  {game.status !== 'running' && (
                    <div
                      style={{
                        textAlign: 'center',
                        marginBottom: 6,
                        fontSize: 11,
                        fontWeight: 800,
                        letterSpacing: 2,
                        textTransform: 'uppercase',
                        color: 'rgba(255,255,255,0.7)',
                      }}
                    >
                      INTEREST LIST
                    </div>
                  )}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 800 }}>{game.game_name}</div>
                      <div style={{ fontSize: 13, opacity: 0.9 }}>
                        {game.game_type} · ${game.stakes} · {game.max_seats}-Max
                        {game.table_number ? ` · ${game.table_number}` : ''}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div
                        style={{
                          padding: '4px 10px',
                          borderRadius: 12,
                          fontSize: 11,
                          fontWeight: 700,
                          background: 'rgba(255,255,255,0.2)',
                          textTransform: 'uppercase',
                        }}
                      >
                        {game.status === 'running' ? '🟢 RUNNING' : '🔵 INTEREST LIST'}
                      </div>
                      <div style={{ fontSize: 11, marginTop: 4, opacity: 0.8 }}>
                        {occupiedCount}/{game.max_seats} Seated
                        {openSeats > 0 && (
                          <span style={{ color: '#86efac', marginLeft: 4 }}>
                            ({openSeats} Open)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {game.notes && (
                    <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>{game.notes}</div>
                  )}
                </div>

                {/* Follow-gate / My seat status — above table */}
                <div style={{ padding: '0 16px' }}>
                  {!canInteract && (
                    <div
                      style={{
                        padding: '8px 12px',
                        borderRadius: 8,
                        background: 'rgba(245,158,11,0.15)',
                        border: '1px solid rgba(245,158,11,0.3)',
                        marginBottom: 8,
                        textAlign: 'center',
                      }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#fbbf24' }}>
                        {followStatus === 'pending'
                          ? '⏳ Approval pending - you can view but not join yet'
                          : '🔒 Follow this page to sign up for games'}
                      </span>
                    </div>
                  )}

                  {myReservation && (
                    <div
                      style={{
                        marginBottom: 8,
                        padding: '8px 12px',
                        borderRadius: 8,
                        background:
                          myReservation.status === 'waitlist'
                            ? 'rgba(245,158,11,0.15)'
                            : 'rgba(34,197,94,0.15)',
                        border: `1px solid ${myReservation.status === 'waitlist' ? 'rgba(245,158,11,0.3)' : 'rgba(34,197,94,0.3)'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>
                        {myReservation.status === 'waitlist'
                          ? `📋 You're #${myReservation.waitlist_position} on the waitlist`
                          : `✅ You have Seat ${myReservation.seat_number}`}
                      </span>
                      <button
                        onClick={() => handleLeave(game.id)}
                        style={{
                          padding: '4px 12px',
                          borderRadius: 20,
                          border: 'none',
                          background: '#F02849',
                          color: '#fff',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        Leave
                      </button>
                    </div>
                  )}
                </div>

                {/* Poker Table Visualization — Full Width (cropped viewport) */}
                <div
                  style={{
                    position: 'relative',
                    width: '100%',
                    paddingBottom: '64%',
                    overflow: 'hidden',
                    marginTop: 10,
                    marginBottom: 10,
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      aspectRatio: '1 / 1',
                      marginTop: '-18%',
                    }}
                  >
                    {/* Table image fills entire container */}
                    <img
                      src="/images/poker-table-black-gold.png"
                      alt="Poker Table"
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                        pointerEvents: 'none',
                        zIndex: 0,
                      }}
                    />

                    {/* Game info in center of table */}
                    <div
                      style={{
                        position: 'absolute',
                        top: '48%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        zIndex: 5,
                        textAlign: 'center',
                      }}
                    >
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: 'rgba(255,255,255,0.5)',
                          textTransform: 'uppercase',
                          letterSpacing: 1.5,
                          marginBottom: 4,
                        }}
                      >
                        {pageName || 'Club'}
                      </div>
                      <div
                        style={{
                          fontSize: 20,
                          fontWeight: 800,
                          color: 'rgba(255,255,255,0.85)',
                          textTransform: 'uppercase',
                          letterSpacing: 1,
                        }}
                      >
                        {game.table_number || game.game_name}
                      </div>
                      <div
                        style={{
                          fontSize: 16,
                          color: 'rgba(255,255,255,0.6)',
                          marginTop: 2,
                          fontWeight: 700,
                        }}
                      >
                        ${game.stakes}
                      </div>
                      {canInteract && !myReservation && (
                        <div
                          style={{
                            fontSize: 11,
                            color: game.status === 'running' ? '#93c5fd' : '#86efac',
                            marginTop: 6,
                            fontWeight: 600,
                          }}
                        >
                          {game.status === 'running' ? 'JOIN WAITLIST' : 'TAP A SEAT TO RESERVE'}
                        </div>
                      )}
                    </div>

                    {/* Dealer seat — on the bottom rail of the table (clickable → Dealer Tablet) */}
                    <div
                      style={{
                        position: 'absolute',
                        top: dealerTop,
                        left: dealerLeft,
                        transform: 'translate(-50%, -50%)',
                        textAlign: 'center',
                        width: 90,
                        zIndex: 3,
                        cursor: 'pointer',
                      }}
                      onClick={() =>
                        window.open('/hub/commander', '_blank')
                      }
                    >
                      <div
                        style={{
                          width: 80,
                          height: 80,
                          borderRadius: '50%',
                          margin: '0 auto 4px',
                          background: 'linear-gradient(135deg, #1877F2 0%, #1565c0 100%)',
                          border: '3px solid #E4E6EB',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 2px 12px rgba(0,0,0,0.6), 0 0 16px rgba(24,119,242,0.4)',
                          fontSize: 32,
                          fontWeight: 900,
                          color: '#fff',
                          letterSpacing: 1,
                          transition: 'transform 0.15s',
                        }}
                      >
                        D
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: '#1877F2',
                          maxWidth: 120,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {game.dealer_name || 'No Dealer'}
                      </div>
                    </div>

                    {/* 9 Player seat chips on the table rail */}
                    {seatArr.slice(0, seatPositions.length).map((seat, idx) => {
                      const pos = seatPositions[idx];
                      const isOccupied = !!seat.taken;
                      const isMe = seat.taken?.player_id && userId
                        ? seat.taken.player_id === userId
                        : seat.taken?.player_name === playerName.trim();
                      const firstName = seat.taken?.player_name?.split(' ')[0] || '';
                      const fullName = seat.taken?.player_name || '';
                      const avatarUrl = seat.taken?.avatar_url || null;
                      // Players can only click seats if game is NOT running (interest list / signup)
                      // Running games require joining the waitlist instead
                      const isRunning = game.status === 'running';
                      const canClick = canInteract && !isOccupied && !myReservation && !isRunning;

                      // Direction-aware badge: left-side extends right, right-side extends left
                      const leftPct = parseFloat(pos.left);
                      const isLeftSide = leftPct < 25;
                      const isRightSide = leftPct > 75;
                      const badgeTransform = isLeftSide
                        ? 'translate(-17px, -50%)'
                        : isRightSide
                          ? 'translate(calc(-100% + 17px), -50%)'
                          : 'translate(-50%, -50%)';
                      const badgeDirection = isRightSide ? 'row-reverse' : 'row';

                      // Timer computation
                      let timerText = null,
                        timerColor = null;
                      if (isOccupied) {
                        const session = (game.sessions || []).find(
                          (s) => s.seat_number === seat.number
                        );
                        if (session) {
                          const isTexas = game.venue_type === 'texas';
                          if (isTexas) {
                            const rem = Math.max(0, (session.time_remaining || 0) - timerTick);
                            const mins = Math.floor(rem / 60);
                            const secs = rem % 60;
                            timerText = `${mins}:${String(secs).padStart(2, '0')}`;
                            const isExpired = rem <= 0;
                            const isCritical = rem <= 300 && rem > 0;
                            const isLow = rem <= 900 && rem > 0;
                            timerColor = isExpired
                              ? '#ef4444'
                              : isCritical
                                ? '#ef4444'
                                : isLow
                                  ? '#f59e0b'
                                  : '#22c55e';
                            if (isExpired) timerText = 'EXPIRED';
                          } else {
                            const elapsed = (session.elapsed_seconds || 0) + timerTick;
                            const hrs = Math.floor(elapsed / 3600);
                            const mins = Math.floor((elapsed % 3600) / 60);
                            timerText = `${hrs}:${String(mins).padStart(2, '0')}`;
                            timerColor = '#a78bfa';
                          }
                        }
                      }

                      // Badge border color (SmarterPoker dark)
                      const badgeBorder = isMe
                        ? 'rgba(74,222,128,0.6)'
                        : isOccupied
                          ? 'rgba(24,119,242,0.5)'
                          : canClick
                            ? 'rgba(34,197,94,0.3)'
                            : 'rgba(62,64,66,0.6)';

                      return (
                        <div
                          key={seat.number}
                          style={{
                            position: 'absolute',
                            top: pos.top,
                            left: pos.left,
                            transform: badgeTransform,
                            zIndex: 2,
                            display: 'flex',
                            flexDirection: badgeDirection,
                            alignItems: 'center',
                            gap: 10,
                            background: 'rgba(36,37,38,0.9)',
                            borderRadius: 14,
                            padding: '6px 12px 6px 6px',
                            border: `2px solid ${badgeBorder}`,
                            backdropFilter: 'blur(6px)',
                            cursor: canClick ? 'pointer' : 'default',
                            minWidth: 80,
                          }}
                          onClick={() => canClick && handleTakeSeat(game.id, seat.number)}
                        >
                          {/* Avatar circle */}
                          <div
                            style={{
                              width: 68,
                              height: 68,
                              borderRadius: '50%',
                              flexShrink: 0,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              background: isMe
                                ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
                                : isOccupied
                                  ? avatarUrl
                                    ? 'transparent'
                                    : 'linear-gradient(135deg, #1877F2 0%, #1565c0 100%)'
                                  : canClick
                                    ? 'rgba(34,197,94,0.15)'
                                    : 'rgba(255,255,255,0.06)',
                              border: `2px solid ${isMe ? '#4ade80' : isOccupied ? '#1877F2' : canClick ? 'rgba(34,197,94,0.4)' : 'rgba(62,64,66,0.5)'}`,
                              overflow: 'hidden',
                            }}
                          >
                            {isOccupied ? (
                              isMe ? (
                                <span style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>
                                  YOU
                                </span>
                              ) : avatarUrl ? (
                                <img
                                  src={avatarUrl}
                                  alt={firstName}
                                  style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                    borderRadius: '50%',
                                  }}
                                />
                              ) : (
                                <span style={{ fontSize: 24, fontWeight: 800, color: '#fff' }}>
                                  {firstName.charAt(0).toUpperCase()}
                                </span>
                              )
                            ) : (
                              <span
                                style={{
                                  fontSize: canClick ? 22 : 18,
                                  fontWeight: 600,
                                  color: canClick ? 'rgba(34,197,94,0.7)' : '#B0B3B8',
                                }}
                              >
                                {canClick ? '+' : seat.number}
                              </span>
                            )}
                          </div>
                          {/* Name + Timer text */}
                          <div
                            style={{
                              overflow: 'hidden',
                              textAlign: isRightSide ? 'right' : 'left',
                            }}
                          >
                            <div
                              style={{
                                fontSize: 16,
                                fontWeight: 600,
                                lineHeight: 1.2,
                                color: isMe
                                  ? '#4ade80'
                                  : isOccupied
                                    ? '#E4E6EB'
                                    : canClick
                                      ? 'rgba(34,197,94,0.5)'
                                      : '#B0B3B8',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                maxWidth: 140,
                              }}
                            >
                              {isMe ? 'You' : isOccupied ? fullName : canClick ? 'Reserve' : 'Open'}
                            </div>
                            {timerText && (
                              <div
                                style={{
                                  fontSize: 14,
                                  fontWeight: 700,
                                  color: timerColor,
                                  fontFamily: 'monospace',
                                  lineHeight: 1.2,
                                  animation:
                                    timerColor === '#ef4444' ? 'pulse 1s infinite' : 'none',
                                }}
                              >
                                {timerText}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Waitlist info */}
                {waitlist.length > 0 && (
                  <div style={{ padding: '6px 16px', fontSize: 11, color: '#a1a1aa' }}>
                    <span style={{ fontWeight: 600, color: '#1877F2' }}>
                      📋 Waitlist: {waitlist.map((w) => w.player_name?.split(' ')[0]).join(', ')}
                    </span>
                  </div>
                )}

                {/* ── Join Waitlist — Large Centered Button ── */}
                {canInteract && !myReservation && (
                  <div style={{ padding: '12px 16px 16px' }}>
                    <button
                      onClick={() => handleJoinWaitlist(game.id)}
                      style={{
                        width: '100%',
                        padding: '16px 24px',
                        borderRadius: 12,
                        border: 'none',
                        background: 'linear-gradient(135deg, #1877F2 0%, #1565c0 100%)',
                        color: '#fff',
                        fontSize: 18,
                        fontWeight: 800,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        letterSpacing: 1,
                        textTransform: 'uppercase',
                        boxShadow: '0 4px 14px rgba(24,119,242,0.4)',
                        transition: 'transform 0.1s, box-shadow 0.1s',
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.transform = 'scale(1.02)';
                        e.currentTarget.style.boxShadow = '0 6px 20px rgba(24,119,242,0.5)';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.transform = 'scale(1)';
                        e.currentTarget.style.boxShadow = '0 4px 14px rgba(24,119,242,0.4)';
                      }}
                    >
                      Join Waitlist
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ===== CLUB PAGES VIEW COMPONENT =====
export default PublicGameBoard;
