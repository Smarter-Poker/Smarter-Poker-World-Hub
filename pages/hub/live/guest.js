import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { getAuthUser } from '../../../src/lib/authUtils';
import GoLiveModal from '../../../src/components/social/GoLiveModal';

export default function GuestJoinPage() {
    const router = useRouter();
    const { room, invite } = router.query;
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        setIsClient(true);
        const authUser = getAuthUser();
        setUser(authUser);
        setLoading(false);
    }, []);

    if (!isClient || loading || !router.isReady) {
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
        <>
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
        </>
    );
}

export async function getServerSideProps() {
    return { props: {} };
}

