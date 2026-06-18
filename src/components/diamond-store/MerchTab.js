import React from 'react';
import { MerchCard } from '../store/StoreCards';
import styles from './diamondStoreStyles';

export default function MerchTab({ handleMerchPurchase }) {
    return (
        <>

                            <>
                                <div style={styles.intro}>
                                    <h2 style={styles.merchTitle}>Official Merch</h2>
                                    <p style={styles.introText}>
                                        Rep The Smarter.Poker Brand At The Tables. Premium Quality Gear For Serious Players.
                                    </p>
                                    {isVip && (
                                        <div style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 8,
                                            marginTop: 12,
                                            background: 'linear-gradient(135deg, #FFD700, #FFA500)',
                                            color: '#000',
                                            padding: '8px 16px',
                                            borderRadius: 20,
                                            fontSize: 13,
                                            fontWeight: 800,
                                            boxShadow: '0 2px 8px rgba(255,215,0,0.4)',
                                            letterSpacing: '0.5px',
                                        }}>
                                            <Crown size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} /> VIP — 10% OFF ALL PHYSICAL MERCH
                                        </div>
                                    )}
                                </div>

                                {/* Apparel Section */}
                                <div style={styles.merchSection}>
                                    <h3 style={styles.merchCategoryTitle}>Apparel</h3>
                                    <div style={styles.merchGrid}>
                                        {MERCHANDISE.filter(m => m.category === 'apparel').map(item => (
                                            <MerchCard key={item.id} item={item} onSelect={handleMerchPurchase} />
                                        ))}
                                    </div>
                                </div>

                                {/* Accessories Section */}
                                <div style={styles.merchSection}>
                                    <h3 style={styles.merchCategoryTitle}>Accessories</h3>
                                    <div style={styles.merchGrid}>
                                        {MERCHANDISE.filter(m => m.category === 'accessories').map(item => (
                                            <MerchCard key={item.id} item={item} onSelect={handleMerchPurchase} />
                                        ))}
                                    </div>
                                </div>
                            </>
                        
        </>
    );
}