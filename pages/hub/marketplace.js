// Marketplace redirects to Diamond Store
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import BottomNavBar from '../../src/components/ui/BottomNavBar';

export default function MarketplacePage() {
    const router = useRouter();

    useEffect(() => {
        // Wait for the router to hydrate query params, then forward them so
        // deep links like /hub/marketplace?tab=merch keep working.
        if (!router.isReady) return;
        router.replace({ pathname: '/hub/diamond-store', query: router.query });
        // Intentionally keyed on isReady only — re-running on every router.query
        // identity change would re-issue the replace mid-transition.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [router.isReady]);

    return (
        <>
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100vh', paddingBottom: 70,
                background: '#18191A',
                color: '#1877F2',
                fontFamily: 'Inter, -apple-system, sans-serif',
                fontSize: 16
            }}>
                Redirecting to Store...
            </div>
            <BottomNavBar />
        </>
    );
}
