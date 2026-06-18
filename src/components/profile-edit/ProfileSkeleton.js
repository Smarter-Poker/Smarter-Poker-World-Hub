

function ProfileSkeleton() {
    const shimmer = `
        @keyframes profileShimmer {
            0% { background-position: -200% 0; }
            100% { background-position: 200% 0; }
        }
    `;
    const bar = (w, h = 16, mb = 12) => ({
        width: w, height: h, borderRadius: h / 2, marginBottom: mb,
        background: 'linear-gradient(90deg, #E4E6EB 25%, #F0F2F5 50%, #E4E6EB 75%)',
        backgroundSize: '200% 100%',
        animation: 'profileShimmer 1.5s ease-in-out infinite',
    });
    return (
        <div style={{ minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box', background: '#F0F2F5' }}>
            <style>{shimmer}</style>
            {/* Cover area */}
            <div style={{ height: 200, ...bar('100%', 200, 0), borderRadius: 0 }} />
            {/* Avatar */}
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: -60, position: 'relative', zIndex: 2 }}>
                <div style={{ ...bar(120, 120, 0), borderRadius: '50%', border: '4px solid #F0F2F5' }} />
            </div>
            {/* Stats */}
            <div style={{ display: 'flex', justifyContent: 'space-around', padding: '60px 40px 20px', maxWidth: 600, margin: '0 auto' }}>
                {[1,2,3,4].map(i => <div key={i} style={{ textAlign: 'center' }}><div style={bar(48, 24, 6)} /><div style={bar(56, 12)} /></div>)}
            </div>
            {/* Fields */}
            <div style={{ maxWidth: 600, margin: '0 auto', padding: '0 20px' }}>
                <div style={bar('100%', 48, 16)} />
                <div style={bar('100%', 48, 16)} />
                <div style={bar('60%', 48, 16)} />
            </div>
        </div>
    );
}

export default ProfileSkeleton;
