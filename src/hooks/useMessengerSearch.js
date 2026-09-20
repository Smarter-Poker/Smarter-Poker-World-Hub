import { useEffect, useState } from 'react';

// A result belongs to one actor, workspace, conversation and query. Hide an
// old result during the render that changes that scope, before effects run.
export default function useMessengerSearch({ query, scope, url, payload, request, delay = 300 }) {
    const term = (query || '').trim();
    const enabled = Boolean(scope && term.length >= 2);
    const body = JSON.stringify({ ...payload, query: term });
    const key = JSON.stringify([scope, url, body]);
    const [state, setState] = useState(null);
    useEffect(() => {
        if (!enabled) return;
        let cancelled = false;
        const timer = setTimeout(async () => {
            try {
                const response = await request(url, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
                });
                const data = await response.json();
                if (!response.ok || data.success === false || !Array.isArray(data.results)) {
                    throw new Error('Message search unavailable');
                }
                if (!cancelled) setState({ key, results: data.results, error: null });
            } catch {
                if (!cancelled) setState({ key, results: [], error: 'Search Is Unavailable. Please Try Again.' });
            }
        }, delay);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [enabled, key, url, body, request, delay]);
    if (!enabled) return { results: [], loading: false, error: null };
    if (state?.key !== key) return { results: [], loading: true, error: null };
    return { results: state.results, loading: false, error: state.error };
}
