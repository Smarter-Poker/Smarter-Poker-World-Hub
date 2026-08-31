import React, { useState } from 'react';
import SheetShell from './SheetShell';
import { useComposeStore } from '../../../../stores/composeStore';

/**
 * AddTopicsSheet — pick topics from a curated list, or add free-form ones.
 * Topics are stored as slugs in social_posts.topics TEXT[].
 */
const SUGGESTED = [
    'hand-history',
    'tournament-results',
    'cash-game',
    'mtt',
    'sng',
    'live-poker',
    'online-poker',
    'gto-strategy',
    'bankroll-mgmt',
    'mental-game',
    'tells',
    'wsop',
    'wpt',
    'casino-life',
    'home-games',
    'poker-news',
    'staking',
    'high-stakes',
    'low-stakes',
    'micro-stakes',
];

const slugify = (s) => String(s || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);

export default function AddTopicsSheet({ onClose }) {
    const topics = useComposeStore(s => s.topics);
    const setTopics = useComposeStore(s => s.setTopics);
    const [query, setQuery] = useState('');

    const isPicked = (t) => topics.includes(t);
    const togglePick = (t) => {
        if (isPicked(t)) setTopics(topics.filter(x => x !== t));
        else setTopics([...topics, t]);
    };

    const filtered = query
        ? SUGGESTED.filter(t => t.includes(query.toLowerCase()))
        : SUGGESTED;

    const customTopic = query && !SUGGESTED.includes(slugify(query))
        ? slugify(query)
        : null;

    return (
        <SheetShell
            title="Topics"
            onClose={onClose}
            rightAction={
                <button
                    onClick={onClose}
                    style={{
                        background: 'none', border: 'none', color: '#1877F2',
                        fontSize: 16, fontWeight: 600, padding: 8, cursor: 'pointer',
                    }}
                >Done</button>
            }
        >
            <div style={{ padding: 16 }}>
                <div style={{
                    background: '#f0f2f5', borderRadius: 10,
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                }}>
                    <span aria-hidden="true">&#X1F50D;</span>
                    <input
                        autoFocus
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search or add a new topic"
                        style={{
                            flex: 1, border: 'none', background: 'transparent',
                            outline: 'none', fontSize: 15,
                        }}
                    />
                </div>
            </div>

            {topics.length > 0 && (
                <div style={{ padding: '0 16px 12px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {topics.map(t => (
                        <span
                            key={t}
                            onClick={() => togglePick(t)}
                            style={{
                                background: '#1877F2', color: '#fff',
                                padding: '4px 10px', borderRadius: 999,
                                fontSize: 13, fontWeight: 600, cursor: 'pointer',
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                            }}
                        >#{t} <span aria-hidden="true">&#X2715;</span></span>
                    ))}
                </div>
            )}

            {customTopic && (
                <button
                    onClick={() => { togglePick(customTopic); setQuery(''); }}
                    style={{
                        width: '100%', display: 'flex', gap: 12, alignItems: 'center',
                        padding: '12px 16px', background: 'none', border: 'none',
                        borderTop: '1px solid #e4e6eb', cursor: 'pointer', textAlign: 'left',
                        color: '#1877F2', fontWeight: 600, fontSize: 14,
                    }}
                >
                    <span aria-hidden="true" style={{ fontSize: 20 }}>&#Xff0b;</span>
                    Add New Topic: #{customTopic}
                </button>
            )}

            <div style={{ paddingTop: 8 }}>
                {filtered.map(t => {
                    const picked = isPicked(t);
                    return (
                        <button
                            key={t}
                            onClick={() => togglePick(t)}
                            style={{
                                width: '100%', display: 'flex', gap: 12, alignItems: 'center',
                                padding: '12px 16px', background: 'none', border: 'none',
                                borderTop: '1px solid #e4e6eb', cursor: 'pointer', textAlign: 'left',
                            }}
                        >
                            <span aria-hidden="true" style={{ fontSize: 18, width: 24, textAlign: 'center', color: '#65676B' }}>&#X1F516;</span>
                            <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>#{t}</span>
                            <span aria-hidden="true" style={{
                                width: 22, height: 22, borderRadius: 4,
                                border: picked ? '2px solid #1877F2' : '2px solid #bcc0c4',
                                background: picked ? '#1877F2' : '#fff',
                                color: '#fff', fontSize: 14, fontWeight: 700,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                boxSizing: 'border-box',
                            }}>{picked ? '\u{2713}' : ''}</span>
                        </button>
                    );
                })}
            </div>
        </SheetShell>
    );
}
