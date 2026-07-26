// UNREFERENCED: nothing in the repo imports this component today (verified repo-wide) — kept pending a decision on its future.
import React from 'react';
import { Newspaper, Trophy, BookOpen, Globe, TrendingUp } from 'lucide-react';
import { SOURCE_COLORS_LOCAL, safeText, pickOwn, CardErrorBoundary } from './NewsBox';

// Per-source icon + homepage. Colors come from the shared canonical
// SOURCE_COLORS_LOCAL map so branding matches the regular news cards.
const SOURCE_INFO = {
    'PokerNews': { Icon: Newspaper, url: 'https://www.pokernews.com' },
    'MSPT': { Icon: Trophy, url: 'https://msptpoker.com' },
    'CardPlayer': { Icon: BookOpen, url: 'https://www.cardplayer.com' },
    'Card Player': { Icon: BookOpen, url: 'https://www.cardplayer.com' },
    'WSOP': { Icon: Trophy, url: 'https://www.wsop.com' },
    'Poker.org': { Icon: Globe, url: 'https://www.poker.org' },
    'Pokerfuse': { Icon: TrendingUp, url: 'https://pokerfuse.com' }
};

const DEFAULT_SOURCE_INFO = { Icon: Newspaper, url: '#' };

function SourcePlaceholderBoxBody({ sourceName, sourceUrl, index, openExternal }) {
    const name = safeText(sourceName);
    const info = pickOwn(SOURCE_INFO, name, DEFAULT_SOURCE_INFO) || DEFAULT_SOURCE_INFO;
    const accent = pickOwn(SOURCE_COLORS_LOCAL, name, '#5ef5f0');
    const color = typeof accent === 'string' ? accent : '#5ef5f0';
    const SourceIcon = info.Icon || Newspaper;
    const href = (typeof sourceUrl === 'string' && sourceUrl) ? sourceUrl : info.url;

    const openSource = () => {
        // Handler errors are outside the error boundary's reach — contain them.
        try {
            if (openExternal) openExternal(href, `${name} News`);
        } catch (err) {
            console.warn('[SourcePlaceholderBox] openExternal failed:', err?.message || err);
        }
    };

    // ACCESSIBILITY NOTE: this card contains NO nested interactive elements, so
    // a div with role="button" + tabIndex + Enter/Space is a valid single
    // interactive wrapper and does NOT trip axe's 'nested-interactive' rule
    // (unlike NewsBox, which really did contain <button>s and has been
    // restructured). If a real <button> is ever added inside this card, move
    // the interaction to a stretched <button class="card-open"> sibling the way
    // NewsBox does.
    return (
        <div
            className="news-box placeholder-box"
            style={{
                '--src-accent': color,
                '--ph-color': color,
                '--ph-color-soft': `${color}20`
            }}
            role="button"
            tabIndex={0}
            aria-label={`Visit ${name || 'source'} website`}
            onClick={openSource}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openSource();
                }
            }}
        >
            <div className="box-image">
                <div className="placeholder-content">
                    <span className="placeholder-icon" aria-hidden="true"><SourceIcon size={48} /></span>
                    <span className="placeholder-name">{name}</span>
                </div>
                <div className="box-overlay" />
            </div>
            <div className="box-content">
                <h3 className="box-title">Latest from {name}</h3>
                <p className="box-excerpt">Read the latest headlines directly on {name}.</p>
                <div className="box-meta">
                    <span className="source" style={{ color }}>{name}</span>
                    <span className="separator">•</span>
                    <span className="time">Visit Site →</span>
                </div>
            </div>

            <style jsx>{`
                .news-box {
                    position: relative;
                    background: #1a1c1e;
                    border-radius: 16px;
                    overflow: hidden;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    display: flex;
                    flex-direction: column;
                    height: 340px;
                    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
                }
                .news-box::after {
                    content: '';
                    position: absolute;
                    inset: 0;
                    border-radius: 16px;
                    border: 5px solid rgba(180, 195, 220, 0.9);
                    pointer-events: none;
                    z-index: 100;
                }
                .news-box:hover {
                    transform: translateY(-2px);
                    filter: brightness(1.05);
                }
                .news-box:focus-visible {
                    outline: 2px solid #5ef5f0;
                    outline-offset: 2px;
                }
                /* Source brand tint on the visible chrome frame on hover
                   (a border on the box itself would sit underneath ::after). */
                .placeholder-box:hover::after {
                    border-color: var(--ph-color);
                }
                .box-image {
                    position: relative;
                    width: 100%;
                    height: 240px;
                    overflow: hidden;
                    border-radius: 12px 12px 0 0;
                }
                .box-overlay {
                    position: absolute;
                    inset: 0;
                    background: linear-gradient(to top, rgba(10, 10, 18, 0.9) 0%, transparent 60%);
                    z-index: 2;
                }
                .placeholder-content {
                    position: absolute;
                    inset: 0;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    background: linear-gradient(135deg, #1a1a2e 0%, var(--ph-color-soft) 50%, #16213e 100%);
                }
                .placeholder-icon {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: var(--ph-color);
                    margin-bottom: 8px;
                }
                .placeholder-name {
                    font-size: 14px;
                    font-weight: 600;
                    color: var(--ph-color);
                    letter-spacing: 1px;
                }
                .box-content {
                    padding: 6px 8px 12px 8px;
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                    flex-grow: 1;
                }
                .box-title {
                    font-size: 13px;
                    font-weight: 600;
                    color: #fff;
                    margin: 0;
                }
                .box-excerpt {
                    font-size: 13px;
                    color: rgba(255, 255, 255, 0.6);
                    line-height: 1.5;
                }
                .box-meta {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 11px;
                    color: rgba(255, 255, 255, 0.5);
                }
                .box-meta .source {
                    font-weight: 600;
                }
                .box-meta .separator {
                    opacity: 0.3;
                }
            `}</style>
        </div>
    );
}

// MEMOISATION: made explicit so the memo is not defeated by callback identity.
// openExternal is deliberately excluded — if a future handler closes over
// fast-changing state, wrap it in useCallback at the call site rather than
// loosening this comparator.
export function areSourcePlaceholderPropsEqual(prev, next) {
    if (prev === next) return true;
    return (
        prev.sourceName === next.sourceName &&
        prev.sourceUrl === next.sourceUrl &&
        prev.index === next.index
    );
}

// A malformed source entry must not blank the grid it sits in.
function SourcePlaceholderBox(props) {
    return (
        <CardErrorBoundary key={props?.sourceName ?? 'source-placeholder'} fallback={null}>
            <SourcePlaceholderBoxBody {...props} />
        </CardErrorBoundary>
    );
}

export default React.memo(SourcePlaceholderBox, areSourcePlaceholderPropsEqual);
