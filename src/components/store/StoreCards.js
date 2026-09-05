import React from 'react';
import { Gem, Shirt, Package } from 'lucide-react';
import { marketplaceCopy } from '../../lib/store/marketplaceCopy';

export function PackageCard({ pkg, onSelect, isSelected, onAddToCart }) {
    const totalDiamonds = (pkg.diamonds || 0) + (pkg.bonus || 0);

    return (
        <div
            onClick={() => onSelect(pkg.id)}
            style={{
                position: 'relative',
                background: isSelected
                    ? 'linear-gradient(135deg, rgba(0, 212, 255, 0.2), rgba(36, 96, 126, 0.2))'
                    : 'rgba(255, 255, 255, 0.05)',
                border: isSelected
                    ? '2px solid #00D4FF'
                    : pkg.popular
                        ? '2px solid rgba(255, 215, 0, 0.5)'
                        : pkg.hasDiscount
                            ? '2px solid rgba(0, 212, 255, 0.4)'
                            : '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: 16,
                padding: 20,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                transform: isSelected ? 'scale(1.02)' : 'scale(1)',
            }}
        >
            {pkg.popular && (
                <div style={{
                    position: 'absolute', top: -10, right: 16,
                    background: 'linear-gradient(135deg, #FFD700, #FFA500)',
                    color: '#0a1628', fontSize: 10, fontWeight: 700,
                    padding: '4px 10px', borderRadius: 10, textTransform: 'uppercase',
                }}>Popular</div>
            )}
            {pkg.hasDiscount && (
                <div style={{
                    // Sit on the left when 'Popular' occupies the top-right corner
                    position: 'absolute', top: -10, ...(pkg.popular ? { left: 16 } : { right: 16 }),
                    background: 'linear-gradient(135deg, #00d4ff, #007fbd)',
                    color: '#0a1628', fontSize: 10, fontWeight: 700,
                    padding: '4px 10px', borderRadius: 10, textTransform: 'uppercase',
                }}>+5% Bonus</div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span style={{ fontSize: 32, display: 'flex', alignItems: 'center' }}><Gem size={32} color="#00D4FF" /></span>
                <div>
                    <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: 24, fontWeight: 700, color: '#00D4FF' }}>
                        {totalDiamonds.toLocaleString()}
                    </div>
                    {pkg.bonus > 0 && (
                        <div style={{ fontSize: 11, color: '#00d4ff', fontWeight: 600 }}>
                            ({(pkg.diamonds || 0).toLocaleString()} + {(pkg.bonus || 0).toLocaleString()} Bonus)
                        </div>
                    )}
                </div>
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#fff', marginBottom: 6 }}>{marketplaceCopy(pkg.name)}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>${(Number(pkg.price) || 0).toFixed(2)}</span>
                <span style={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.5)', display: 'inline-flex', alignItems: 'center', gap: 2 }}>1<Gem size={10} color="#00D4FF" /> = $0.01</span>
            </div>
            <button
                onClick={(e) => { e.stopPropagation(); onAddToCart && onAddToCart(pkg); }}
                style={{
                    width: '100%', marginTop: 12, padding: '10px 16px',
                    background: 'linear-gradient(135deg, #1877F2, #4285F4)',
                    border: 'none', borderRadius: 8, color: '#fff',
                    fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'transform 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
            >Add To Cart</button>
        </div>
    );
}

export function VIPCard({ plan, isSelected, onSelect }) {
  /* 2026-09-05: every VIP term is priced in USD now, so the `isDiamondCost`
     branch this carried for the retired Daily Pass is gone. Lifetime has no
     billing period, and rendering "/lifetime" after a price reads as a rate;
     it says "One Payment" instead. Without this a term with no `interval`
     rendered "/undefined". */
  const lifetime = plan.interval === 'lifetime';
  const term = lifetime ? 'One Payment' : `/${plan.interval}`;
  const spokenTerm = lifetime ? 'One Payment, Never Expires' : `Per ${marketplaceCopy(plan.interval)}`;
  return (
        <button
            type="button"
      onClick={() => onSelect(plan.id)}
            aria-pressed={isSelected}
            aria-label={`Select ${marketplaceCopy(plan.name)}, $${(Number(plan.price) || 0).toFixed(2)} ${spokenTerm}`}
      style={{
                position: 'relative', borderRadius: 16, cursor: 'pointer',
        transition: 'all 0.3s ease',
        transform: isSelected ? 'scale(1.03)' : 'scale(1)',
                flex: 1, overflow: 'hidden', background: '#000',
        border: isSelected ? '3px solid #00D4FF' : '2px solid rgba(255,255,255,0.15)',
        boxShadow: isSelected ? '0 0 30px rgba(0,212,255,0.4)' : '0 4px 20px rgba(0,0,0,0.3)',
                padding: 0, color: 'inherit', textAlign: 'left', font: 'inherit',
      }}
        >
            <img src="/images/vip-card.webp" alt={marketplaceCopy(plan.name)} width={1024} height={1024}
                style={{ width: '100%', display: 'block', borderRadius: 14 }}
                draggable={false} loading="lazy" />
            <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.6) 60%, transparent 100%)',
                padding: '40px 16px 14px', borderRadius: '0 0 14px 14px',
            }}>
                <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: 14, fontWeight: 700, color: '#FFFFFF', marginBottom: 4 }}>
                    {marketplaceCopy(plan.name)}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 28, fontWeight: 700, color: '#FFFFFF' }}>${(Number(plan.price) || 0).toFixed(2)}</span>
                    <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{term}</span>
                </div>
                {/* 100 diamonds per dollar, the platform rate. Stated on the
                    card because for lifetime it is currently the only way to
                    pay, and for the other two it is a real alternative. */}
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 4, fontSize: 12, color: '#00D4FF', fontWeight: 700 }}>
                    <Gem size={14} color="#00D4FF" aria-hidden="true" />
                    {Math.round((Number(plan.price) || 0) * 100).toLocaleString()} Diamonds
                </div>
            </div>
        </button>
  );
}

export function MerchCard({ item, onSelect }) {
    return (
        <div
            onClick={() => onSelect(item.id)}
            style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: 12, overflow: 'hidden', cursor: 'pointer',
                transition: 'all 0.2s ease',
            }}
        >
            <div style={{
                height: 120,
                background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.1), rgba(36, 96, 126, 0.1))',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40,
            }}>
                {item.category === 'apparel' ? <Shirt size={40} color="#a8b2d1" /> : <Package size={40} color="#a8b2d1" />}
            </div>
            <div style={{ padding: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 4 }}>{marketplaceCopy(item.name)}</div>
                <div style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.5)', marginBottom: 8, lineHeight: 1.4 }}>
                    {marketplaceCopy(item.description)}
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#00D4FF' }}>${(Number(item.price) || 0).toFixed(2)}</div>
            </div>
        </div>
    );
}
