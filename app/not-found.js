// Explicit App Router not-found page (see app/layout.js for why this exists).
// Mirrors Next's default 404 presentation. Pages Router 404s still render
// pages/404.js; this serves only App Router unmatched paths.
export default function NotFound() {
  return (
    <div
      style={{
        fontFamily:
          'system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        color: '#000',
        background: '#fff',
      }}
    >
      <div>
        <h1
          style={{
            display: 'inline-block',
            margin: '0 20px 0 0',
            paddingRight: 23,
            fontSize: 24,
            fontWeight: 500,
            verticalAlign: 'top',
            lineHeight: '49px',
            borderRight: '1px solid rgba(0,0,0,.3)',
          }}
        >
          404
        </h1>
        <div style={{ display: 'inline-block' }}>
          <h2 style={{ fontSize: 14, fontWeight: 400, lineHeight: '49px', margin: 0 }}>
            This page could not be found.
          </h2>
        </div>
      </div>
    </div>
  );
}
