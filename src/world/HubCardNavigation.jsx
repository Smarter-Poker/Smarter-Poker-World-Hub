import React from 'react';

// The same filtered cards and navigation handler as the spatial carousel.
// Devices without a GPU must still be able to enter every available product.
export function HubCardNavigation({ orbs, onOrbSelect }) {
    return (
        <nav aria-label="Hub Cards" data-hub-card-navigation style={{ position: 'absolute', inset: '90px 0 80px', zIndex: 5, display: 'flex', alignItems: 'center', gap: 24, overflowX: 'auto', padding: '24px max(24px, calc(50vw - 160px))', scrollSnapType: 'x mandatory' }}>
            {orbs.map(orb => (
                <button key={orb.id} type="button" aria-label={orb.label} onClick={() => onOrbSelect(orb.id)} style={{ flex: '0 0 min(320px, 75vw)', border: 0, padding: 0, borderRadius: 20, background: orb.color, cursor: 'pointer', scrollSnapAlign: 'center' }}>
                    {orb.imageUrl ? <img src={orb.imageUrl} alt={orb.label} style={{ display: 'block', width: '100%', borderRadius: 20 }} /> : orb.label}
                </button>
            ))}
        </nav>
    );
}
