export default function ContinuityStatus({ controller, conversationId, theme }) {
    const errors = [...controller.errors.values()].filter(error => !conversationId || !error.conversationId || error.conversationId === conversationId);
    // Cross-device conflicts keep the active text/position quietly. Only
    // actionable storage, network and permission failures need a status strip.
    const visibleErrors = errors.filter(error => !(['draft', 'position'].includes(error.field)
        && error.conversationId && controller.state(error.conversationId)[error.field]?.conflict));
    if (!visibleErrors.length) return null;
    const button = { minHeight: 44, border: `1px solid ${theme.border}`, borderRadius: 6, background: theme.card, color: theme.blue, padding: '6px 10px', cursor: 'pointer' };
    return <div role="status" style={{ padding: '8px 12px', fontSize: 12, color: theme.text, background: theme.bg, borderTop: `1px solid ${theme.border}` }}>
        {visibleErrors.map((error, index) => <div key={`${error.field || 'read'}:${index}`}>
            <span>{error.message} </span><button type="button" aria-label="Retry Continuity" style={button} onClick={() => controller.retry(error)}>Retry</button>
        </div>)}
    </div>;
}
