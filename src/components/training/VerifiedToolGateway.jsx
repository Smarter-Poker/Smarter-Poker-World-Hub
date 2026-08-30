import React from 'react';

/**
 * Keeps the post-session review drawer connected to the full, data-backed
 * training tools. Legacy inline previews used generated percentages that
 * looked authoritative but were not read from the solver or player history.
 */
export default function VerifiedToolGateway({ eyebrow, title, description, href, action, source }) {
  return (
    <section style={{ position: 'relative', overflow: 'hidden', padding: '28px clamp(18px, 4vw, 36px)', background: 'linear-gradient(145deg, rgba(13,28,45,.98), rgba(3,8,14,.98))', border: '1px solid rgba(143,226,255,.32)', borderRadius: 0, boxShadow: 'inset 0 1px rgba(255,255,255,.2), inset 0 -18px 40px rgba(0,0,0,.4), 0 18px 45px rgba(0,0,0,.35)', color: '#f8fbff' }}>
      <div style={{ position: 'relative', maxWidth: 680 }}>
        <div style={{ color: '#82e6ff', fontSize: 10, fontWeight: 900, letterSpacing: '.18em', textTransform: 'uppercase' }}>{eyebrow}</div>
        <h3 style={{ margin: '10px 0 8px', fontSize: 'clamp(22px, 4vw, 34px)', lineHeight: 1.05, textTransform: 'capitalize' }}>{title}</h3>
        <p style={{ margin: 0, maxWidth: 620, color: '#b7c9d7', fontSize: 14, lineHeight: 1.65 }}>{description}</p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 22 }}>
          <a href={href} style={{ display: 'inline-flex', minHeight: 48, alignItems: 'center', justifyContent: 'center', padding: '0 20px', border: '1px solid #9beeff', borderRadius: 0, background: 'linear-gradient(180deg, #2a5c73, #07131d)', boxShadow: 'inset 0 1px rgba(255,255,255,.28), 0 8px 20px rgba(0,0,0,.36)', color: '#fff', fontSize: 13, fontWeight: 900, textDecoration: 'none', textTransform: 'capitalize' }}>
            {action} →
          </a>
          <span style={{ color: '#668195', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase' }}>Source: {source}</span>
        </div>
      </div>
    </section>
  );
}
