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
            background: '#0a0a12',
            color: '#00d4ff',
            fontFamily: 'Orbitron, sans-serif'
        }}>
            Redirecting to Marketplace...
        </div>
    );
}
