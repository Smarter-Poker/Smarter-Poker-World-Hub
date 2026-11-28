/**
 * TableCustomizers · Full Club Arena Table Appearance Picker
 * ═══════════════════════════════════════════════════════════════════════════
 * Lazy-loaded inside SetupSheet. Exposes all Club Arena Table Skins, Room
 * Backdrops, Card Backs, Dealer Buttons, and 4-Color vs. 2-Color Deck styles.
 * Respects locked Club Arena table themes with an optional Sandbox-only
 * Preview Override toggle.
 */
import React from 'react';
import { Lock, Unlock } from 'lucide-react';
import {
    CLUB_ARENA_SKINS,
    CLUB_ARENA_BACKGROUNDS,
    CLUB_ARENA_CARD_BACKS,
    CLUB_ARENA_DEALER_BUTTONS,
} from '../../lib/clubArenaTheme';
import { T, F, S, R, btn, pill, sectionTitle } from './paTokens';

const DECK_STYLES = [
    { id: '4color', label: '4-Color Arena Deck' },
    { id: '2color', label: '2-Color Classic Deck' },
];

export default function TableCustomizers({
    tableSkinId = 'classic_green',
    onChangeSkin,
    roomBgId = 'midnight',
    onChangeRoomBg,
    cardBackId = 'classic_blue',
    onChangeCardBack,
    dealerButtonId = 'classic-white',
    onChangeDealerButton,
    deckStyle = '4color',
    onChangeDeckStyle,
    arenaThemeActive = false,
    previewOverride = false,
    onTogglePreviewOverride,
}) {
    const locked = Boolean(arenaThemeActive && !previewOverride);

    return (
        <div data-table-customizers="true" style={{ display: 'flex', flexDirection: 'column', gap: S.md }}>
            {/* Lock Banner + Preview Override Toggle */}
            {arenaThemeActive && (
                <div style={{
                    padding: '10px 12px',
                    borderRadius: R.sm,
                    background: T.surface2,
                    border: `1px solid ${previewOverride ? T.accent : T.borderHi}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: S.sm,
                    flexWrap: 'wrap',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        {locked
                            ? <Lock size={15} strokeWidth={2} color={T.accent} aria-hidden="true" />
                            : <Unlock size={15} strokeWidth={2} color={T.success} aria-hidden="true" />}
                        <span style={{ fontSize: F.caption, fontWeight: 700, color: T.text }}>
                            {locked ? 'Locked Club Arena Theme Active' : 'Sandbox Preview Override Active'}
                        </span>
                    </div>
                    {onTogglePreviewOverride && (
                        <button
                            type="button"
                            className="pa-btn"
                            aria-pressed={previewOverride}
                            onClick={() => onTogglePreviewOverride(!previewOverride)}
                            style={{ ...btn(previewOverride ? 'primary' : 'secondary'), minHeight: 36, padding: '0 12px', fontSize: F.caption }}
                        >
                            {previewOverride ? 'Use Club Arena Lock' : 'Preview Override'}
                        </button>
                    )}
                </div>
            )}

            {/* Deck Style (4-Color vs. 2-Color) */}
            <div>
                <div style={sectionTitle}>Playing Card Deck</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: S.sm }}>
                    {DECK_STYLES.map((d) => {
                        const active = deckStyle === d.id;
                        return (
                            <button
                                key={d.id}
                                type="button"
                                className="pa-btn"
                                aria-pressed={active}
                                onClick={() => onChangeDeckStyle?.(d.id)}
                                style={{
                                    ...btn(active ? 'primary' : 'secondary'),
                                    padding: '0 10px',
                                    fontSize: F.caption,
                                    width: '100%',
                                }}
                            >
                                <span>{d.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Club Arena Table Skins */}
            <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: S.sm, marginBottom: S.xs }}>
                    <span style={{ ...sectionTitle, marginBottom: 0 }}>Club Arena Table Skins</span>
                    <span style={pill('neutral')}>{CLUB_ARENA_SKINS.length} Skins</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: S.xs }}>
                    {CLUB_ARENA_SKINS.map((skin) => {
                        const active = tableSkinId === skin.id;
                        return (
                            <button
                                key={skin.id}
                                type="button"
                                className="pa-btn"
                                disabled={locked}
                                aria-pressed={active}
                                onClick={() => onChangeSkin?.(skin.id)}
                                style={{
                                    ...btn('secondary', { disabled: locked }),
                                    padding: '0 8px',
                                    fontSize: F.caption,
                                    minHeight: 40,
                                    borderColor: active ? T.accent : T.borderHi,
                                    justifyContent: 'flex-start',
                                }}
                            >
                                <span
                                    aria-hidden="true"
                                    style={{
                                        width: 12, height: 12, borderRadius: '50%',
                                        background: skin.swatch,
                                        border: '1px solid rgba(255,255,255,0.45)',
                                        flexShrink: 0,
                                    }}
                                />
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {skin.label}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Club Arena Room Backdrops */}
            <div>
                <div style={sectionTitle}>Room Backdrops</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: S.xs }}>
                    {CLUB_ARENA_BACKGROUNDS.map((bg) => {
                        const active = roomBgId === bg.id;
                        return (
                            <button
                                key={bg.id}
                                type="button"
                                className="pa-btn"
                                disabled={locked}
                                aria-pressed={active}
                                onClick={() => onChangeRoomBg?.(bg.id)}
                                style={{
                                    ...btn('secondary', { disabled: locked }),
                                    padding: '0 8px',
                                    fontSize: F.caption,
                                    minHeight: 40,
                                    borderColor: active ? T.accent : T.borderHi,
                                    justifyContent: 'flex-start',
                                }}
                            >
                                <span
                                    aria-hidden="true"
                                    style={{
                                        width: 12, height: 12, borderRadius: 3,
                                        background: bg.swatch,
                                        border: '1px solid rgba(255,255,255,0.4)',
                                        flexShrink: 0,
                                    }}
                                />
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {bg.label}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Club Arena Card Backs */}
            <div>
                <div style={sectionTitle}>Card Backs ({CLUB_ARENA_CARD_BACKS.length})</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: S.xs }}>
                    {CLUB_ARENA_CARD_BACKS.map((back) => {
                        const active = cardBackId === back.id;
                        return (
                            <button
                                key={back.id}
                                type="button"
                                className="pa-btn"
                                disabled={locked}
                                aria-pressed={active}
                                onClick={() => onChangeCardBack?.(back.id)}
                                style={{
                                    ...btn('secondary', { disabled: locked }),
                                    padding: '0 8px',
                                    fontSize: F.caption,
                                    minHeight: 40,
                                    borderColor: active ? T.accent : T.borderHi,
                                    justifyContent: 'flex-start',
                                }}
                            >
                                <span
                                    aria-hidden="true"
                                    style={{
                                        width: 10, height: 14, borderRadius: 2,
                                        background: back.swatch,
                                        border: '1px solid rgba(255,255,255,0.45)',
                                        flexShrink: 0,
                                    }}
                                />
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {back.label}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Club Arena Dealer Buttons */}
            <div>
                <div style={sectionTitle}>Dealer Buttons ({CLUB_ARENA_DEALER_BUTTONS.length})</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: S.xs }}>
                    {CLUB_ARENA_DEALER_BUTTONS.map((btnDesign) => {
                        const active = dealerButtonId === btnDesign.id;
                        return (
                            <button
                                key={btnDesign.id}
                                type="button"
                                className="pa-btn"
                                disabled={locked}
                                aria-pressed={active}
                                onClick={() => onChangeDealerButton?.(btnDesign.id)}
                                style={{
                                    ...btn('secondary', { disabled: locked }),
                                    padding: '0 10px',
                                    fontSize: F.caption,
                                    minHeight: 40,
                                    borderColor: active ? T.accent : T.borderHi,
                                    justifyContent: 'flex-start',
                                }}
                            >
                                <span
                                    aria-hidden="true"
                                    style={{
                                        width: 18, height: 18, borderRadius: '50%',
                                        background: btnDesign.bg,
                                        color: btnDesign.color,
                                        fontSize: 12,
                                        fontWeight: 900,
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        border: '1px solid rgba(10, 22, 36, 0.85)',
                                        flexShrink: 0,
                                    }}
                                >
                                    D
                                </span>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {btnDesign.label}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
