import { C } from './constants';

function PokerResumeBadge({ hendonData, onRefresh, isRefreshing, syncStatus }) {
    if (!hendonData?.hendon_url) return null;

    const hasData = hendonData.total_cashes != null || hendonData.total_earnings != null;

    return (
        <div style={{
            background: 'linear-gradient(135deg, #0a0a1a 0%, #1a1a3e 50%, #0d0d2e 100%)',
            borderRadius: 16, padding: 24, color: 'white', marginTop: 16,
            border: '1px solid rgba(255, 215, 0, 0.3)',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 215, 0, 0.1)'
        }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                        width: 48, height: 48, borderRadius: '50%',
                        background: 'linear-gradient(135deg, #FFD700, #FFA500)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 24, boxShadow: '0 2px 10px rgba(255, 215, 0, 0.4)'
                    }}>🏆</div>
                    <div>
                        <div style={{ fontWeight: 700, fontSize: 20, letterSpacing: 0.5 }}>POKER RESUME</div>
                        <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>HendonMob Stats</div>
                    </div>
                </div>
                {hasData && (
                    <div style={{
                        background: 'rgba(0, 255, 136, 0.2)',
                        border: '1px solid rgba(0, 255, 136, 0.5)',
                        padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                        color: '#00FF88'
                    }}>
                        SYNCED
                    </div>
                )}
            </div>

            {hasData ? (
                <>
                    {/* Stats Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                        <div style={{
                            background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 16, textAlign: 'center',
                            border: '1px solid rgba(255,255,255,0.1)'
                        }}>
                            <div style={{ fontSize: 32, fontWeight: 800, color: C.gold, textShadow: '0 0 10px rgba(255, 215, 0, 0.3)' }}>
                                {hendonData.total_cashes?.toLocaleString() || '—'}
                            </div>
                            <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4, textTransform: 'uppercase', letterSpacing: 1 }}>Cashes</div>
                        </div>
                        <div style={{
                            background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 16, textAlign: 'center',
                            border: '1px solid rgba(255,255,255,0.1)'
                        }}>
                            <div style={{ fontSize: 32, fontWeight: 800, color: '#00ff88', textShadow: '0 0 10px rgba(0, 255, 136, 0.3)' }}>
                                ${hendonData.total_earnings?.toLocaleString() || '—'}
                            </div>
                            <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4, textTransform: 'uppercase', letterSpacing: 1 }}>Earnings</div>
                        </div>
                        <div style={{
                            background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 16, textAlign: 'center',
                            border: '1px solid rgba(255,255,255,0.1)'
                        }}>
                            <div style={{ fontSize: 32, fontWeight: 800, color: '#00d4ff', textShadow: '0 0 10px rgba(0, 212, 255, 0.3)' }}>
                                ${hendonData.biggest_cash?.toLocaleString() || hendonData.best_finish || '—'}
                            </div>
                            <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4, textTransform: 'uppercase', letterSpacing: 1 }}>BIGGEST CASH</div>
                        </div>
                    </div>

                    {/* Last Updated + Re-sync */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
                        {hendonData.last_scraped && (
                            <div style={{ fontSize: 11, opacity: 0.4 }}>
                                Last synced: {new Date(hendonData.last_scraped).toLocaleDateString()}
                            </div>
                        )}
                        <button
                            onClick={onRefresh}
                            disabled={isRefreshing}
                            style={{
                                background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)',
                                padding: '6px 16px', borderRadius: 20, fontSize: 12, cursor: isRefreshing ? 'wait' : 'pointer',
                                opacity: isRefreshing ? 0.7 : 1
                            }}
                        >
                            {isRefreshing ? '🔄 Syncing...' : '🔄 Re-sync'}
                        </button>
                    </div>
                </>
            ) : (
                /* No data yet - show sync button with better status */
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                    {isRefreshing ? (
                        <>
                            <div style={{ fontSize: 48, marginBottom: 12, animation: 'spin 1s linear infinite' }}>🔄</div>
                            <div style={{ fontSize: 16, fontWeight: 600, color: C.gold, marginBottom: 8 }}>
                                Fetching your tournament stats...
                            </div>
                            <div style={{ fontSize: 13, opacity: 0.6 }}>
                                This may take a few seconds
                            </div>
                            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
                        </>
                    ) : (
                        <>
                            <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
                            <div style={{ fontSize: 14, opacity: 0.7, marginBottom: 16 }}>
                                Click below to fetch your tournament stats from Hendon Mob
                            </div>
                            <button
                                onClick={onRefresh}
                                style={{
                                    background: C.gold, color: '#000', border: 'none',
                                    padding: '12px 32px', borderRadius: 20, fontWeight: 700,
                                    cursor: 'pointer', fontSize: 15
                                }}
                            >
                                🔄 Sync Stats Now
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

export default PokerResumeBadge;
