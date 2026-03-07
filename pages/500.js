export default function Custom500() {
    return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0f', color: '#fff', fontFamily: 'Inter, sans-serif' }}>
            <div style={{ textAlign: 'center' }}>
                <h1 style={{ fontSize: '48px', fontWeight: 800, margin: 0 }}>500</h1>
                <p style={{ fontSize: '18px', color: '#888', marginTop: '8px' }}>Something went wrong. Please try again.</p>
            </div>
        </div>
    );
}
