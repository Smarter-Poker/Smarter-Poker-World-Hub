import React from 'react';
import dynamic from 'next/dynamic';
import { C } from './constants';
import { useFeatureGate } from '../gates/FeatureGatePopup';

const CollapsibleSection = dynamic(() => import('./CollapsibleSection'), { ssr: false });
const ProfileField = dynamic(() => import('./ProfileField'), { ssr: false });
const PokerResumeBadge = dynamic(() => import('./PokerResumeBadge'), { ssr: false });

export default function CardDeckPreferenceSection({ profile, updateField }) {
    const { hasAccess: isVip, guardAction, UpgradePopup } = useFeatureGate('custom_avatar');
    
    return (
<CollapsibleSection id="sec-cards" title="Card Deck Preference" icon="🎴">
                        <p style={{ fontSize: 13, color: C.textSec, marginBottom: 16 }}>
                            Choose your preferred card back design. This will be used across all games (Training, Club Arena, Diamond Arena).
                        </p>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                            {['white', 'black', 'red', 'blue'].map(deck => {
                                const isPremium = deck !== 'white';
                                const isLocked = isPremium && !isVip;

                                return (
                                <div
                                    key={deck}
                                    onClick={() => {
                                        if (isLocked) {
                                            guardAction(() => {});
                                            return;
                                        }
                                        updateField('card_back_preference')(deck);
                                    }}
                                    style={{
                                        cursor: 'pointer',
                                        borderRadius: 8,
                                        border: profile.card_back_preference === deck ? '3px solid #FFD700' : `2px solid ${C.border}`,
                                        padding: 8,
                                        textAlign: 'center',
                                        transition: 'all 0.2s ease',
                                        background: profile.card_back_preference === deck ? 'rgba(255, 215, 0, 0.1)' : 'transparent',
                                        boxShadow: profile.card_back_preference === deck ? '0 0 15px rgba(255, 215, 0, 0.3)' : 'none',
                                        position: 'relative'
                                    }}
                                >
                                    <img
                                        src={`/images/card-backs/${deck}.png`}
                                        alt={`${deck} deck`}
                                        loading="lazy"
                                        style={{
                                            width: '100%',
                                            aspectRatio: '2.5 / 3.5',
                                            objectFit: 'cover',
                                            borderRadius: 6,
                                            marginBottom: 8,
                                            background: deck === 'white' ? '#f0f0f0' : deck === 'black' ? '#1a1a1a' : 'transparent',
                                            filter: isLocked ? 'grayscale(100%) opacity(0.5)' : 'none'
                                        }}
                                    />
                                    {isLocked && (
                                        <div style={{
                                            position: 'absolute', top: 0, left: 0, right: 0, bottom: 20,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                                        }}>
                                            <span style={{ fontSize: 24 }}>🔒</span>
                                        </div>
                                    )}
                                    <div style={{
                                        fontSize: 12,
                                        fontWeight: 600,
                                        color: profile.card_back_preference === deck ? C.gold : C.textSec,
                                        textTransform: 'uppercase'
                                    }}>
                                        {profile.card_back_preference === deck && ' '}
                                        {deck}
                                    </div>
                                </div>
                            )})}
                        </div>
                        {UpgradePopup}
                    </CollapsibleSection>
    );
}
