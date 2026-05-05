import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { useAuth } from '../../../src/providers/AuthProvider';
import { GoLiveModal } from '../../../src/components/social/GoLiveModal';
import { Layout } from '../../../src/components/Layout';

export default function GuestJoinPage() {
    const router = useRouter();
    const { room, invite } = router.query;
    const { user, loading } = useAuth();
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        setIsClient(true);
    }, []);

    if (!isClient || loading) {
        return <div style={{ background: '#000', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>Loading...</div>;
    }

    if (!user) {
        return (
            <div style={{ background: '#000', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                <p>Please log in to join the broadcast.</p>
            </div>
        );
    }

    if (!room || !invite) {
        return (
            <div style={{ background: '#000', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                <p>Invalid invite link.</p>
            </div>
        );
    }

    return (
        <Layout>
            <Head>
                <title>Join as Guest | Smarter.Poker</title>
            </Head>
            <div style={{ minHeight: '100vh', background: '#050505', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                <GoLiveModal 
                    isOpen={true} 
                    onClose={() => router.push('/hub')} 
                    user={user} 
                    guestMode={true} 
                    initialRoomId={room} 
                    initialInviteCode={invite} 
                />
            </div>
        </Layout>
    );
}
