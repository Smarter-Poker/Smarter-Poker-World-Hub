/**
 * Blocked Users Page
 * ═══════════════════════════════════════════════════════════════════════════
 * Manage blocked users across Messenger and Friends
 * ═══════════════════════════════════════════════════════════════════════════
 */

import Head from 'next/head';
import { useState, useEffect } from 'react';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { getAuthUser } from '../../../src/lib/authUtils';
import { getBlockedUsers, unblockUser } from '../../../src/services/privacy-service';

export default function BlockedUsers() {
    const [user, setUser] = useState(null);
    const [blockedUsers, setBlockedUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [unblocking, setUnblocking] = useState(null);

    useEffect(() => {
        loadBlockedUsers();
    }, []);

    const loadBlockedUsers = async () => {
        try {
            const authUser = await getAuthUser();
            setUser(authUser);

            if (!authUser) {
                setLoading(false);
                return;
            }

            const blocked = await getBlockedUsers(authUser.id);
            setBlockedUsers(blocked);
            setLoading(false);
        } catch (error) {
            console.error('Error loading blocked users:', error);
            setLoading(false);
        }
    };

    const handleUnblock = async (blockedId) => {
        if (!user) return;

        setUnblocking(blockedId);
        try {
            await unblockUser(user.id, blockedId);
            setBlockedUsers(prev => prev.filter(b => b.blocked_id !== blockedId));
        } catch (error) {
            console.error('Error unblocking user:', error);
            alert('Failed to unblock user. Please try again.');
        } finally {
            setUnblocking(null);
        }
    };

    return (
        <PageTransition>
            <Head>
                <title>Blocked Users — Smarter.Poker</title>
            </Head>

            <div style={styles.container}>
                <UniversalHeader pageDepth={2} />

                <div style={styles.content}>
                    <h1 style={styles.title}>🚫 Blocked Users</h1>

                    {loading ? (
                        <div style={styles.loadingContainer}>
                            <div style={styles.spinner}>🚫</div>
                            <p style={styles.loadingText}>Loading blocked users...</p>
                        </div>
                    ) : blockedUsers.length === 0 ? (
                        <div style={styles.emptyState}>
                            <div style={styles.emptyIcon}>🚫</div>
                            <h2 style={styles.emptyTitle}>No blocked users</h2>
                            <p style={styles.emptyText}>Users you block will appear here. Blocked users cannot:</p>
                            <ul style={styles.infoList}>
                                <li>Send you messages or friend requests</li>
                                <li>See your online status</li>
                                <li>View your profile or posts</li>
                            </ul>
                        </div>
                    ) : (
                        <div style={styles.blockedList}>
                            {blockedUsers.map(item => (
                                <div key={item.blocked_id} style={styles.userCard}>
                                    <img
                                        src={item.blocked?.avatar_url || '/default-avatar.png'}
                                        alt={item.blocked?.username}
                                        style={styles.avatar}
                                    />
                                    <div style={styles.userInfo}>
                                        <div style={styles.username}>
                                            {item.blocked?.full_name || item.blocked?.username || 'Unknown User'}
                                        </div>
                                        <div style={styles.blockedDate}>
                                            Blocked {new Date(item.created_at).toLocaleDateString()}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleUnblock(item.blocked_id)}
                                        disabled={unblocking === item.blocked_id}
                                        style={{
                                            ...styles.unblockButton,
                                            opacity: unblocking === item.blocked_id ? 0.5 : 1
                                        }}
                                    >
                                        {unblocking === item.blocked_id ? 'Unblocking...' : 'Unblock'}
                                    </button>
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
    content: { maxWidth: '800px', margin: '0 auto', padding: '80px 24px 40px' },
    title: { fontSize: '32px', fontWeight: 700, marginBottom: '32px' },
    emptyState: { textAlign: 'center', padding: '80px 24px' },
    emptyIcon: { fontSize: '64px', marginBottom: '16px', opacity: 0.5 },
    emptyTitle: { fontSize: '24px', fontWeight: 600, marginBottom: '8px' },
    emptyText: { color: '#9ca3af', marginBottom: '16px' },
    infoList: { textAlign: 'left', display: 'inline-block', color: '#9ca3af', lineHeight: 1.8 },
    loadingContainer: { textAlign: 'center', padding: '80px 24px' },
    spinner: { fontSize: '48px', animation: 'pulse 1.5s ease-in-out infinite' },
    loadingText: { marginTop: '16px', color: '#9ca3af' },
    blockedList: { display: 'grid', gap: '16px' },
    userCard: {
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        padding: '16px',
        background: 'rgba(255, 255, 255, 0.05)',
        borderRadius: '12px',
        border: '1px solid rgba(255, 255, 255, 0.1)'
    },
    avatar: {
        width: '48px',
        height: '48px',
        borderRadius: '50%',
        objectFit: 'cover'
    },
    userInfo: { flex: 1 },
    username: { fontSize: '16px', fontWeight: 600, marginBottom: '4px' },
    blockedDate: { fontSize: '13px', color: '#9ca3af' },
    unblockButton: {
        padding: '8px 16px',
        background: 'rgba(255, 71, 87, 0.15)',
        border: '1px solid rgba(255, 71, 87, 0.3)',
        borderRadius: '8px',
        color: '#ff4757',
        fontSize: '14px',
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.2s'
    }
};

