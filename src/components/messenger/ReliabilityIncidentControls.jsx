import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import CopyAgentHandoffButton from '../reliability/CopyAgentHandoffButton';
import { readReliabilityIncidentOnce, reliabilityHandoffText, formatChicagoTime } from '../../lib/messenger/reliabilityIncident.mjs';

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

// The heading line of a Reliability Controller message: its label, the time
// it was sent in America/Chicago, and a Delete control. Delete hides the
// message for this account through the acknowledged Delete For Me route; the
// message leaves the list only once the server confirms it.
export function ReliabilityMessageHeader({ label, sentAt, onDelete, theme: C }) {
    const [deleting, setDeleting] = useState(false);
    const mounted = useRef(true);
    useEffect(() => () => { mounted.current = false; }, []);
    const remove = async (event) => {
        event.stopPropagation();
        if (deleting || !onDelete) return;
        setDeleting(true);
        try { await onDelete(); } finally { if (mounted.current) setDeleting(false); }
    };
    return <div data-testid="reliability-incident-header" style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
            <span data-testid="reliability-incident-label" style={{ fontWeight: 800, letterSpacing: 0.2 }}>{label}</span>
            <span data-testid="reliability-incident-sent-at" style={{ display: 'block', fontSize: 12, fontWeight: 600, opacity: 0.75, marginTop: 2 }}>
                Sent {formatChicagoTime(sentAt)}
            </span>
        </div>
        {onDelete && <button type="button" data-testid="delete-reliability-message" aria-label="Delete Message" title="Delete Message"
            disabled={deleting} onClick={remove}
            style={{ flex: '0 0 auto', minWidth: 44, minHeight: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                gap: 4, padding: '0 10px', borderRadius: 10, border: `1px solid ${C.border}`, background: C.card, color: C.red || C.text,
                fontSize: 13, fontWeight: 700, cursor: deleting ? 'default' : 'pointer', opacity: deleting ? 0.6 : 1, fontFamily: 'inherit' }}>
            <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>×</span>{deleting ? 'Deleting' : 'Delete'}
        </button>}
    </div>;
}
