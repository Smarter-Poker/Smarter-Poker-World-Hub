/**
 * Reliability incident, read only. Opened from the Open Incident control on a
 * Reliability Controller message in Messenger.
 *
 * The incident is read in the browser with the signed-in account's own session
 * through fn_reliability_incident_for_owner, which decides who may read it.
 * There is no server route and no service credential on this path, and the URL
 * carries the incident id and nothing else.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../../../src/components/seo/SEOHead';
import ReliabilityIncidentView from '../../../../src/components/reliability/ReliabilityIncidentView';
import { supabase } from '../../../../src/lib/supabase';
import { useRequireAuth } from '../../../../src/lib/authUtils';
import { readReliabilityIncident } from '../../../../src/lib/messenger/reliabilityIncident.mjs';

function ReliabilityIncidentBody() {
    const router = useRouter();
    const { user, checking } = useRequireAuth(typeof window === 'undefined' ? undefined : window.location.pathname);
    const [result, setResult] = useState({ state: 'loading', incident: null });
    const [attempt, setAttempt] = useState(0);
    const incidentId = typeof router.query.id === 'string' ? router.query.id : null;

    useEffect(() => {
        if (!router.isReady || checking || !user?.id) return undefined;
        let current = true;
        setResult({ state: 'loading', incident: null });
        readReliabilityIncident(supabase, incidentId).then((next) => { if (current) setResult(next); });
        return () => { current = false; };
    }, [router.isReady, checking, user?.id, incidentId, attempt]);

    const retry = useCallback(() => setAttempt((n) => n + 1), []);
    return <ReliabilityIncidentView state={result.state} incident={result.incident} onRetry={retry} />;
}

export default function ReliabilityIncidentPage() {
    return (
        <>
            <SEOHead
                title="Reliability Incident"
                description="The Signed In, Read Only Record Of One Smarter.Poker Reliability Incident For The Platform Alert Recipient."
                noindex
            />
            <ReliabilityIncidentBody />
        </>
    );
}
