// Marketplace redirects to Diamond Store
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import BottomNavBar from '../../src/components/ui/BottomNavBar';

export default function MarketplacePage() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/hub/diamond-store');
    }, [router]);

    return (
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
          <BottomNavBar />
        </div>
    );
}
