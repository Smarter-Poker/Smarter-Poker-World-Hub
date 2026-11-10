import React, { useEffect, useRef } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import CopyAgentHandoffButton from '../reliability/CopyAgentHandoffButton';
import { readReliabilityIncidentOnce, reliabilityHandoffText } from '../../lib/messenger/reliabilityIncident.mjs';

// Open Incident and Copy Agent Handoff under a Reliability Controller message.
// MessageBubble mounts this only for the platform sender with the
// reliability_incident kind; see reliabilityIncidentControls.
export default function ReliabilityIncidentControls({ incidentId, href, content, theme: C }) {
    // The authorized handoff is read ahead of the tap so the copy itself is
    // synchronous. Until it arrives, or if it is refused, the message text is
    // the handoff.
    const read = useRef(null);
    useEffect(() => {
        let current = true;
        read.current = null;
        if (incidentId) {
            readReliabilityIncidentOnce(supabase, incidentId).then((result) => { if (current) read.current = result; });
        }
        return () => { current = false; };
    }, [incidentId]);

    const control = {
        flex: '1 1 140px', minHeight: 44, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center',
        justifyContent: 'center', padding: '8px 12px', borderRadius: 10, border: `1px solid ${C.border}`,
        background: C.card, color: C.blue, fontSize: 14, fontWeight: 700, lineHeight: 1.2, textAlign: 'center',
        textDecoration: 'none', cursor: 'pointer', fontFamily: 'inherit',
    };
    return <div data-testid="reliability-incident-controls" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10, maxWidth: '100%' }}>
        {href && <Link href={href} data-testid="open-incident" onClick={(event) => event.stopPropagation()} style={control}>
            Open Incident
        </Link>}
        <CopyAgentHandoffButton getText={() => reliabilityHandoffText(read.current, content)} style={control}
            statusStyle={{ fontSize: 12, fontWeight: 600 }} />
    </div>;
}
