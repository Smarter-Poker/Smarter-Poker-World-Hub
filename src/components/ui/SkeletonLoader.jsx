/* ═══════════════════════════════════════════════════════════════════════════
   SKELETON LOADER — Shimmer placeholder for loading states
   Matches the platform's dark metal aesthetic.

   Usage:
     <SkeletonLoader rows={5} />
     <SkeletonLoader variant="card" count={3} />
     <SkeletonLoader variant="table" rows={10} />
     <SkeletonLoader variant="profile" />
   ═══════════════════════════════════════════════════════════════════════════ */

const shimmerStyle = {
  background: 'linear-gradient(90deg, #1a1a1a 25%, #2a2a2a 50%, #1a1a1a 75%)',
  backgroundSize: '200% 100%',
  animation: 'skeleton-shimmer 1.5s infinite',
  borderRadius: 6,
};

const baseRow = (width = '100%', height = 16, mb = 12) => ({
  ...shimmerStyle,
  width,
  height,
  marginBottom: mb,
});

const CSS = `
@keyframes skeleton-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
`;

export default function SkeletonLoader({ variant = 'rows', rows = 5, count = 3, style = {} }) {
  return (
    <>
      <style>{CSS}</style>
      {variant === 'rows' && (
        <div style={{ padding: '0 4px', ...style }}>
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} style={baseRow(i % 3 === 0 ? '100%' : i % 3 === 1 ? '80%' : '60%', 16, 12)} />
          ))}
        </div>
      )}

      {variant === 'card' && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', ...style }}>
          {Array.from({ length: count }).map((_, i) => (
            <div key={i} style={{ flex: '1 1 280px', background: '#1a1a1a', borderRadius: 12, padding: 16, border: '1px solid #2a2a2a' }}>
              <div style={baseRow('60%', 20, 12)} />
              <div style={baseRow('90%', 14, 8)} />
              <div style={baseRow('75%', 14, 8)} />
              <div style={baseRow('40%', 14, 0)} />
            </div>
          ))}
        </div>
      )}

      {variant === 'table' && (
        <div style={{ ...style }}>
          {/* Header */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            {[20, 30, 20, 30].map((w, i) => (
              <div key={i} style={baseRow(`${w}%`, 14, 0)} />
            ))}
          </div>
          {/* Rows */}
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 8, padding: '10px 0', borderBottom: '1px solid #1a1a1a' }}>
              {[20, 30, 20, 30].map((w, j) => (
                <div key={j} style={baseRow(`${w}%`, 14, 0)} />
              ))}
            </div>
          ))}
        </div>
      )}

      {variant === 'profile' && (
        <div style={{ ...style }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
            <div style={{ ...shimmerStyle, width: 72, height: 72, borderRadius: '50%', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={baseRow('40%', 20, 8)} />
              <div style={baseRow('60%', 14, 0)} />
            </div>
          </div>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={baseRow(i % 2 === 0 ? '100%' : '70%', 14, 10)} />
          ))}
        </div>
      )}

      {variant === 'leaderboard' && (
        <div style={{ ...style }}>
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid #1a1a1a' }}>
              <div style={{ ...shimmerStyle, width: 32, height: 32, borderRadius: '50%', flexShrink: 0 }} />
              <div style={{ ...shimmerStyle, width: 40, height: 40, borderRadius: '50%', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={baseRow('50%', 16, 4)} />
                <div style={baseRow('30%', 12, 0)} />
              </div>
              <div style={baseRow(60, 20, 0)} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
