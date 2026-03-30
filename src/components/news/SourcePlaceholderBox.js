import React from 'react';

export default function SourcePlaceholderBox({ sourceName, sourceUrl, index, openExternal }) {
    const sourceInfo = {
        'PokerNews': { icon: '', color: '#2374E1', url: 'https://www.pokernews.com' },
        'MSPT': { icon: '', color: '#dc2626', url: 'https://msptpoker.com' },
        'CardPlayer': { icon: 's', color: '#22c55e', url: 'https://www.cardplayer.com' },
        'WSOP': { icon: 'Trophy', color: '#fbbf24', url: 'https://www.wsop.com' },
        'Poker.org': { icon: 'd', color: '#8b5cf6', url: 'https://www.poker.org' },
        'Pokerfuse': { icon: '', color: '#f97316', url: 'https://pokerfuse.com' }
    };

    const info = sourceInfo[sourceName] || { icon: '📰', color: '#2374E1', url: '#' };

    return (
        <div
            className="news-box placeholder-box"
            onClick={() => openExternal(sourceUrl || info.url, `${sourceName} News`)}
        >
            <div className="box-image">
                <div className="placeholder-content">
                    <span className="placeholder-icon">{info.icon}</span>
                    <span className="placeholder-name">{sourceName}</span>
                </div>
                <div className="box-overlay" />
            </div>
            <div className="box-content">
                <h3 className="box-title">Latest from {sourceName}</h3>
                <p className="box-excerpt">Loading news from {sourceName}... Check back soon for the latest updates.</p>
                <div className="box-meta">
                    <span className="source" style={{ color: info.color }}>{sourceName}</span>
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
                .placeholder-box {
                    border-color: ${info.color}40 !important;
                }
                .placeholder-box:hover {
                    border-color: ${info.color}80 !important;
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
                    background: linear-gradient(135deg, #1a1a2e 0%, ${info.color}20 50%, #16213e 100%);
                }
                .placeholder-icon {
                    font-size: 48px;
                    margin-bottom: 8px;
                }
                .placeholder-name {
                    font-size: 14px;
                    font-weight: 600;
                    color: ${info.color};
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
