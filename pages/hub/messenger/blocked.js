/**
 * Blocked Users Page
 * ═══════════════════════════════════════════════════════════════════════════
 * Manage blocked users across Messenger and Friends
 * ═══════════════════════════════════════════════════════════════════════════
 */

import Head from 'next/head';
import { useState, useEffect } from 'react';
import { supabase } from '../../../src/lib/supabase';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { getAuthUser } from '../../../src/lib/authUtils';

export default function BlockedUsers() {
    const [user, setUser] = useState(null);
    const [blockedUsers, setBlockedUsers] = useState([]);
    const [loading, setLoading] = useState(true);

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

            // TODO: Implement blocked_users table and query
            setBlockedUsers([]);
            setLoading(false);
        } catch (error) {
            console.error('Error loading blocked users:', error);
            setLoading(false);
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
                            <p style={styles.emptyText}>Users you block will appear here</p>
                        </div>
                    ) : (
                        <div style={styles.blockedList}>
                            {/* Blocked users will be rendered here */}
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
    emptyText: { color: '#9ca3af' },
    loadingContainer: { textAlign: 'center', padding: '80px 24px' },
    spinner: { fontSize: '48px', animation: 'pulse 1.5s ease-in-out infinite' },
    loadingText: { marginTop: '16px', color: '#9ca3af' },
    blockedList: { display: 'grid', gap: '16px' }
};
