/**
 * Message Requests Page
 * ═══════════════════════════════════════════════════════════════════════════
 * Manage incoming message requests from non-friends (Facebook-style).
 * Uses social_conversations table with is_request=true flag.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import SEOHead from '../../../src/components/seo/SEOHead';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { supabase } from '../../../src/lib/supabase';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { getAuthUser, getAccessToken } from '../../../src/lib/authUtils';

export default function MessageRequests() {
    const [user, setUser] = useState(null);
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(null);
    const router = useRouter();

    useEffect(() => {
        loadRequests();
    }, []);

    // Realtime subscription — live updates
    useEffect(() => {
        if (!user?.id) return;
        const _ch = supabase
            .channel(`msg-req:${user.id}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'social_conversations' }, () => {
                loadRequests();
            })
            .subscribe();
        return () => { supabase.removeChannel(_ch); };
    }, [user?.id]);

    const loadRequests = async () => {
        try {
            const authUser = getAuthUser();
            setUser(authUser);

            if (!authUser) {
                setLoading(false);
                return;
            }

            // Step 1: Get all conversations the user is a participant in
            const { data: participations } = await supabase
                .from('social_conversation_participants')
                .select('conversation_id')
                .eq('user_id', authUser.id)
                .limit(200);

            if (!participations || participations.length === 0) {
                setRequests([]);
                setLoading(false);
                return;
            }

            const convIds = participations.map(p => p.conversation_id);

            // Step 2: Get conversations that are message requests (not sent by this user)
            const { data: requestConvs, error } = await supabase
                .from('social_conversations')
                .select('id, created_at, last_message_preview, last_message_at, is_request, request_sender_id')
                .in('id', convIds)
                .eq('is_request', true)
                .neq('request_sender_id', authUser.id)
                .order('created_at', { ascending: false });

            if (error) {
                console.warn('Error fetching requests:', error);
                setRequests([]);
                setLoading(false);
                return;
            }

            if (!requestConvs || requestConvs.length === 0) {
                setRequests([]);
                setLoading(false);
                return;
            }

            // Step 3: Get the sender profiles for each request
            const senderIds = [...new Set(requestConvs.map(c => c.request_sender_id).filter(Boolean))];
            let profilesMap = {};
            if (senderIds.length > 0) {
                const { data: profiles } = await supabase
                    .from('profiles')
                    .select('id, username, full_name, avatar_url')
                    .in('id', senderIds);
                (profiles || []).forEach(p => { profilesMap[p.id] = p; });
            }

            // Step 4: Enrich requests with sender profiles
            const enrichedRequests = requestConvs.map(conv => ({
                ...conv,
                sender: profilesMap[conv.request_sender_id] || null,
            }));

            setRequests(enrichedRequests);
            setLoading(false);
        } catch (error) {
            console.warn('Error loading requests:', error);
            setLoading(false);
        }
    };

    const handleAccept = async (requestId) => {
        if (!user) return;
        setProcessing(requestId);

        // EAGER STATE SYNCHRONIZATION: Remove from list immediately (BFCache-safe)
        const prevRequests = requests;
        setRequests(prev => prev.filter(r => r.id !== requestId));

        // Route through API (service role) — no UPDATE RLS policy on social_conversations
        try {
            const token = getAccessToken();
            const resp = await fetch('/api/messenger/request-action', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({ requestId, action: 'accept' }),
            });
            const result = await resp.json();
            if (!resp.ok || !result.success) {
                setRequests(prevRequests);
                alert('Failed to accept request');
            }
        } catch (e) {
            setRequests(prevRequests);
            console.warn('Error accepting request:', e);
        } finally {
            setProcessing(null);
        }
    };

    const handleAcceptAndOpen = async (requestId) => {
        if (!user) return;
        setProcessing(requestId);

        try {
            const token = getAccessToken();
            const resp = await fetch('/api/messenger/request-action', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({ requestId, action: 'accept' }),
            });
            const result = await resp.json();

            if (!resp.ok || !result.success) {
                alert('Failed to accept request');
                return;
            }

            // Navigate to messenger — the conversation will now appear in the inbox
            router.push('/hub/messenger');
        } catch (e) {
            console.warn('Error accepting request:', e);
        } finally {
            setProcessing(null);
        }
    };

    const handleDecline = async (requestId) => {
        if (!user) return;
        setProcessing(requestId);

        // EAGER STATE SYNCHRONIZATION: Remove from list immediately (BFCache-safe)
        const prevRequests = requests;
        setRequests(prev => prev.filter(r => r.id !== requestId));

        try {
            const token = getAccessToken();
            const resp = await fetch('/api/messenger/request-action', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({ requestId, action: 'decline' }),
            });
            const result = await resp.json();

            if (!resp.ok || !result.success) {
                setRequests(prevRequests);
                alert('Failed to decline request');
            }
        } catch (e) {
            setRequests(prevRequests);
            console.warn('Error declining request:', e);
        } finally {
            setProcessing(null);
        }
    };

    const timeAgo = (dateStr) => {
        if (!dateStr) return '';
        const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
        if (seconds < 60) return 'Just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
        return `${Math.floor(seconds / 86400)}d ago`;
    };

    return (
        <PageTransition>
            <SEOHead
                title="Message Requests"
                description="View Pending Message Requests."
                canonical="/hub/messenger/requests"
                noindex={true}
            />

            <div style={styles.container}>
                <UniversalHeader pageDepth={2} />

                <div style={styles.content}>
                    {/* Back to Messenger */}
                    <Link href="/hub/messenger" style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        color: '#0084FF', textDecoration: 'none', fontSize: 14,
                        fontWeight: 500, marginBottom: 16,
                    }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M15 18l-6-6 6-6" />
                        </svg>
                        Back To Messenger
                    </Link>

                    <div style={styles.header}>
                        <h1 style={styles.title}>Message Requests</h1>
                        {requests.length > 0 && (
                            <span style={styles.badge}>{requests.length}</span>
                        )}
                    </div>

                    <p style={styles.description}>
                        Messages From People You're Not Friends With Appear Here.
                        Accept To Start Chatting Or Decline To Remove.
                    </p>

                    {loading ? (
                        <div style={styles.loadingContainer}>
                            <div style={styles.spinner}>
                                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#0084FF" strokeWidth="2">
                                    <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
                                </svg>
                            </div>
                            <p style={styles.loadingText}>Loading Requests...</p>
                        </div>
                    ) : !user ? (
                        // Sign-in prompt BEFORE the zero-state - see blocked.js.
                        <div style={styles.emptyState}>
                            <h2 style={styles.emptyTitle}>Sign In Required</h2>
                            <p style={styles.emptyText}>
                                Sign In To See Who Has Messaged You.
                            </p>
                            <Link href="/login" style={styles.inboxLink}>
                                Sign In
                            </Link>
                        </div>
                    ) : requests.length === 0 ? (
                        <div style={styles.emptyState}>
                            <div style={{
                                width: 80, height: 80, borderRadius: '50%',
                                background: 'rgba(0, 132, 255, 0.1)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                margin: '0 auto 20px',
                            }}>
                                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#0084FF" strokeWidth="1.5">
                                    <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
                                </svg>
                            </div>
                            <h2 style={styles.emptyTitle}>No Message Requests</h2>
                            <p style={styles.emptyText}>
                                When Someone Who Isn't Your Friend Sends You A Message,
                                It Will Appear Here For You To Review.
                            </p>
                            <Link href="/hub/messenger" style={styles.inboxLink}>
                                Go To Inbox
                            </Link>
                        </div>
                    ) : (
                        <div style={styles.requestsList}>
                            {requests.map(request => (
                                <div key={request.id} style={styles.requestCard}>
                                    <div style={styles.requestHeader}>
                                        {request.sender?.avatar_url ? (
                                            <img
                                                src={request.sender.avatar_url}
                                                alt={request.sender?.username}
                                                style={styles.avatar}
                                                loading="lazy"
                                            />
                                        ) : (
                                            <div style={{
                                                ...styles.avatar,
                                                background: '#0084FF',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                color: 'white', fontWeight: 700, fontSize: 18,
                                            }}>
                                                {(request.sender?.username || '?')[0].toUpperCase()}
                                            </div>
                                        )}
                                        <div style={styles.senderInfo}>
                                            <Link
                                                href={`/hub/user/${request.sender?.username || ''}`}
                                                style={{ ...styles.senderName, textDecoration: 'none', color: 'inherit' }}
                                            >
                                                {request.sender?.full_name || request.sender?.username || 'Unknown'}
                                            </Link>
                                            {request.sender?.username && (
                                                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 1 }}>
                                                    @{request.sender.username}
                                                </div>
                                            )}
                                            <div style={styles.timestamp}>
                                                {timeAgo(request.created_at)}
                                            </div>
                                        </div>
                                    </div>

                                    {request.last_message_preview && (
                                        <div style={styles.messagePreview}>
                                            "{request.last_message_preview.slice(0, 100)}{request.last_message_preview.length > 100 ? '...' : ''}"
                                        </div>
                                    )}

                                    <div style={styles.actions}>
                                        <button
                                            onClick={() => handleDecline(request.id)}
                                            disabled={processing === request.id}
                                            style={{
                                                ...styles.declineButton,
                                                opacity: processing === request.id ? 0.5 : 1
                                            }}
                                        >
                                            Decline
                                        </button>
                                        <button
                                            onClick={() => handleAcceptAndOpen(request.id)}
                                            disabled={processing === request.id}
                                            style={{
                                                ...styles.acceptButton,
                                                opacity: processing === request.id ? 0.5 : 1
                                            }}
                                        >
                                            {processing === request.id ? 'Processing...' : 'Accept'}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </PageTransition>
    );
}

const styles = {
    container: { minHeight: '100vh', width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box', background: '#0a0a0a', color: '#FFFFFF' },
    content: { maxWidth: '700px', margin: '0 auto', padding: '80px 24px 40px' },
    header: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' },
    title: { fontSize: '28px', fontWeight: 700, margin: 0 },
    badge: {
        background: '#0084FF',
        color: '#fff',
        padding: '4px 10px',
        borderRadius: '20px',
        fontSize: '14px',
        fontWeight: 700
    },
    description: { color: '#9ca3af', marginBottom: '32px', lineHeight: 1.6, fontSize: 14 },
    emptyState: { textAlign: 'center', padding: '60px 24px' },
    emptyTitle: { fontSize: '22px', fontWeight: 600, marginBottom: '8px' },
    emptyText: { color: '#9ca3af', marginBottom: '24px', maxWidth: '400px', margin: '0 auto 24px', lineHeight: 1.5 },
    inboxLink: {
        display: 'inline-flex', alignItems: 'center', gap: 6,
        color: '#0084FF', textDecoration: 'none', fontWeight: 600,
        padding: '10px 24px', borderRadius: 24,
        border: '1px solid rgba(0, 132, 255, 0.3)',
        transition: 'all 0.2s',
    },
    loadingContainer: { textAlign: 'center', padding: '80px 24px' },
    spinner: { animation: 'pulse 1.5s ease-in-out infinite' },
    loadingText: { marginTop: '16px', color: '#9ca3af' },
    requestsList: { display: 'grid', gap: '16px' },
    requestCard: {
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '16px',
        padding: '20px',
        transition: 'border-color 0.2s',
    },
    requestHeader: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' },
    avatar: { width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover' },
    senderInfo: { flex: 1 },
    senderName: { fontSize: '16px', fontWeight: 600, marginBottom: '2px' },
    timestamp: { fontSize: '13px', color: '#9ca3af' },
    messagePreview: {
        padding: '12px 16px',
        background: 'rgba(255, 255, 255, 0.05)',
        borderRadius: '8px',
        fontSize: '14px',
        color: '#d1d5db',
        fontStyle: 'italic',
        marginBottom: '16px',
        lineHeight: 1.5
    },
    actions: { display: 'flex', gap: '12px' },
    declineButton: {
        flex: 1,
        padding: '12px',
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        borderRadius: '8px',
        color: '#fff',
        fontSize: '14px',
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.2s'
    },
    acceptButton: {
        flex: 1,
        padding: '12px',
        background: 'linear-gradient(135deg, #0084FF, #0066CC)',
        border: 'none',
        borderRadius: '8px',
        color: '#fff',
        fontSize: '14px',
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.2s'
    }
};
