// Marketplace redirects to Diamond Store
import { useEffect } from 'react';
import { useRouter } from 'next/router';

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
            height: '100vh',
            background: '#F0F2F5',
            color: '#1877F2',
            fontFamily: 'Inter, -apple-system, sans-serif',
            fontSize: 16
        }}>
            Redirecting to Store...
        </div>
    );
}
