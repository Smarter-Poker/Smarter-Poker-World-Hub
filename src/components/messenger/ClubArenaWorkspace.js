import React from 'react';

export default function ClubArenaWorkspace({ clubs, open, clubId, folder, onEnter, onExit, onFolder, unreadCounts, clubUnread, theme: C }) {
    if (!clubs.length) return null;
    const club = clubs.find(c => c.id === clubId);
    const button = { background: C.card, color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px', cursor: 'pointer', font: 'inherit' };
    const badge = count => count > 0 ? <span aria-label={`${count} Unread`} style={{ display: 'inline-block', marginLeft: 6, minWidth: 20, padding: '1px 5px', borderRadius: 12, background: C.red || '#E4405F', color: '#fff', fontSize: 12, fontWeight: 700 }}>{count > 99 ? '99+' : count}</span> : null;
    const clubTotal = Object.values(clubUnread || {}).reduce((sum, counts) => sum + counts.messages + counts.invoices, 0);
    return <section aria-label="Club Arena" style={{ padding: '8px 16px 12px', borderBottom: `1px solid ${C.border}` }}>
        <button type="button" aria-expanded={open} aria-controls="club-arena-workspace"
            style={{ ...button, width: '100%', textAlign: 'left', fontWeight: 700 }}
            onClick={() => open ? onExit() : onEnter(clubs[0])}>
            ♠ Club Arena {badge(clubTotal)}<span style={{ float: 'right' }}>{open ? '▾' : '▸'}</span>
        </button>
        {open && <div id="club-arena-workspace" style={{ paddingTop: 10 }}>
            <label style={{ display: 'block', color: C.textSec, fontSize: 12 }}>
                Your Club
                <select aria-label="Your Club" value={clubId || ''} onChange={e => onEnter(clubs.find(c => c.id === e.target.value))}
                    style={{ ...button, width: '100%', marginTop: 5 }}>
                    {clubs.map(c => {
                        const count = (clubUnread?.[c.id]?.messages || 0) + (clubUnread?.[c.id]?.invoices || 0);
                        return <option key={c.id} value={c.id}>{c.name}{count > 0 ? ` (${count} Unread)` : ''}</option>;
                    })}
                </select>
            </label>
            <div role="tablist" aria-label="Club Arena Inbox" style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                {['messages', 'invoices'].map(tab => <button key={tab} type="button" role="tab"
                    aria-selected={folder === tab} onClick={() => onFolder(tab)}
                    style={{ ...button, flex: 1, color: folder === tab ? C.blue : C.text, borderColor: folder === tab ? C.blue : C.border }}>
                    {tab === 'invoices' ? 'Invoices' : 'Messages'}
                    {badge(unreadCounts?.[tab])}
                </button>)}
            </div>
            {folder === 'invoices' && <p style={{ fontSize: 12, lineHeight: 1.5, color: C.textSec, margin: '10px 0 0' }}>
                {club?.canManage ? 'Weekly Club Statements And Invoice Discussions' : 'Your Invoices And Invoice Discussions'}
            </p>}
        </div>}
    </section>;
}
