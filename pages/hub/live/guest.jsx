import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { useSupabase } from '../../../src/providers/SupabaseProvider';
import { GoLiveModal } from '../../../src/components/social/GoLiveModal';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';

export default function GuestJoinPage() {
    const router = useRouter();
    const { room, invite } = router.query;
    const { user, loading } = useSupabase();
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
        <div style={{ minHeight: '100vh', background: '#050505', display: 'flex', flexDirection: 'column' }}>
            <Head>
                <title>Join as Guest | Smarter.Poker</title>
            </Head>
            <UniversalHeader title="Join Stream" showBack={true} />
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                <GoLiveModal 
                    isOpen={true} 
                    onClose={() => router.push('/hub')} 
                    user={user} 
                    guestMode={true} 
                    initialRoomId={room} 
                    initialInviteCode={invite} 
                />
            </div>
        </div>
    );
}
