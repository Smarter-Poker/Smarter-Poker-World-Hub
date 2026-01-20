import { useRouter } from 'next/router';
import { useEffect } from 'react';

export default function TrainingGamePlay() {
    const router = useRouter();
    const { gameId } = router.query;

    useEffect(() => {
        // Redirect to static HTML UI
        window.location.href = '/training-ui/index.html';
    }, []);

    return (
        <div style={{
            width: '100vw',
            height: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#000',
            color: '#fff'
        }}>
            Loading training game...
        </div>
    );
}
