/**
 * Message Requests Page
 * ═══════════════════════════════════════════════════════════════════════════
 * Manage incoming message requests from non-friends
 * ═══════════════════════════════════════════════════════════════════════════
 */

import Head from 'next/head';
import { useState, useEffect } from 'react';
import { supabase } from '../../../src/lib/supabase';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { getAuthUser } from '../../../src/lib/authUtils';

export default function MessageRequests() {
    const [user, setUser] = useState(null);
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);

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

            // TODO: Implement message_requests table and query
            setRequests([]);
            setLoading(false);
        } catch (error) {
            console.error('Error loading requests:', error);
            setLoading(false);
        }
    };

    return (
        <PageTransition>
            <Head>
                <title>Message Requests — Smarter.Poker</title>
            </Head>

            <div style={styles.container}>
                <UniversalHeader pageDepth={2} />

                <div style={styles.content}>
                    <h1 style={styles.title}>📬 Message Requests</h1>

                    {loading ? (
                        <div style={styles.loadingContainer}>
                            <div style={styles.spinner}>📬</div>
                            <p style={styles.loadingText}>Loading requests...</p>
                        </div>
                    ) : requests.length === 0 ? (
                        <div style={styles.emptyState}>
                            <div style={styles.emptyIcon}>📬</div>
                            <h2 style={styles.emptyTitle}>No message requests</h2>
                            <p style={styles.emptyText}>Requests from people you're not friends with will appear here</p>
                        </div>
                    ) : (
                        <div style={styles.requestsList}>
                            {/* Requests will be rendered here */}
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
    requestsList: { display: 'grid', gap: '16px' }
};
