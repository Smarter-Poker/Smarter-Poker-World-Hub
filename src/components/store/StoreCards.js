import React from 'react';
import { marketplaceCopy } from '../../lib/store/marketplaceCopy';
import styles from './StoreCards.module.css';

export function PackageCard({ pkg, onSelect, isSelected, onAddToCart }) {
  const totalDiamonds = (pkg.diamonds || 0) + (pkg.bonus || 0);

  return (
    <div
      className={`${styles.packageCard} ${isSelected ? styles.packageCardSelected : ''}`}
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
        <div
          className={styles.packageBadge}
          style={{
            position: 'absolute',
            top: -10,
            right: 16,
            background: 'linear-gradient(135deg, #FFD700, #FFA500)',
            color: '#0a1628',
            fontSize: 10,
            fontWeight: 700,
            padding: '4px 10px',
            borderRadius: 10,
            textTransform: 'uppercase',
          }}
        >
          Popular
        </div>
      )}
      {pkg.hasDiscount && (
        <div
          className={styles.packageBadge}
          style={{
            // Sit on the left when 'Popular' occupies the top-right corner
            position: 'absolute',
            top: -10,
            ...(pkg.popular ? { left: 16 } : { right: 16 }),
            background: 'linear-gradient(135deg, #00d4ff, #007fbd)',
            color: '#0a1628',
            fontSize: 10,
            fontWeight: 700,
            padding: '4px 10px',
            borderRadius: 10,
            textTransform: 'uppercase',
          }}
        >
          +5% Bonus
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div>
          <div
            style={{
              fontFamily: "var(--font-roboto-condensed), 'Roboto Condensed', 'Arial Narrow', Arial, sans-serif",
              fontSize: 24,
              fontWeight: 700,
              color: '#00D4FF',
            }}
          >
            {totalDiamonds.toLocaleString()}
          </div>
          {pkg.bonus > 0 && (
            <div style={{ fontSize: 11, color: '#00d4ff', fontWeight: 600 }}>
              ({(pkg.diamonds || 0).toLocaleString()} + {(pkg.bonus || 0).toLocaleString()} Bonus)
            </div>
          )}
        </div>
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, color: '#fff', marginBottom: 6 }}>
        {marketplaceCopy(pkg.name)}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>
          ${(Number(pkg.price) || 0).toFixed(2)}
        </span>
        <span
          style={{
            fontSize: 10,
            color: 'rgba(255, 255, 255, 0.5)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 2,
          }}
        >
          1 Diamond = $0.01
        </span>
      </div>
      <button
        className={styles.packageAction}
        onClick={(e) => {
          e.stopPropagation();
          onAddToCart && onAddToCart(pkg);
        }}
        style={{
          width: '100%',
          marginTop: 12,
          padding: '10px 16px',
          background: 'linear-gradient(135deg, #1877F2, #4285F4)',
          border: 'none',
          borderRadius: 8,
          color: '#fff',
          fontSize: 14,
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'transform 0.2s',
        }}
      >
        Add To Cart
      </button>
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
  const spokenTerm = lifetime
    ? 'One Payment, Never Expires'
    : `Per ${marketplaceCopy(plan.interval)}`;
  return (
    <button
      type="button"
      className={`${styles.vipCard} ${isSelected ? styles.vipCardSelected : ''}`}
      onClick={() => onSelect(plan.id)}
      aria-pressed={isSelected}
      aria-label={`Select ${marketplaceCopy(plan.name)}, $${(Number(plan.price) || 0).toFixed(2)} ${spokenTerm}`}
    >
      <img
        className={styles.vipCardArtwork}
        src="/images/vip-card.webp"
        alt=""
        width={1024}
        height={1024}
        draggable={false}
        loading="lazy"
      />
      <span className={styles.vipCardReadout}>
        <span className={styles.vipPlanName}>{marketplaceCopy(plan.name)}</span>
        <span className={styles.vipPriceRow}>
          <strong>${(Number(plan.price) || 0).toFixed(2)}</strong>
          <span>{term}</span>
        </span>
        <span className={styles.vipDiamondPrice}>
          {Math.round((Number(plan.price) || 0) * 100).toLocaleString()} Diamonds
        </span>
      </span>
    </button>
  );
}

export function MerchCard({ item, onSelect }) {
  return (
    <div
      className={styles.merchCard}
      onClick={() => onSelect(item.id)}
      style={{
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        borderRadius: 12,
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
      }}
    >
      <div
        className={styles.merchCardMedia}
        style={{
          height: 120,
          background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.1), rgba(36, 96, 126, 0.1))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 40,
        }}
      >
        <span className={styles.productFallback}>
          {item.category === 'apparel' ? 'Official Apparel' : 'Marketplace Gear'}
        </span>
      </div>
      <div style={{ padding: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 4 }}>
          {marketplaceCopy(item.name)}
        </div>
        <div
          style={{
            fontSize: 11,
            color: 'rgba(255, 255, 255, 0.5)',
            marginBottom: 8,
            lineHeight: 1.4,
          }}
        >
          {marketplaceCopy(item.description)}
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#00D4FF' }}>
          ${(Number(item.price) || 0).toFixed(2)}
        </div>
      </div>
    </div>
  );
}
