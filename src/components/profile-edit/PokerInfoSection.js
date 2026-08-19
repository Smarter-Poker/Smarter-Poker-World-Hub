import React from 'react';
import { getDaysInMonth } from './utils';
import HomeCasinoSelector from './HomeCasinoSelector';
import FavoriteHandPicker from '../profile/FavoriteHandPicker';
import dynamic from 'next/dynamic';
import { C } from './constants';
const CollapsibleSection = dynamic(() => import('./CollapsibleSection'), { ssr: false });
const ProfileField = dynamic(() => import('./ProfileField'), { ssr: false });
const PokerResumeBadge = dynamic(() => import('./PokerResumeBadge'), { ssr: false });

export default function PokerInfoSection({ profile, updateField }) {
    return (
<CollapsibleSection id="sec-poker" title="Poker Info" icon="♠️">
                        <ProfileField label="Favorite Game" value={profile.favorite_game} onChange={updateField('favorite_game')} placeholder="No Limit Hold'em" icon="" />

                        {/* Birthday — Dropdown Selectors */}
                        <div style={{ marginTop: 16 }}>
                            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.textSec, marginBottom: 6 }}>🎂 Birthday</label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <select
                                    value={profile.birthday ? profile.birthday.split('-')[1] : ''}
                                    onChange={(e) => {
                                        const parts = (profile.birthday || '--').split('-');
                                        const month = e.target.value;
                                        const year = parts[0] || '';
                                        let day = parts[2] || '';
                                        // Auto-clamp day if new month has fewer days
                                        if (day && month) {
                                            const max = getDaysInMonth(month, year);
                                            if (parseInt(day, 10) > max) day = String(max).padStart(2, '0');
                                        }
                                        updateField('birthday')(month && year && day ? `${year}-${month}-${day}` : (month || year || day ? `${year}-${month}-${day}` : ''));
                                    }}
                                    style={{
                                        flex: 1, padding: 12, fontSize: 15, borderRadius: 8,
                                        border: `1px solid ${C.border}`, background: '#ffffff',
                                        color: '#000000', boxSizing: 'border-box', cursor: 'pointer',
                                    }}
                                >
                                    <option value="">Month</option>
                                    {['January','February','March','April','May','June','July','August','September','October','November','December'].map((m, i) => (
                                        <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>
                                    ))}
                                </select>
                                <select
                                    value={profile.birthday ? profile.birthday.split('-')[2] : ''}
                                    onChange={(e) => {
                                        const parts = (profile.birthday || '--').split('-');
                                        const day = e.target.value;
                                        const year = parts[0] || '';
                                        const month = parts[1] || '';
                                        updateField('birthday')(month && year && day ? `${year}-${month}-${day}` : (month || year || day ? `${year}-${month}-${day}` : ''));
                                    }}
                                    style={{
                                        width: 80, padding: 12, fontSize: 15, borderRadius: 8,
                                        border: `1px solid ${C.border}`, background: '#ffffff',
                                        color: '#000000', boxSizing: 'border-box', cursor: 'pointer',
                                    }}
                                >
                                    <option value="">Day</option>
                                    {(() => {
                                        const parts = (profile.birthday || '--').split('-');
                                        const maxDay = getDaysInMonth(parts[1], parts[0]);
                                        return Array.from({ length: maxDay }, (_, i) => (
                                            <option key={i + 1} value={String(i + 1).padStart(2, '0')}>{i + 1}</option>
                                        ));
                                    })()}
                                </select>
                                <select
                                    value={profile.birthday ? profile.birthday.split('-')[0] : ''}
                                    onChange={(e) => {
                                        const parts = (profile.birthday || '--').split('-');
                                        const year = e.target.value;
                                        const month = parts[1] || '';
                                        const day = parts[2] || '';
                                        updateField('birthday')(month && year && day ? `${year}-${month}-${day}` : (month || year || day ? `${year}-${month}-${day}` : ''));
                                    }}
                                    style={{
                                        width: 100, padding: 12, fontSize: 15, borderRadius: 8,
                                        border: `1px solid ${C.border}`, background: '#ffffff',
                                        color: '#000000', boxSizing: 'border-box', cursor: 'pointer',
                                    }}
                                >
                                    <option value="">Year</option>
                                    {Array.from({ length: 80 }, (_, i) => {
                                        const yr = new Date().getFullYear() - 16 - i;
                                        return <option key={yr} value={String(yr)}>{yr}</option>;
                                    })}
                                </select>
                                {profile.birthday && (
                                    <div style={{ fontSize: 12, color: C.gold, fontWeight: 600, whiteSpace: 'nowrap' }}>
                                        💎 300
                                    </div>
                                )}
                            </div>
                            <div style={{ fontSize: 11, color: C.textSec, marginTop: 4, opacity: 0.7 }}>
                                Earn 300 diamonds on your birthday (accounts must be 60+ days old)
                            </div>
                        </div>

                        {/* Home Casino - Venue Autocomplete */}
                        <div style={{ marginTop: 16 }}>
                            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.textSec, marginBottom: 6 }}>🏨 Home Casino</label>
                            <HomeCasinoSelector
                                value={profile.home_casino}
                                onChange={(name) => updateField('home_casino')(name)}
                            />
                        </div>

                        <FavoriteHandPicker
                            value={profile.favorite_hand}
                            gameType="holdem"
                            onChangeValue={updateField('favorite_hand')}
                        />
                        <FavoriteHandPicker
                            value={profile.favorite_hand_plo}
                            gameType="plo"
                            onChangeValue={updateField('favorite_hand_plo')}
                        />
                    </CollapsibleSection>
    );
}
