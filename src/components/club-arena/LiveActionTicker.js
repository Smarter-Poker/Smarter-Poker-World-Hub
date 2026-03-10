import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { EventType, eventBus } from '../../engine/EventBus';

export default function LiveActionTicker({ clubId, primaryColor = '#2D88FF' }) {
    const [messages, setMessages] = useState([
        { id: 'initial', text: 'Welcome to the club!', type: 'system', timestamp: Date.now() }
    ]);

    // Cleanup old messages
    useEffect(() => {
        const interval = setInterval(() => {
            const now = Date.now();
            setMessages(prev => prev.filter(m => (now - m.timestamp) < 600000)); // Keep for 10 minutes
        }, 60000);
        return () => clearInterval(interval);
    }, []);

    const addMessage = (text, type = 'info') => {
        setMessages(prev => {
            // Keep max 10 messages
            const newM = [{ id: Math.random().toString(36).substring(7), text, type, timestamp: Date.now() }, ...prev];
            return newM.slice(0, 10);
        });
    };

    // 1. Listen to Local EventBus for immediate optimistic UI updates
    useEffect(() => {
        const unsubs = [
            eventBus.on(EventType.TABLE_OPENED, (e) => {
                const name = e.payload?.name || 'A new table';
                const style = e.payload?.style || 'NLH';
                addMessage(`🃏 ${name} (${style}) just opened!`, 'action');
            }),
            eventBus.on(EventType.TOURNAMENT_STARTED, (e) => {
                addMessage(`🏆 Tournament approaching start time!`, 'action');
            }),
            eventBus.on(EventType.DATA_MUTATED, (e) => {
                if (e.payload?.entity === 'table_action') {
                    // Can expand on table action events from game engine if local
                }
            })
        ];
        return () => unsubs.forEach(u => u());
    }, []);

    // 2. Listen to Supabase Realtime for Global Network events (Big Pots, BBJ, Chat)
    useEffect(() => {
        if (!clubId) return;

        const channel = supabase
            .channel(`ticker:${clubId}`)
            // Listen to table chat for system announcements
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'table_chat',
                filter: `message_type=eq.system`
            }, (payload) => {
                // To avoid leaking table IDs directly, we just show the message 
                const msg = payload.new?.message;
                if (msg) addMessage(`📣 ${msg}`, 'system');
            })
            // Listen for BBJ updates hitting thresholds
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'bbj_pools',
                filter: `club_id=eq.${clubId}`
            }, (payload) => {
                const oldAmt = payload.old?.amount || 0;
                const newAmt = payload.new?.amount || 0;
                // Announce if it crosses a 10k, 50k, 100k threshold
                const thresholds = [10000, 50000, 100000, 500000, 1000000];
                const crossed = thresholds.find(t => oldAmt < t && newAmt >= t);
                if (crossed) {
                    addMessage(`🚨 BAD BEAT JACKPOT just crossed ${crossed.toLocaleString()} chips!`, 'bbj');
                }
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [clubId]);

    if (messages.length === 0) return null;

    return (
        <div style={styles.tickerContainer}>
            <div style={{ ...styles.tickerTrack, animationDuration: `${Math.max(20, messages.length * 5)}s` }}>
                {/* Double the messages to create a seamless infinite loop */}
                {[...messages, ...messages].map((m, i) => (
                    <div key={`${m.id}-${i}`} style={styles.messageItem}>
                        <span style={{
                            ...styles.dot,
                            backgroundColor: m.type === 'bbj' ? '#FFD700' :
                                m.type === 'action' ? '#00E676' :
                                    m.type === 'system' ? primaryColor : '#B0B3B8'
                        }} />
                        <span style={{
                            ...styles.text,
                            color: m.type === 'bbj' ? '#FFD700' : '#E4E6EB',
                            fontWeight: m.type === 'bbj' ? 800 : 600
                        }}>
                            {m.text}
                        </span>
                    </div>
                ))}
            </div>

            {/* Fades on the edges */}
            <div style={styles.fadeLeft} />
            <div style={styles.fadeRight} />
        </div>
    );
}

const styles = {
    tickerContainer: {
        position: 'relative',
        width: '100%',
        height: '28px',
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        borderTop: '1px solid rgba(255,255,255,0.05)',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        marginBottom: '12px'
    },
    tickerTrack: {
        display: 'flex',
        alignItems: 'center',
        whiteSpace: 'nowrap',
        width: 'max-content',
        animationName: 'tickerScroll',
        animationTimingFunction: 'linear',
        animationIterationCount: 'infinite',
        paddingLeft: '100%',
    },
    messageItem: {
        display: 'flex',
        alignItems: 'center',
        padding: '0 24px',
        gap: '8px'
    },
    dot: {
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        boxShadow: '0 0 4px rgba(255,255,255,0.2)'
    },
    text: {
        fontSize: '11px',
        letterSpacing: '0.3px',
        fontFamily: '"Inter", -apple-system, sans-serif'
    },
    fadeLeft: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: '30px',
        background: 'linear-gradient(to right, #000 0%, transparent 100%)',
        zIndex: 2,
        pointerEvents: 'none'
    },
    fadeRight: {
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        width: '30px',
        background: 'linear-gradient(to left, #000 0%, transparent 100%)',
        zIndex: 2,
        pointerEvents: 'none'
    }
};

// Inject keyframes globally once
if (typeof document !== 'undefined') {
    const style = document.createElement('style');
    style.innerHTML = `
        @keyframes tickerScroll {
            0% { transform: translateX(0); }
            100% { transform: translateX(-50%); }
        }
    `;
    document.head.appendChild(style);
}
