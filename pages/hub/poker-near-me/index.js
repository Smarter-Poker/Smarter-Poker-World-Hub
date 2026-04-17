/**
 * /hub/poker-near-me → redirect to /hub/poker-near-me/lobby
 * 
 * The root Poker Near Me path redirects to the cinematic lobby.
 * All feature sub-pages live under /hub/poker-near-me/[feature].
 */
import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function PokerNearMeIndex() {
    const router = useRouter();
    useEffect(() => {
        // Preserve any query params (e.g. ?sort=distance, ?q=...)
        const qs = window.location.search || '';
        router.replace('/hub/poker-near-me/lobby' + qs);
    }, [router]);
    return null;
}
