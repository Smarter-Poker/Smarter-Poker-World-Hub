import React, { useEffect, useRef, useState } from 'react';
import { safeCopyToClipboard } from '../../lib/clipboard';

// Copies the handoff text and says what actually happened. getText is read at
// the moment of the tap, so the copy starts inside the user gesture that
// mobile Safari and in-app webviews require.
export default function CopyAgentHandoffButton({ getText, style, statusStyle }) {
    const [outcome, setOutcome] = useState(null);
    const timer = useRef(null);
    useEffect(() => () => clearTimeout(timer.current), []);

    const copy = async (event) => {
        event.stopPropagation();
        const copied = await safeCopyToClipboard(getText());
        setOutcome(copied ? 'copied' : 'failed');
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setOutcome(null), 4000);
    };

    return <>
        <button type="button" data-testid="copy-agent-handoff" onClick={copy} style={style}>
            {outcome === 'copied' ? 'Handoff Copied' : 'Copy Agent Handoff'}
        </button>
        <span role="status" aria-live="polite" style={{ flexBasis: '100%', ...statusStyle, display: outcome === 'failed' ? 'block' : 'none' }}>
            {outcome === 'failed' ? 'Copy Failed. Select The Text And Copy It Manually.' : ''}
        </span>
    </>;
}
