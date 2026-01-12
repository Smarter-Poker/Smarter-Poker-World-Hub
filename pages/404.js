export default function Custom404() {
    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#0a0a12',
            color: '#fff',
            fontFamily: 'Inter, sans-serif',
        }}>
            <div style={{ textAlign: 'center' }}>
                <h1 style={{ fontSize: 72, marginBottom: 16, color: '#00D4FF' }}>404</h1>
                <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.7)' }}>Page not found</p>
                <a href="/hub" style={{
                    display: 'inline-block',
                    marginTop: 24,
                    padding: '12px 32px',
                    background: '#00D4FF',
                    color: '#000',
                    textDecoration: 'none',
                    borderRadius: 8,
                    fontWeight: 600,
                }}>
                    Go to Hub
                </a>
            </div>
        </div>
    );
}
