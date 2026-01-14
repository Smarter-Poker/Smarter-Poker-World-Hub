/* ═══════════════════════════════════════════════════════════════════════════
   LIVE STREAM CARD — Preview card for live streams in the feed
   Shows thumbnail, broadcaster info, and viewer count
   ═══════════════════════════════════════════════════════════════════════════ */

const C = {
    card: '#FFFFFF',
    text: '#050505',
    textSec: '#65676B',
    border: '#DADDE1',
    red: '#FA383E',
};

export function LiveStreamCard({ stream, onClick }) {
    return (
        <div
            onClick={onClick}
            style={{
                background: C.card,
                borderRadius: 8,
                overflow: 'hidden',
                boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                cursor: 'pointer',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.1)';
            }}
        >
            {/* Thumbnail / Placeholder */}
            <div
                style={{
                    position: 'relative',
                    aspectRatio: '16/9',
                    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                {stream.thumbnail_url ? (
                    <img
                        src={stream.thumbnail_url}
                        alt={stream.title}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                ) : (
                    <div style={{ fontSize: 48, opacity: 0.5 }}>📺</div>
                )}

                {/* LIVE Badge */}
                <div
                    style={{
                        position: 'absolute',
                        top: 10,
                        left: 10,
                        background: C.red,
                        color: 'white',
                        padding: '4px 10px',
                        borderRadius: 4,
                        fontSize: 12,
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        animation: 'pulse 1.5s infinite',
                    }}
                >
                    🔴 LIVE
                </div>

                {/* Viewer Count */}
                <div
                    style={{
                        position: 'absolute',
                        bottom: 10,
                        right: 10,
                        background: 'rgba(0, 0, 0, 0.7)',
                        color: 'white',
                        padding: '4px 8px',
                        borderRadius: 4,
                        fontSize: 12,
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                    }}
                >
                    👁️ {stream.viewer_count || 0}
                </div>
            </div>

            {/* Stream Info */}
            <div style={{ padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <img
                        src={stream.profiles?.avatar_url || '/default-avatar.png'}
                        alt={stream.profiles?.username}
                        style={{ width: 36, height: 36, borderRadius: '50%' }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                            style={{
                                fontWeight: 600,
                                color: C.text,
                                fontSize: 14,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {stream.title || 'Live Stream'}
                        </div>
                        <div style={{ color: C.textSec, fontSize: 13 }}>
                            {stream.profiles?.username || 'Anonymous'}
                        </div>
                    </div>
                </div>
            </div>

            {/* Pulse animation */}
            <style jsx global>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
      `}</style>
        </div>
    );
}

export default LiveStreamCard;
