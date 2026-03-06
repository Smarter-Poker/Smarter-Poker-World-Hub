/**
 * PublicGameBoard — extracted from pages/hub/social-media.js
 * Live game board for followers to view and sign up for club games.
 */
import Image from 'next/image';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

export default function PublicGameBoard({ C, pageId, pageName, userId, userName, onClose }) {
    const router = useRouter();
    const [games, setGames] = useState([]);
    const [loading, setLoading] = useState(true);
    const [gameSource, setGameSource] = useState(null);
    const [commanderVenueId, setCommanderVenueId] = useState(null);
    const [playerName, setPlayerName] = useState(userName || '');
    useEffect(() => { if (userName && !playerName) setPlayerName(userName); }, [userName]);
    const [actionMsg, setActionMsg] = useState('');
    const [followStatus, setFollowStatus] = useState(null);
    const [followLoading, setFollowLoading] = useState(true);
    const [timerTick, setTimerTick] = useState(0);
    useEffect(() => {
        const t = setInterval(() => setTimerTick(p => p + 1), 1000);
        return () => clearInterval(t);
    }, []);

    const checkFollowStatus = async () => {
        const controller = new AbortController();
        if (!userId) { setFollowStatus('none'); setFollowLoading(false); return; }
        try {
            const res = await fetch(`/api/social/pages/follow?page_id=${pageId}&requester_id=${userId}`, { signal: controller.signal });
            const json = await res.json();
            if (json.success) {
                setFollowStatus(json.my_status || (json.is_following ? 'approved' : 'none'));
            } else { setFollowStatus('none'); }
        } catch { setFollowStatus('none'); }
        setFollowLoading(false);
    };

    const fetchGames = async () => {
        const controller = new AbortController();
        try {
            const res = await fetch(`/api/social/pages/games?page_id=${pageId}`, { signal: controller.signal });
            const json = await res.json();
            if (json.success) {
                setGames(json.data || []);
                setTimerTick(0);
                if (json.source === 'commander' && json.venue_id) {
                    setGameSource('commander');
                    setCommanderVenueId(json.venue_id);
                }
            }
        } catch (e) { if (e.name !== 'AbortError') console.error('Public games fetch error:', e); }
        setLoading(false);
    };

    useEffect(() => {
        checkFollowStatus();
        fetchGames();
        const interval = setInterval(fetchGames, 15000);
        return () => clearInterval(interval);
    }, [pageId]);

    const showMsg = (msg) => { setActionMsg(msg); setTimeout(() => setActionMsg(''), 3000); };

    const handleFollow = async () => {
        const controller = new AbortController();
        if (!userId) { showMsg('You must be logged in to follow this page'); return; }
        setFollowLoading(true);
        try {
            const res = await fetch('/api/social/pages/follow', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ page_id: pageId, user_id: userId, action: 'follow' }),
                signal: controller.signal,
            });
            const json = await res.json();
            if (json.success) {
                const newStatus = json.status || 'approved';
                setFollowStatus(newStatus);
                if (newStatus === 'pending') showMsg('Follow request sent! Waiting for approval.');
                else showMsg('You are now following this page!');
            } else { showMsg(json.error || 'Could not follow page'); }
        } catch (e) { if (e.name !== 'AbortError') showMsg('Error following page'); }
        setFollowLoading(false);
    };

    const handleTakeSeat = async (gameId, seatNumber) => {
        if (!playerName.trim()) { showMsg('Please enter your name first'); return; }
        try {
            const res = await fetch('/api/social/pages/games', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'take_seat', game_id: gameId, seat_number: seatNumber, player_id: userId || null, player_name: playerName.trim() }),
            });
            const json = await res.json();
            if (json.success) { showMsg(`Seat ${seatNumber} reserved!`); fetchGames(); }
            else { showMsg(json.error || 'Could not take seat'); }
        } catch (e) { showMsg('Error reserving seat'); }
    };

    const handleJoinWaitlist = async (gameId) => {
        if (!playerName.trim()) { showMsg('Please enter your name first'); return; }
        if (gameSource === 'commander' && commanderVenueId) {
            router.push(`/hub/commander/waitlist/${commanderVenueId}`);
            return;
        }
        try {
            const res = await fetch('/api/social/pages/games', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'join_waitlist', game_id: gameId, player_id: userId || null, player_name: playerName.trim() }),
            });
            const json = await res.json();
            if (json.success) { showMsg(`Added to waitlist (position #${json.position})`); fetchGames(); }
            else { showMsg(json.error || 'Could not join waitlist'); }
        } catch (e) { showMsg('Error joining waitlist'); }
    };

    const handleLeave = async (gameId) => {
        if (!playerName.trim()) return;
        try {
            await fetch('/api/social/pages/games', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'leave', game_id: gameId, player_name: playerName.trim() }),
            });
            showMsg('You have been removed from the game'); fetchGames();
        } catch (e) { showMsg('Error leaving game'); }
    };

    const canInteract = followStatus === 'approved';

    return (
        <div style={{ paddingBottom: 8 }}>
            {/* Header */}
            <div style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)', borderRadius: 12, padding: 16, marginBottom: 8, color: '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Live Games</h2>
                        <p style={{ margin: '2px 0 0', fontSize: 13, opacity: 0.8 }}>{pageName || 'Club Games'}</p>
                    </div>
                    {onClose && <button onClick={() => { if (window.history.length > 1) router.back(); else onClose(); }} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>← Back</button>}
                </div>

                {followLoading ? (
                    <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.1)', fontSize: 13 }}>Checking Access...</div>
                ) : followStatus === 'none' ? (
                    <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(24,119,242,0.3)', border: '1px solid rgba(24,119,242,0.5)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div>
                                <div style={{ fontSize: 14, fontWeight: 700 }}>Follow To Play</div>
                                <div style={{ fontSize: 12, opacity: 0.8 }}>You Must Follow This Page Before You Can Sign Up For Games.</div>
                            </div>
                            <button onClick={handleFollow} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#1877F2', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                                {!userId ? '🔒 Sign In' : '➕ Follow Page'}
                            </button>
                        </div>
                    </div>
                ) : followStatus === 'pending' ? (
                    <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(245,158,11,0.2)', border: '1px solid rgba(245,158,11,0.5)' }}>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>⏳ Follow Request Pending</div>
                        <div style={{ fontSize: 12, opacity: 0.85 }}>The Host Needs To Approve Your Request Before You Can Sign Up For Games. Check Back Soon!</div>
                    </div>
                ) : (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <label style={{ fontSize: 12, fontWeight: 600, opacity: 0.8 }}>Signed In As:</label>
                        <span style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 14, fontFamily: 'inherit' }}>{playerName || 'Player'}</span>
                    </div>
                )}
                {actionMsg && <div style={{ marginTop: 8, padding: '6px 12px', borderRadius: 6, background: actionMsg.includes('Error') || actionMsg.includes('Please') || actionMsg.includes('Could not') || actionMsg.includes('must') ? 'rgba(240,40,73,0.2)' : 'rgba(34,197,94,0.2)', fontSize: 13, fontWeight: 600 }}>{actionMsg}</div>}
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: 40, color: C.textSec }}>
                    <div style={{ width: 32, height: 32, border: '3px solid #E4E6EB', borderTopColor: '#1877F2', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
                    Loading live games...
                </div>
            ) : games.length === 0 ? (
                <div style={{ background: C.card, borderRadius: 12, padding: 40, textAlign: 'center' }}>
                    <div style={{ fontSize: 24, marginBottom: 8, fontWeight: 700 }}>No Live Games</div>
                    <p style={{ fontSize: 16, fontWeight: 600, color: C.text, margin: '0 0 4px' }}>No Live Games Right Now</p>
                    <p style={{ fontSize: 13, color: C.textSec, margin: 0 }}>Check Back Soon For Upcoming Games!</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {games.map(game => {
                        const seatArr = Array.from({ length: game.max_seats }, (_, i) => {
                            const taken = (game.seats || []).find(s => s.seat_number === i + 1 && s.status !== 'waitlist');
                            return { number: i + 1, taken };
                        });
                        const waitlist = (game.seats || []).filter(s => s.status === 'waitlist').sort((a, b) => (a.waitlist_position || 0) - (b.waitlist_position || 0));
                        const occupiedCount = seatArr.filter(s => s.taken).length;
                        const openSeats = game.max_seats - occupiedCount;
                        const myReservation = (game.seats || []).find(s => s.player_name === playerName.trim());

                        const rx = 47, ry = 22, cxE = 50, cyE = 50;
                        const STEPS = 360;
                        const startAngle = Math.PI / 2;
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
                            allPos.push({ top: `${cyE + ry * Math.sin(angle)}%`, left: `${cxE + rx * Math.cos(angle)}%` });
                        }
                        const dealerTop = allPos[0].top;
                        const dealerLeft = allPos[0].left;
                        const seatPositions = allPos.slice(1);
                        seatPositions.forEach(p => { const t = parseFloat(p.top); if (t < 30) p.top = '30%'; });

                        return (
                            <div key={game.id} style={{ background: '#1a1a2e', borderRadius: 16, border: '1px solid #2d2d44', overflow: 'hidden' }}>
                                <div style={{ padding: '12px 16px', background: game.status === 'running' ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)' : 'linear-gradient(135deg, #1877F2 0%, #1565c0 100%)', color: '#fff' }}>
                                    {game.status !== 'running' && (
                                        <div style={{ textAlign: 'center', marginBottom: 6, fontSize: 11, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.7)' }}>INTEREST LIST</div>
                                    )}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div>
                                            <div style={{ fontSize: 18, fontWeight: 800 }}>{game.game_name}</div>
                                            <div style={{ fontSize: 13, opacity: 0.9 }}>{game.game_type} · ${game.stakes} · {game.max_seats}-max{game.table_number ? ` · ${game.table_number}` : ''}</div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: 'rgba(255,255,255,0.2)', textTransform: 'uppercase' }}>
                                                {game.status === 'running' ? '🟢 RUNNING' : '🔵 INTEREST LIST'}
                                            </div>
                                            <div style={{ fontSize: 11, marginTop: 4, opacity: 0.8 }}>
                                                {occupiedCount}/{game.max_seats} seated
                                                {openSeats > 0 && <span style={{ color: '#86efac', marginLeft: 4 }}>({openSeats} open)</span>}
                                            </div>
                                        </div>
                                    </div>
                                    {game.notes && <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>{game.notes}</div>}
                                </div>

                                <div style={{ padding: '0 16px' }}>
                                    {!canInteract && (
                                        <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', marginBottom: 8, textAlign: 'center' }}>
                                            <span style={{ fontSize: 12, fontWeight: 600, color: '#fbbf24' }}>
                                                {followStatus === 'pending' ? '⏳ Approval pending — you can view but not join yet' : '🔒 Follow this page to sign up for games'}
                                            </span>
                                        </div>
                                    )}
                                    {myReservation && (
                                        <div style={{ marginBottom: 8, padding: '8px 12px', borderRadius: 8, background: myReservation.status === 'waitlist' ? 'rgba(245,158,11,0.15)' : 'rgba(34,197,94,0.15)', border: `1px solid ${myReservation.status === 'waitlist' ? 'rgba(245,158,11,0.3)' : 'rgba(34,197,94,0.3)'}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>
                                                {myReservation.status === 'waitlist' ? `📋 You're #${myReservation.waitlist_position} on the waitlist` : `✅ You have Seat ${myReservation.seat_number}`}
                                            </span>
                                            <button onClick={() => handleLeave(game.id)} style={{ padding: '4px 12px', borderRadius: 6, border: 'none', background: '#F02849', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Leave</button>
                                        </div>
                                    )}
                                </div>

                                <div style={{ position: 'relative', width: '100%', paddingBottom: '64%', overflow: 'hidden', marginTop: 10, marginBottom: 10 }}>
                                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, aspectRatio: '1 / 1', marginTop: '-18%' }}>
                                        <Image src="/images/poker-table-black-gold.png" alt="Poker Table" width={640} height={640} style={{
                                            position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                                            objectFit: 'contain', pointerEvents: 'none', zIndex: 0,
                                        }} />
                                        <div style={{ position: 'absolute', top: '48%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 5, textAlign: 'center' }}>
                                            <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 4 }}>{pageName || 'Club'}</div>
                                            <div style={{ fontSize: 20, fontWeight: 800, color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase', letterSpacing: 1 }}>{game.table_number || game.game_name}</div>
                                            <div style={{ fontSize: 16, color: 'rgba(255,255,255,0.6)', marginTop: 2, fontWeight: 700 }}>${game.stakes}</div>
                                            {canInteract && !myReservation && (
                                                <div style={{ fontSize: 11, color: game.status === 'running' ? '#93c5fd' : '#86efac', marginTop: 6, fontWeight: 600 }}>
                                                    {game.status === 'running' ? 'JOIN WAITLIST' : 'TAP A SEAT TO RESERVE'}
                                                </div>
                                            )}
                                        </div>

                                        <div style={{ position: 'absolute', top: dealerTop, left: dealerLeft, transform: 'translate(-50%, -50%)', textAlign: 'center', width: 90, zIndex: 3, cursor: 'pointer' }}
                                            onClick={() => window.open(`/commander/dealer/${game.table_number || 1}`, '_blank')}>
                                            <div style={{ width: 80, height: 80, borderRadius: '50%', margin: '0 auto 4px', background: 'linear-gradient(135deg, #1877F2 0%, #1565c0 100%)', border: '3px solid #E4E6EB', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.6)', fontSize: 32, fontWeight: 900, color: '#fff' }}>D</div>
                                            <div style={{ fontSize: 13, fontWeight: 700, color: '#1877F2', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{game.dealer_name || 'No Dealer'}</div>
                                        </div>

                                        {seatArr.slice(0, seatPositions.length).map((seat, idx) => {
                                            const pos = seatPositions[idx];
                                            const isOccupied = !!seat.taken;
                                            const isMe = seat.taken?.player_name === playerName.trim();
                                            const firstName = seat.taken?.player_name?.split(' ')[0] || '';
                                            const fullName = seat.taken?.player_name || '';
                                            const avatarUrl = seat.taken?.avatar_url || null;
                                            const isRunning = game.status === 'running';
                                            const canClick = canInteract && !isOccupied && !myReservation && !isRunning;
                                            const leftPct = parseFloat(pos.left);
                                            const isLeftSide = leftPct < 25;
                                            const isRightSide = leftPct > 75;
                                            const badgeTransform = isLeftSide ? 'translate(-17px, -50%)' : isRightSide ? 'translate(calc(-100% + 17px), -50%)' : 'translate(-50%, -50%)';
                                            const badgeDirection = isRightSide ? 'row-reverse' : 'row';

                                            let timerText = null, timerColor = null;
                                            if (isOccupied) {
                                                const session = (game.sessions || []).find(s => s.seat_number === seat.number);
                                                if (session) {
                                                    const isTexas = game.venue_type === 'texas';
                                                    if (isTexas) {
                                                        const rem = Math.max(0, (session.time_remaining || 0) - timerTick);
                                                        const mins = Math.floor(rem / 60);
                                                        const secs = rem % 60;
                                                        timerText = rem <= 0 ? 'EXPIRED' : `${mins}:${String(secs).padStart(2, '0')}`;
                                                        timerColor = rem <= 0 ? '#ef4444' : rem <= 300 ? '#ef4444' : rem <= 900 ? '#f59e0b' : '#22c55e';
                                                    } else {
                                                        const elapsed = (session.elapsed_seconds || 0) + timerTick;
                                                        const hrs = Math.floor(elapsed / 3600);
                                                        const mins = Math.floor((elapsed % 3600) / 60);
                                                        timerText = `${hrs}:${String(mins).padStart(2, '0')}`;
                                                        timerColor = '#a78bfa';
                                                    }
                                                }
                                            }

                                            const badgeBorder = isMe ? 'rgba(74,222,128,0.6)' : isOccupied ? 'rgba(24,119,242,0.5)' : canClick ? 'rgba(34,197,94,0.3)' : 'rgba(62,64,66,0.6)';

                                            return (
                                                <div key={seat.number} style={{
                                                    position: 'absolute', top: pos.top, left: pos.left, transform: badgeTransform, zIndex: 2,
                                                    display: 'flex', flexDirection: badgeDirection, alignItems: 'center', gap: 10,
                                                    background: 'rgba(36,37,38,0.9)', borderRadius: 14, padding: '6px 12px 6px 6px',
                                                    border: `2px solid ${badgeBorder}`, backdropFilter: 'blur(6px)',
                                                    cursor: canClick ? 'pointer' : 'default', minWidth: 80,
                                                }} onClick={() => canClick && handleTakeSeat(game.id, seat.number)}>
                                                    <div style={{
                                                        width: 68, height: 68, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        background: isMe ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)' : isOccupied ? (avatarUrl ? 'transparent' : 'linear-gradient(135deg, #1877F2 0%, #1565c0 100%)') : canClick ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.06)',
                                                        border: `2px solid ${isMe ? '#4ade80' : isOccupied ? '#1877F2' : canClick ? 'rgba(34,197,94,0.4)' : 'rgba(62,64,66,0.5)'}`,
                                                        overflow: 'hidden',
                                                    }}>
                                                        {isOccupied ? (isMe ? <span style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>YOU</span> : avatarUrl ? <img src={avatarUrl} alt={firstName} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} /> : <span style={{ fontSize: 24, fontWeight: 800, color: '#fff' }}>{firstName.charAt(0).toUpperCase()}</span>) : <span style={{ fontSize: canClick ? 22 : 18, fontWeight: 600, color: canClick ? 'rgba(34,197,94,0.7)' : '#B0B3B8' }}>{canClick ? '+' : seat.number}</span>}
                                                    </div>
                                                    <div style={{ overflow: 'hidden', textAlign: isRightSide ? 'right' : 'left' }}>
                                                        <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.2, color: isMe ? '#4ade80' : isOccupied ? '#E4E6EB' : canClick ? 'rgba(34,197,94,0.5)' : '#B0B3B8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>
                                                            {isMe ? 'You' : isOccupied ? fullName : canClick ? 'Reserve' : 'Open'}
                                                        </div>
                                                        {timerText && <div style={{ fontSize: 14, fontWeight: 700, color: timerColor, fontFamily: 'monospace', lineHeight: 1.2 }}>{timerText}</div>}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {waitlist.length > 0 && (
                                    <div style={{ padding: '6px 16px', fontSize: 11, color: '#a1a1aa' }}>
                                        <span style={{ fontWeight: 600, color: '#1877F2' }}>📋 Waitlist: {waitlist.map(w => w.player_name?.split(' ')[0]).join(', ')}</span>
                                    </div>
                                )}

                                {canInteract && !myReservation && (
                                    <div style={{ padding: '12px 16px 16px' }}>
                                        <button onClick={() => handleJoinWaitlist(game.id)} style={{
                                            width: '100%', padding: '16px 24px', borderRadius: 12, border: 'none',
                                            background: 'linear-gradient(135deg, #1877F2 0%, #1565c0 100%)', color: '#fff',
                                            fontSize: 18, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
                                            letterSpacing: 1, textTransform: 'uppercase', boxShadow: '0 4px 14px rgba(24,119,242,0.4)',
                                        }}>Join Waitlist</button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
            <style jsx>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
