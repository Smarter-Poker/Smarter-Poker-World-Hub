/**
 * Message Requests Page
 * ═══════════════════════════════════════════════════════════════════════════
 * Manage incoming message requests from non-friends
 * ═══════════════════════════════════════════════════════════════════════════
 */

import Head from 'next/head';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '../../../src/lib/supabase';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { getAuthUser } from '../../../src/lib/authUtils';

export default function MessageRequests() {
    const [user, setUser] = useState(null);
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(null);

    useEffect(() => {
        loadRequests();
    }, []);

    const loadRequests = async () => {
        try {
            const authUser = await getAuthUser();
            setUser(authUser);

            if (!authUser) {
                setLoading(false);
                return;
            }

            // Fetch message requests from conversations where user is not friends with sender
            const { data, error } = await supabase
                .from('conversations')
                .select(`
                    id,
                    created_at,
                    last_message,
                    last_message_at,
                    participant_1,
                    participant_2,
                    sender:profiles!participant_1(id, username, full_name, avatar_url)
                `)
                .eq('participant_2', authUser.id)
                .eq('is_request', true)
                .order('created_at', { ascending: false });

            if (error && error.code !== 'PGRST116') {
                console.error('Error fetching requests:', error);
            }

            setRequests(data || []);
            setLoading(false);
        } catch (error) {
            console.error('Error loading requests:', error);
            setLoading(false);
        }
    };

    const handleAccept = async (requestId, senderId) => {
        if (!user) return;
        setProcessing(requestId);

        try {
            // Mark conversation as accepted
            await supabase
                .from('conversations')
                .update({ is_request: false })
                .eq('id', requestId);

            // Remove from list
            setRequests(prev => prev.filter(r => r.id !== requestId));
        } catch (error) {
            console.error('Error accepting request:', error);
            alert('Failed to accept request');
        } finally {
            setProcessing(null);
        }
    };

    const handleDecline = async (requestId) => {
        if (!user) return;
        setProcessing(requestId);

        try {
            // Delete the conversation request
            await supabase
                .from('conversations')
                .delete()
                .eq('id', requestId);

            // Remove from list
            setRequests(prev => prev.filter(r => r.id !== requestId));
        } catch (error) {
            console.error('Error declining request:', error);
            alert('Failed to decline request');
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
            <Head>
                <title>Message Requests — Smarter.Poker</title>
            </Head>

            <div style={styles.container}>
                <UniversalHeader pageDepth={2} />

                <div style={styles.content}>
                    <div style={styles.header}>
                        <h1 style={styles.title}>📬 Message Requests</h1>
                        {requests.length > 0 && (
                            <span style={styles.badge}>{requests.length}</span>
                        )}
                    </div>

                    <p style={styles.description}>
                        Messages from people you're not connected with appear here.
                        Accept to start chatting or decline to remove.
                    </p>

                    {loading ? (
                        <div style={styles.loadingContainer}>
                            <div style={styles.spinner}>📬</div>
                            <p style={styles.loadingText}>Loading requests...</p>
                        </div>
                    ) : requests.length === 0 ? (
                        <div style={styles.emptyState}>
                            <div style={styles.emptyIcon}>📬</div>
                            <h2 style={styles.emptyTitle}>No message requests</h2>
                            <p style={styles.emptyText}>
                                When someone who isn't your friend sends you a message,
                                it will appear here for you to review.
                            </p>
                            <Link href="/hub/messenger" style={styles.inboxLink}>
                                Go to Inbox →
                            </Link>
                        </div>
                    ) : (
                        <div style={styles.requestsList}>
                            {requests.map(request => (
                                <div key={request.id} style={styles.requestCard}>
                                    <div style={styles.requestHeader}>
                                        <img
                                            src={request.sender?.avatar_url || '/default-avatar.png'}
                                            alt={request.sender?.username}
                                            style={styles.avatar}
                                        />
                                        <div style={styles.senderInfo}>
                                            <div style={styles.senderName}>
                                                {request.sender?.full_name || request.sender?.username || 'Unknown'}
                                            </div>
                                            <div style={styles.timestamp}>
                                                {timeAgo(request.created_at)}
                                            </div>
                                        </div>
                                    </div>

                                    {request.last_message && (
                                        <div style={styles.messagePreview}>
                                            "{request.last_message.slice(0, 100)}{request.last_message.length > 100 ? '...' : ''}"
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
                                            onClick={() => handleAccept(request.id, request.participant_1)}
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
    container: { minHeight: '100vh', background: '#0a0a0a', color: '#FFFFFF' },
    content: { maxWidth: '700px', margin: '0 auto', padding: '80px 24px 40px' },
    header: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' },
    title: { fontSize: '32px', fontWeight: 700, margin: 0 },
    badge: {
        background: '#00D4FF',
        color: '#000',
        padding: '4px 10px',
        borderRadius: '20px',
        fontSize: '14px',
        fontWeight: 700
    },
    description: { color: '#9ca3af', marginBottom: '32px', lineHeight: 1.6 },
    emptyState: { textAlign: 'center', padding: '80px 24px' },
    emptyIcon: { fontSize: '64px', marginBottom: '16px', opacity: 0.5 },
    emptyTitle: { fontSize: '24px', fontWeight: 600, marginBottom: '8px' },
    emptyText: { color: '#9ca3af', marginBottom: '24px', maxWidth: '400px', margin: '0 auto 24px' },
    inboxLink: { color: '#00D4FF', textDecoration: 'none', fontWeight: 600 },
    loadingContainer: { textAlign: 'center', padding: '80px 24px' },
    spinner: { fontSize: '48px', animation: 'pulse 1.5s ease-in-out infinite' },
    loadingText: { marginTop: '16px', color: '#9ca3af' },
    requestsList: { display: 'grid', gap: '16px' },
    requestCard: {
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '16px',
        padding: '20px'
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
        background: 'linear-gradient(135deg, #00E0FF, #0099FF)',
        border: 'none',
        borderRadius: '8px',
        color: '#fff',
        fontSize: '14px',
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.2s'
    }
};

