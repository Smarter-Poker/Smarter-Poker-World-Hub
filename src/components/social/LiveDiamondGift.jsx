/**
 * LiveDiamondGift — Diamond gifting UI for live streams
 * Viewers send diamonds to broadcasters with animated confirmation.
 */
import { useState, useEffect, useRef } from 'react';
import { getAccessToken, getFreshAccessToken } from '../../lib/authUtils';
import { LiveDiamondIcon } from './LiveDiamondIcon';

const GIFT_AMOUNTS = [
    { amount: 5,   label: '5',   emoji: '💎' },
    { amount: 10,  label: '10',  emoji: '💎💎' },
    { amount: 25,  label: '25',  emoji: '🔷' },
    { amount: 50,  label: '50',  emoji: '💫' },
    { amount: 100, label: '100', emoji: '👑' },
];

export function LiveDiamondGift({ streamId, receiverId, userId, userBalance, onGiftSent, onClose }) {
    const [selected, setSelected] = useState(null);
    const [sending, setSending] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState('');
    // BUG FIX (L4): track success timeout so we can cancel it on unmount.
    // Without this, if the parent unmounts within 1.5s of a successful gift,
    // onGiftSent and onClose fire on a stale closed component.
    const successTimerRef = useRef(null);
    const isMounted = useRef(true);

    useEffect(() => {
        return () => { 
            isMounted.current = false;
            if (successTimerRef.current) clearTimeout(successTimerRef.current); 
        };
    }, []);

    const handleSend = async () => {
        if (!selected || sending) return;
        if (selected > (userBalance || 0)) {
            setError('Not enough diamonds');
            return;
        }
        setSending(true);
        setError('');
        try {
            // BUG-HUNT-12: gift endpoint vulnerable to stale-token 401 on
            // long streams. Refresh before sending so viewer gifting after
            // 1+ hour of watching doesn't 401.
            const token = (await getFreshAccessToken()) || getAccessToken();

            // STREAM-POLISH-R3 GIFT-1 (client): generate a stable
            // idempotency_key for this gift attempt. The server uses it
            // as the deduct/credit reference + live_gifts.id upsert key,
            // so a network retry (fetch interrupted by network blip,
            // browser auto-retry) won't double-charge the sender. Key
            // is scoped to a single tap; if the user taps Send again
            // after a failure that gets reported back, that's a separate
            // gift with its own key.
            let idempotencyKey;
            if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
                idempotencyKey = crypto.randomUUID();
            } else {
                // RFC-4122 v4 fallback for older browsers without crypto.randomUUID.
                idempotencyKey = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
                    const r = (Math.random() * 16) | 0;
                    const v = c === 'x' ? r : (r & 0x3) | 0x8;
                    return v.toString(16);
                });
            }

            const resp = await fetch('/api/live/gift', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                credentials: 'same-origin',
                body: JSON.stringify({
                    stream_id: streamId,
                    receiver_id: receiverId,
                    amount: selected,
                    idempotency_key: idempotencyKey,
                }),
            });
            let data;
            try {
                data = await resp.json();
            } catch (parseErr) {
                throw new Error(`Server error: ${resp.status} ${resp.statusText}`);
            }
            if (!resp.ok) {
                // Surface the exact API error (includes anti-farming reason)
                const apiError = data?.error || 'Gift failed';
                throw new Error(apiError);
            }
            
            if (!isMounted.current) return;
            
            setSuccess(true);
            successTimerRef.current = setTimeout(() => {
                if (!isMounted.current) return;
                successTimerRef.current = null;
                onGiftSent?.(selected, data.newBalance);
                onClose();
            }, 1500);
        } catch (err) {
            if (isMounted.current) setError(err.message);
        } finally {
            if (isMounted.current) setSending(false);
        }
    };

    return (
        <div
            onClick={() => {
                // BUG-FIX-DEEP-AUDIT-R5 DG-3: prevent backdrop dismiss
                // while a gift is in-flight. Otherwise the user can tap
                // outside mid-send, the modal closes, and the API
                // succeeds without ever showing the confirmation. The
                // diamonds are deducted but the user thinks nothing
                // happened.
                if (sending) return;
                onClose();
            }}
            style={{
                position: 'absolute', inset: 0,
                background: 'rgba(0,0,0,0.5)', zIndex: 50,
                display: 'flex', alignItems: 'flex-end',
            }}
        >
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    width: '100%',
                    background: 'linear-gradient(135deg, #0A0A1A, #1A0A2E)',
                    border: '1px solid rgba(255,200,0,0.3)',
                    borderRadius: '20px 20px 0 0',
                    padding: 24,
                }}
            >
                {success ? (
                    // BUG-FIX-LIVE-4 (per Dan: "WHEN A USER SENDS DIAMONDS, THE
                    // POP UP NEEDS TO HAVE THE FIRST LETTER OF EVERY WORD
                    // CAPITALIZED. AND IT NEEDS TO BE WHITE LETTERS, NOT
                    // YELLOW.") — swap #FFD700 → #FFFFFF on the headline,
                    // lift the subtitle from 60% white to 100% white, and
                    // Title-Case the subtitle copy.
                    <div style={{ textAlign: 'center', padding: '24px 0' }}>
                        <div style={{ fontSize: 52, marginBottom: 12 }}>🎉</div>
                        <div style={{ color: '#FFFFFF', fontSize: 20, fontWeight: 700 }}>Gift Sent!</div>
                        <div style={{ color: '#FFFFFF', fontSize: 14, marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                            {selected} <LiveDiamondIcon size={16} alt="diamonds" /> Sent To Broadcaster
                        </div>
                    </div>
                ) : (
                    <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <span style={{ color: 'white', fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                                Send Diamonds <LiveDiamondIcon size={20} alt="diamond" />
                            </span>
                            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
                                Balance: {(userBalance || 0).toLocaleString()} <LiveDiamondIcon size={13} alt="diamonds" />
                            </span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 20 }}>
                            {GIFT_AMOUNTS.map(g => {
                                // BUG-FIX-DEEP-AUDIT-R5 DG-1: actually
                                // disable buttons over balance. The opacity:0.4
                                // visual hint already existed but the button
                                // was still clickable, surfacing a 'Not
                                // enough diamonds' error after the round trip.
                                const overBalance = g.amount > (userBalance || 0);
                                return (
                                    <button
                                        key={g.amount}
                                        onClick={() => setSelected(g.amount)}
                                        disabled={overBalance}
                                        title={overBalance ? `Need ${g.amount} diamonds` : undefined}
                                        style={{
                                            padding: '12px 4px',
                                            borderRadius: 12,
                                            border: selected === g.amount
                                                ? '2px solid #FFD700'
                                                : '2px solid rgba(255,255,255,0.1)',
                                            background: selected === g.amount
                                                ? 'rgba(255,215,0,0.15)'
                                                : 'rgba(255,255,255,0.05)',
                                            color: 'white',
                                            fontSize: 12,
                                            fontWeight: 700,
                                            cursor: overBalance ? 'not-allowed' : 'pointer',
                                            textAlign: 'center',
                                            opacity: overBalance ? 0.4 : 1,
                                        }}
                                    >
                                        <div style={{ fontSize: 20, marginBottom: 4 }}>{g.emoji}</div>
                                        {g.label}
                                    </button>
                                );
                            })}
                        </div>

                        {error && (
                            <div style={{ color: '#FA383E', fontSize: 13, textAlign: 'center', marginBottom: 12, lineHeight: 1.4, padding: '8px 12px', background: 'rgba(250,56,62,0.1)', borderRadius: 8, border: '1px solid rgba(250,56,62,0.2)' }}>
                                {error}
                            </div>
                        )}

                        <button
                            onClick={handleSend}
                            disabled={!selected || sending}
                            style={{
                                width: '100%',
                                padding: '14px 0',
                                background: selected
                                    ? 'linear-gradient(135deg, #FFD700, #FFA500)'
                                    : 'rgba(255,255,255,0.1)',
                                color: selected ? '#000' : 'rgba(255,255,255,0.4)',
                                fontSize: 16,
                                fontWeight: 700,
                                border: 'none',
                                borderRadius: 12,
                                cursor: selected ? 'pointer' : 'default',
                                transition: 'all 0.2s',
                            }}
                        >
                            {sending ? 'Sending...' : selected ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                    Send {selected} <LiveDiamondIcon size={16} alt="diamonds" />
                                </span>
                            ) : 'Select an amount'}
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}

export default LiveDiamondGift;
