import { useEffect, useRef } from 'react';

// A cold route can change scope while authentication and the inbox initialize.
// Consume the link only when its verified response is actually accepted.
export default function useMessengerConversationLink({ userId, scope, conversation, draft, resolve }) {
    const handled = useRef(null);
    const resolver = useRef(resolve);
    resolver.current = resolve;
    useEffect(() => {
        if (!userId || typeof conversation !== 'string' || !conversation) {
            handled.current = null;
            return;
        }
        const key = `${userId}:${conversation}`;
        if (handled.current === key) return;
        let current = true;
        resolver.current(conversation, typeof draft === 'string' ? draft : '', {
            isCurrent: () => current,
            onResolved: () => { if (current) handled.current = key; },
        });
        return () => { current = false; };
    }, [userId, scope, conversation, draft]);
}
