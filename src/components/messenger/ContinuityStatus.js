export default function ContinuityStatus({ controller, conversationId, theme, onUsePosition }) {
    const draft = conversationId ? controller.state(conversationId).draft : null;
    const position = conversationId ? controller.state(conversationId).position : null;
    const errors = [...controller.errors.values()].filter(error => !conversationId || !error.conversationId || error.conversationId === conversationId);
    const pending = draft?.dirty && !controller.isSaving(conversationId, 'draft');
    if (!errors.length && !draft?.conflict && !position?.conflict && !pending) return null;
    const button = { minHeight: 44, border: `1px solid ${theme.border}`, borderRadius: 6, background: theme.card, color: theme.blue, padding: '6px 10px', cursor: 'pointer' };
    return <div role="status" style={{ padding: '8px 12px', fontSize: 12, color: theme.text, background: theme.bg, borderTop: `1px solid ${theme.border}` }}>
        {pending && !draft.conflict && <div>Draft Kept On This Device. <button type="button" style={button} onClick={() => controller.write(conversationId, 'draft')}>Save Draft To Account</button></div>}
        {draft?.conflict && <div>
            <div>Your Draft Changed In Another Tab Or Device. Your Text Is Still Here.</div>
            <button type="button" style={button} onClick={() => controller.resolve(conversationId, 'draft', true)}>Keep This Draft</button>{' '}
            <button type="button" style={button} onClick={() => controller.resolve(conversationId, 'draft', false)}>Use Saved Draft</button>
        </div>}
        {position?.conflict && <div>
            <div>Your Reading Position Changed On Another Device.</div>
            <button type="button" style={button} onClick={() => controller.resolve(conversationId, 'position', true)}>Keep This Position</button>{' '}
            <button type="button" style={button} onClick={() => { controller.resolve(conversationId, 'position', false); onUsePosition?.(controller.state(conversationId).position); }}>Use Saved Position</button>
        </div>}
        {errors.filter(error => !(error.field === 'draft' && draft?.conflict) && !(error.field === 'position' && position?.conflict)).map((error, index) => <div key={`${error.field || 'read'}:${index}`}>
            <span>{error.message} </span><button type="button" aria-label="Retry Continuity" style={button} onClick={() => controller.retry(error)}>Retry</button>
        </div>)}
    </div>;
}
