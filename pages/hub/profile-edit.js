/**
 * SMARTER.POKER PROFILE PAGE - Full Editable Profile
 * SmarterPoker-style profile with HendonMob integration
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import SEOHead from '../../src/components/seo/SEOHead';
import Link from 'next/link';
import { claimReward } from '../../src/lib/claimReward';
import { useRouter } from 'next/router';

const FavoriteHandPicker = dynamic(() => import('../../src/components/profile/FavoriteHandPicker'), { ssr: false });
const CoverPhotoEditor = dynamic(() => import('../../src/components/profile/CoverPhotoEditor'), { ssr: false });
const MediaLibrary = dynamic(() => import('../../src/components/social/MediaLibrary').then(mod => mod.MediaLibrary), { ssr: false });
const ProfilePictureHistory = dynamic(() => import('../../src/components/social/ProfilePictureHistory').then(mod => mod.ProfilePictureHistory), { ssr: false });
import { useAvatar } from '../../src/contexts/AvatarContext';
import { supabase } from '../../src/lib/supabase';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import HamburgerMenu from '../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../src/config/hamburgerMenus';

// God-Mode Stack
import { useProfileStore } from '../../src/stores/profileStore';
import { getAccessToken, getAuthUser } from '../../src/lib/authUtils';
import useTrainingBus from '../../src/hooks/useTrainingBus';
import { busEmit } from '../../src/engine/EventBus';
import { broadcastSync } from '../../src/lib/broadcastSync';
import BottomNavBar from '../../src/components/ui/BottomNavBar';

// Light Theme Colors
const C = {
    bg: '#F0F2F5', card: '#FFFFFF', text: '#050505', textSec: '#65676B',
    border: '#DADDE1', blue: '#1877F2', blueHover: '#166FE5', green: '#42B72A', gold: '#FFD700',
};

// ── Shared JWT helper — eliminates 8 duplicated auth patterns ──
function getProfileJwt() {
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    try {
        const authStr = localStorage.getItem('smarter-poker-auth');
        if (authStr) {
            const parsed = JSON.parse(authStr);
            if (parsed?.access_token) return parsed.access_token;
        }
    } catch { /* fallback */ }
    return supabaseKey;
}

// Days-in-month helper for birthday validation
function getDaysInMonth(month, year) {
    if (!month) return 31;
    const m = parseInt(month, 10);
    const y = year ? parseInt(year, 10) : 2000; // default to leap year if no year
    if ([4, 6, 9, 11].includes(m)) return 30;
    if (m === 2) return (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)) ? 29 : 28;
    return 31;
}

// Max file size for uploads (5MB)
const MAX_UPLOAD_SIZE = 5 * 1024 * 1024;

// Social link URL stripping patterns
function stripSocialHandle(value, platform) {
    if (!value) return '';
    let v = value.trim();
    // Strip common URL prefixes
    const patterns = {
        twitter: [/^https?:\/\/(www\.)?(twitter|x)\.com\//i],
        instagram: [/^https?:\/\/(www\.)?instagram\.com\//i],
        tiktok: [/^https?:\/\/(www\.)?tiktok\.com\/@?/i],
        telegram: [/^https?:\/\/(www\.)?(t\.me|telegram\.me)\//i],
    };
    const plats = patterns[platform] || [];
    for (const p of plats) v = v.replace(p, '');
    // Strip leading @
    v = v.replace(/^@/, '');
    // Strip trailing slashes
    v = v.replace(/\/+$/, '');
    return v;
}

// Profile completion calculator
function calcProfileCompletion(profile) {
    const fields = [
        { key: 'first_name', weight: 1 },
        { key: 'last_name', weight: 1 },
        { key: 'username', weight: 1.5 },
        { key: 'bio', weight: 1.5 },
        { key: 'avatar_url', weight: 2 },
        { key: 'cover_photo_url', weight: 1 },
        { key: 'city', weight: 0.5 },
        { key: 'state', weight: 0.5 },
        { key: 'country', weight: 0.5 },
        { key: 'favorite_game', weight: 1 },
        { key: 'birthday', weight: 1 },
        { key: 'home_casino', weight: 1 },
    ];
    const total = fields.reduce((s, f) => s + f.weight, 0);
    const filled = fields.reduce((s, f) => {
        const v = profile[f.key];
        return s + (v && String(v).trim().length > 0 ? f.weight : 0);
    }, 0);
    return Math.round((filled / total) * 100);
}

// ── Image compression utility — reduces upload size 60-80% ──
async function compressImage(file, maxWidth = 1200, quality = 0.85) {
    return new Promise((resolve) => {
        // Skip non-image files or very small files
        if (!file.type.startsWith('image/') || file.size < 50000) {
            resolve(file);
            return;
        }
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(url);
            // Skip if already small enough
            if (img.width <= maxWidth && file.size < 200000) {
                resolve(file);
                return;
            }
            const canvas = document.createElement('canvas');
            const ratio = Math.min(maxWidth / img.width, 1);
            canvas.width = Math.round(img.width * ratio);
            canvas.height = Math.round(img.height * ratio);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            canvas.toBlob((blob) => {
                if (!blob) { resolve(file); return; }
                const compressed = new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() });
                console.warn(`[Compress] ${(file.size/1024).toFixed(0)}KB → ${(compressed.size/1024).toFixed(0)}KB (${Math.round((1-compressed.size/file.size)*100)}% reduction)`);
                resolve(compressed);
            }, 'image/jpeg', quality);
        };
        img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
        img.src = url;
    });
}

// ── Profile Completion Progress Bar ──
function ProfileCompletionBar({ profile }) {
    const fields = [
        { key: 'avatar_url', label: 'Profile Photo', weight: 15 },
        { key: 'cover_photo_url', label: 'Cover Photo', weight: 10 },
        { key: 'username', label: 'Username', weight: 15 },
        { key: 'bio', label: 'Bio', weight: 15 },
        { key: 'first_name', label: 'First Name', weight: 10 },
        { key: 'birthday', label: 'Birthday', weight: 5 },
        { key: 'home_casino', label: 'Home Casino', weight: 10 },
        { key: 'favorite_game', label: 'Favorite Game', weight: 5 },
        { key: 'favorite_hand', label: 'Favorite Hand', weight: 5 },
        { key: 'hendon_url', label: 'Poker Resume', weight: 10 },
    ];
    const completed = fields.filter(f => {
        const val = profile[f.key];
        if (!val) return false;
        if (typeof val === 'string' && !val.trim()) return false;
        return true;
    });
    const totalWeight = fields.reduce((s, f) => s + f.weight, 0);
    const earnedWeight = completed.reduce((s, f) => s + f.weight, 0);
    const percent = Math.round((earnedWeight / totalWeight) * 100);
    const missing = fields.filter(f => !completed.includes(f));

    if (percent >= 100) return null; // Don't show if complete

    const barColor = percent >= 80 ? '#42B72A' : percent >= 50 ? '#1877F2' : '#ff6b6b';

    return (
        <div style={{
            background: '#FFFFFF', borderRadius: 12, padding: 16, marginBottom: 16,
            border: '1px solid #DADDE1',
            width: '100%', boxSizing: 'border-box'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#050505' }}>Profile Strength</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: barColor }}>{percent}%</span>
            </div>
            <div style={{ height: 8, background: '#E4E6EB', borderRadius: 4, overflow: 'hidden', width: '100%' }}>
                <div style={{
                    height: '100%', width: `${percent}%`, borderRadius: 4,
                    background: `linear-gradient(90deg, ${barColor}, ${barColor}aa)`,
                    transition: 'width 0.6s ease-out',
                }} />
            </div>
            {missing.length > 0 && missing.length <= 4 && (
                <div style={{ fontSize: 11, color: '#65676B', marginTop: 8 }}>
                    Add: {missing.map(f => f.label).join(', ')}
                </div>
            )}
        </div>
    );
}

// ── Animated Toast Notification — slide-in/out with color coding ──
function Toast({ message, onDismiss, isExiting }) {
    if (!message) return null;
    const isError = message.includes('Error');
    const isUndo = message.includes('Undo');
    const bgColor = isError ? '#FEF2F2' : isUndo ? '#FFFBEB' : '#F0FDF4';
    const borderColor = isError ? 'rgba(220,38,38,0.4)' : isUndo ? 'rgba(217,119,6,0.4)' : 'rgba(22,163,74,0.4)';
    const textColor = isError ? '#DC2626' : isUndo ? '#B45309' : '#16A34A';
    const icon = isError ? '⚠️' : isUndo ? '↩️' : '✅';
    return (
        <div style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 10001,
            maxWidth: 400, minWidth: 240,
            background: bgColor,
            border: `1px solid ${borderColor}`,
            borderRadius: 12, padding: '14px 20px',
            boxShadow: `0 8px 32px ${borderColor.replace('0.4', '0.2')}`,
            display: 'flex', alignItems: 'center', gap: 12,
            animation: isExiting ? 'toastSlideOut 0.3s ease-in forwards' : 'toastSlideIn 0.3s ease-out',
            cursor: 'pointer',
            backdropFilter: 'blur(12px)',
        }} onClick={onDismiss}>
            <div style={{ fontSize: 22, flexShrink: 0 }}>{icon}</div>
            <div style={{ fontSize: 13, color: textColor, lineHeight: 1.4, fontWeight: 500, flex: 1 }}>
                {message}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.3)', flexShrink: 0 }}>✕</div>
        </div>
    );
}

// ── Loading Skeleton with shimmer ──
function ProfileSkeleton() {
    const shimmer = `
        @keyframes profileShimmer {
            0% { background-position: -200% 0; }
            100% { background-position: 200% 0; }
        }
    `;
    const bar = (w, h = 16, mb = 12) => ({
        width: w, height: h, borderRadius: h / 2, marginBottom: mb,
        background: 'linear-gradient(90deg, #E4E6EB 25%, #F0F2F5 50%, #E4E6EB 75%)',
        backgroundSize: '200% 100%',
        animation: 'profileShimmer 1.5s ease-in-out infinite',
    });
    return (
        <div style={{ minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box', background: '#F0F2F5' }}>
            <style>{shimmer}</style>
            {/* Cover area */}
            <div style={{ height: 200, ...bar('100%', 200, 0), borderRadius: 0 }} />
            {/* Avatar */}
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: -60, position: 'relative', zIndex: 2 }}>
                <div style={{ ...bar(120, 120, 0), borderRadius: '50%', border: '4px solid #F0F2F5' }} />
            </div>
            {/* Stats */}
            <div style={{ display: 'flex', justifyContent: 'space-around', padding: '60px 40px 20px', maxWidth: 600, margin: '0 auto' }}>
                {[1,2,3,4].map(i => <div key={i} style={{ textAlign: 'center' }}><div style={bar(48, 24, 6)} /><div style={bar(56, 12)} /></div>)}
            </div>
            {/* Fields */}
            <div style={{ maxWidth: 600, margin: '0 auto', padding: '0 20px' }}>
                <div style={bar('100%', 48, 16)} />
                <div style={bar('100%', 48, 16)} />
                <div style={bar('60%', 48, 16)} />
            </div>
        </div>
    );
}

// ── Collapsible Section with localStorage memory ──
function CollapsibleSection({ id, title, icon, children, defaultOpen = true }) {
    const [open, setOpen] = useState(() => {
        try {
            const saved = localStorage.getItem(`sp-section-${id}`);
            if (saved !== null) return saved === 'true';
        } catch { /* noop */ }
        return defaultOpen;
    });
    const toggle = () => {
        setOpen(o => {
            const next = !o;
            try { localStorage.setItem(`sp-section-${id}`, String(next)); } catch { /* noop */ }
            return next;
        });
    };
    return (
        <div id={id} data-section={id} style={{
            background: C.card, borderRadius: 12, marginBottom: 16,
            border: `1px solid ${C.border}`, overflow: 'hidden',
            transition: 'box-shadow 0.2s ease',
        }}>
            <button
                type="button"
                onClick={toggle}
                style={{
                    width: '100%', padding: '16px 20px',
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    color: C.text, fontSize: 17, fontWeight: 700,
                }}
            >
                <span>{icon && <span style={{ marginRight: 8 }}>{icon}</span>}{title}</span>
                <span style={{
                    fontSize: 12, color: C.textSec,
                    transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.3s ease',
                    display: 'inline-block',
                }}>▼</span>
            </button>
            <div style={{
                maxHeight: open ? '5000px' : '0',
                overflow: 'hidden',
                transition: open ? 'max-height 0.5s ease-in' : 'max-height 0.3s ease-out',
                opacity: open ? 1 : 0,
            }}>
                <div style={{ padding: '0 20px 20px' }}>
                    {children}
                </div>
            </div>
        </div>
    );
}

// ── Section Jump Navigation (floating pill bar) ──
const SECTION_NAV_ITEMS = [
    { id: 'sec-basic', label: 'Basic' },
    { id: 'sec-location', label: 'Location' },
    { id: 'sec-social', label: 'Social' },
    { id: 'sec-cards', label: 'Cards' },
    { id: 'sec-poker', label: 'Poker' },
    { id: 'sec-resume', label: 'Resume' },
];

function SectionNav() {
    const scrollTo = (id) => {
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    return (
        <div style={{
            position: 'sticky', top: 56, zIndex: 90,
            background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(12px)',
            padding: '8px 16px', margin: '0 -16px 16px',
            display: 'flex', gap: 6, overflowX: 'auto',
            borderBottom: '1px solid #DADDE1',
        }}>
            {SECTION_NAV_ITEMS.map(s => (
                <button
                    key={s.id}
                    type="button"
                    onClick={() => scrollTo(s.id)}
                    style={{
                        padding: '6px 14px', borderRadius: 20,
                        background: '#E4E6EB', border: '1px solid #DADDE1',
                        color: '#65676B', fontSize: 12, fontWeight: 600,
                        cursor: 'pointer', whiteSpace: 'nowrap',
                        transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#1877F2'; e.currentTarget.style.color = '#ffffff'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#E4E6EB'; e.currentTarget.style.color = '#65676B'; }}
                >{s.label}</button>
            ))}
        </div>
    );
}

function Avatar({ src, size = 120, onUpload, uploadPhase }) {
    const fileRef = useRef(null);

    const handleFileChange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (onUpload) onUpload(file);
        // Reset input so same file can be re-selected
        e.target.value = '';
    };

    const isUploading = !!uploadPhase;

    return (
        <div style={{ position: 'relative', cursor: isUploading ? 'wait' : 'pointer' }} onClick={(e) => { if (isUploading) return; e.stopPropagation(); fileRef.current?.click(); }}>
            <img
                src={src || '/default-avatar.png'}
                alt="Profile"
                style={{
                    width: size, height: size, borderRadius: '50%', objectFit: 'cover',
                    border: '4px solid white', boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                    filter: isUploading ? 'brightness(0.5)' : 'none',
                    transition: 'filter 0.3s ease',
                }}
            />
            {/* Upload progress overlay */}
            {isUploading && (
                <div style={{
                    position: 'absolute', top: 0, left: 0, width: size, height: size,
                    borderRadius: '50%', display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', gap: 4,
                }}>
                    <div style={{
                        width: 28, height: 28, borderRadius: '50%',
                        border: '3px solid rgba(255,255,255,0.2)',
                        borderTopColor: '#00f5ff',
                        animation: 'avatarSpin 0.8s linear infinite',
                    }} />
                    <div style={{ fontSize: 10, color: '#00f5ff', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        {uploadPhase}
                    </div>
                </div>
            )}
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleFileChange} />
            {!isUploading && (
                <div style={{
                    position: 'absolute', bottom: 4, right: 4, width: 32, height: 32, borderRadius: '50%',
                    background: C.card, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)', border: `1px solid ${C.border}`
                }}>
                    📷
                </div>
            )}
        </div>
    );
}

function ProfileField({ label, value, onChange, type = 'text', placeholder, icon, maxLength, showCount, suffix }) {
    const charCount = value ? String(value).length : 0;
    return (
        <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.textSec, marginBottom: 4, textTransform: 'capitalize' }}>
                {icon && <span style={{ marginRight: 6 }}>{icon}</span>}
                {label}
            </label>
            {type === 'textarea' ? (
                <>
                    <textarea
                        value={value || ''}
                        onChange={e => onChange(e.target.value)}
                        placeholder={placeholder}
                        maxLength={maxLength}
                        spellCheck={false}
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        style={{
                            width: '100%', padding: 12, borderRadius: 8, border: `1px solid ${C.border}`,
                            fontSize: 15, resize: 'vertical', minHeight: 80, boxSizing: 'border-box',
                            fontFamily: 'inherit', color: '#000000', background: '#ffffff'
                        }}
                    />
                    {showCount && maxLength && (
                        <div style={{ fontSize: 11, color: charCount > maxLength * 0.9 ? '#e53935' : C.textSec, textAlign: 'right', marginTop: 2 }}>
                            {charCount}/{maxLength}
                        </div>
                    )}
                </>
            ) : (
                <div style={{ position: 'relative' }}>
                    <input
                        type={type}
                        value={value || ''}
                        onChange={e => onChange(e.target.value)}
                        placeholder={placeholder}
                        maxLength={maxLength}
                        spellCheck={false}
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        style={{
                            width: '100%', padding: 12, paddingRight: suffix ? 40 : 12, borderRadius: 8, border: `1px solid ${C.border}`,
                            fontSize: 15, boxSizing: 'border-box', color: '#000000', background: '#ffffff'
                        }}
                    />
                    {suffix && (
                        <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 16 }}>
                            {suffix}
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}

// Poker Resume Badge - displays scraped HendonMob data in Smarter.Poker style
function PokerResumeBadge({ hendonData, onRefresh, isRefreshing, syncStatus }) {
    if (!hendonData?.hendon_url) return null;

    const hasData = hendonData.total_cashes != null || hendonData.total_earnings != null;

    return (
        <div style={{
            background: 'linear-gradient(135deg, #0a0a1a 0%, #1a1a3e 50%, #0d0d2e 100%)',
            borderRadius: 16, padding: 24, color: 'white', marginTop: 16,
            border: '1px solid rgba(255, 215, 0, 0.3)',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 215, 0, 0.1)'
        }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                        width: 48, height: 48, borderRadius: '50%',
                        background: 'linear-gradient(135deg, #FFD700, #FFA500)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 24, boxShadow: '0 2px 10px rgba(255, 215, 0, 0.4)'
                    }}>🏆</div>
                    <div>
                        <div style={{ fontWeight: 700, fontSize: 20, letterSpacing: 0.5 }}>POKER RESUME</div>
                        <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>HendonMob Stats</div>
                    </div>
                </div>
                {hasData && (
                    <div style={{
                        background: 'rgba(0, 255, 136, 0.2)',
                        border: '1px solid rgba(0, 255, 136, 0.5)',
                        padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                        color: '#00FF88'
                    }}>
                        SYNCED
                    </div>
                )}
            </div>

            {hasData ? (
                <>
                    {/* Stats Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                        <div style={{
                            background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 16, textAlign: 'center',
                            border: '1px solid rgba(255,255,255,0.1)'
                        }}>
                            <div style={{ fontSize: 32, fontWeight: 800, color: C.gold, textShadow: '0 0 10px rgba(255, 215, 0, 0.3)' }}>
                                {hendonData.total_cashes?.toLocaleString() || '—'}
                            </div>
                            <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4, textTransform: 'uppercase', letterSpacing: 1 }}>Cashes</div>
                        </div>
                        <div style={{
                            background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 16, textAlign: 'center',
                            border: '1px solid rgba(255,255,255,0.1)'
                        }}>
                            <div style={{ fontSize: 32, fontWeight: 800, color: '#00ff88', textShadow: '0 0 10px rgba(0, 255, 136, 0.3)' }}>
                                ${hendonData.total_earnings?.toLocaleString() || '—'}
                            </div>
                            <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4, textTransform: 'uppercase', letterSpacing: 1 }}>Earnings</div>
                        </div>
                        <div style={{
                            background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 16, textAlign: 'center',
                            border: '1px solid rgba(255,255,255,0.1)'
                        }}>
                            <div style={{ fontSize: 32, fontWeight: 800, color: '#00d4ff', textShadow: '0 0 10px rgba(0, 212, 255, 0.3)' }}>
                                ${hendonData.biggest_cash?.toLocaleString() || hendonData.best_finish || '—'}
                            </div>
                            <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4, textTransform: 'uppercase', letterSpacing: 1 }}>BIGGEST CASH</div>
                        </div>
                    </div>

                    {/* Last Updated + Re-sync */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
                        {hendonData.last_scraped && (
                            <div style={{ fontSize: 11, opacity: 0.4 }}>
                                Last synced: {new Date(hendonData.last_scraped).toLocaleDateString()}
                            </div>
                        )}
                        <button
                            onClick={onRefresh}
                            disabled={isRefreshing}
                            style={{
                                background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)',
                                padding: '6px 16px', borderRadius: 20, fontSize: 12, cursor: isRefreshing ? 'wait' : 'pointer',
                                opacity: isRefreshing ? 0.7 : 1
                            }}
                        >
                            {isRefreshing ? '🔄 Syncing...' : '🔄 Re-sync'}
                        </button>
                    </div>
                </>
            ) : (
                /* No data yet - show sync button with better status */
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                    {isRefreshing ? (
                        <>
                            <div style={{ fontSize: 48, marginBottom: 12, animation: 'spin 1s linear infinite' }}>🔄</div>
                            <div style={{ fontSize: 16, fontWeight: 600, color: C.gold, marginBottom: 8 }}>
                                Fetching your tournament stats...
                            </div>
                            <div style={{ fontSize: 13, opacity: 0.6 }}>
                                This may take a few seconds
                            </div>
                            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
                        </>
                    ) : (
                        <>
                            <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
                            <div style={{ fontSize: 14, opacity: 0.7, marginBottom: 16 }}>
                                Click below to fetch your tournament stats from Hendon Mob
                            </div>
                            <button
                                onClick={onRefresh}
                                style={{
                                    background: C.gold, color: '#000', border: 'none',
                                    padding: '12px 32px', borderRadius: 20, fontWeight: 700,
                                    cursor: 'pointer', fontSize: 15
                                }}
                            >
                                🔄 Sync Stats Now
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

// ── Home Casino Venue Autocomplete ──────────────────────────────────────────
function HomeCasinoSelector({ value, onChange }) {
    const [query, setQuery] = useState(value || '');
    const [suggestions, setSuggestions] = useState([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const debounceRef = useRef(null);
    const containerRef = useRef(null);

    // Sync external value
    useEffect(() => { setQuery(value || ''); }, [value]);

    // Close on outside click
    useEffect(() => {
        const handleClick = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    // Cleanup debounce timer on unmount
    useEffect(() => {
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, []);

    const searchVenues = useCallback(async (q) => {
        if (!q || q.length < 2) { setSuggestions([]); return; }
        setIsSearching(true);
        try {
            const res = await fetch(`/api/poker/venues?search=${encodeURIComponent(q)}&limit=8`);
            if (!res.ok) { setIsSearching(false); return; }
            const data = await res.json();
            if (data.success && data.data) {
                setSuggestions(data.data);
                setShowDropdown(true);
            }
        } catch { /* noop */ } finally { setIsSearching(false); }
    }, []);

    const handleInputChange = (e) => {
        const val = e.target.value;
        setQuery(val);
        onChange(val);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => searchVenues(val), 300);
    };

    const handleSelect = (venue) => {
        setQuery(venue.name);
        setShowDropdown(false);
        onChange(venue.name);
    };

    return (
        <div ref={containerRef} style={{ position: 'relative' }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                    type="text"
                    value={query}
                    onChange={handleInputChange}
                    onFocus={() => { if (suggestions.length > 0) setShowDropdown(true); }}
                    placeholder="Search 483+ venues or type a name..."
                    style={{
                        width: '100%', padding: 12, fontSize: 15,
                        background: '#ffffff', border: `1px solid ${C.border}`,
                        borderRadius: 8, color: '#000000', outline: 'none',
                        boxSizing: 'border-box',
                    }}
                />
                {isSearching && <span style={{ position: 'absolute', right: 10, color: '#2374e1', fontSize: 16 }}>⟳</span>}
            </div>
            {showDropdown && suggestions.length > 0 && (
                <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
                    background: C.card, border: `1px solid ${C.border}`,
                    borderRadius: 8, overflow: 'hidden', zIndex: 100,
                    maxHeight: 240, overflowY: 'auto',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                }}>
                    {suggestions.map((venue) => (
                        <button
                            key={venue.id}
                            type="button"
                            onClick={() => handleSelect(venue)}
                            style={{
                                display: 'block', width: '100%', padding: '10px 14px',
                                background: 'none', border: 'none',
                                borderBottom: `1px solid ${C.border}`,
                                cursor: 'pointer', textAlign: 'left', color: C.text,
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = '#F0F2F5'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                        >
                            <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{venue.name}</div>
                            <div style={{ fontSize: 12, color: C.textSec, marginTop: 2 }}>
                                {venue.city}{venue.state ? `, ${venue.state}` : ''}
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

export default function ProfilePage() {
    const router = useRouter();
    useTrainingBus('profile-edit');
    const { avatar } = useAvatar();

    // Zustand Global State (replaces UI-related useState)
    const libraryOpen = useProfileStore((s) => s.libraryOpen);
    const setLibraryOpen = useProfileStore((s) => s.setLibraryOpen);
    const saving = useProfileStore((s) => s.saving);
    const setSaving = useProfileStore((s) => s.setSaving);
    const isRefreshing = useProfileStore((s) => s.isRefreshing);
    const setIsRefreshing = useProfileStore((s) => s.setIsRefreshing);

    // Ref for cover photo upload
    const coverPhotoRef = useRef(null);

    // Local state (keep for data/session)
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');
    const [avatarUploadPhase, setAvatarUploadPhase] = useState(null); // 'Compressing' | 'Uploading' | 'Saving' | null
    const [coverUploadPhase, setCoverUploadPhase] = useState(null); // 'Compressing' | 'Uploading' | 'Saving' | null
    const [usernameStatus, setUsernameStatus] = useState('idle'); // 'idle' | 'checking' | 'available' | 'taken'
    const usernameCheckRef = useRef(null);

    // Auto-save debounce ref (5 seconds of inactivity)
    const autoSaveRef = useRef(null);
    const [savePhase, setSavePhase] = useState(null); // 'Validating' | 'Saving' | 'Syncing' | null

    // Undo last save state
    const [undoSnapshot, setUndoSnapshot] = useState(null);
    const undoTimerRef = useRef(null);

    // Toast exit animation
    const [toastExiting, setToastExiting] = useState(false);

    // Auto-dismiss success messages after 3.5 seconds with exit animation
    useEffect(() => {
        if (message && !message.includes('Error')) {
            setToastExiting(false);
            const exitTimer = setTimeout(() => setToastExiting(true), 3000);
            const removeTimer = setTimeout(() => { setMessage(''); setToastExiting(false); }, 3300);
            return () => { clearTimeout(exitTimer); clearTimeout(removeTimer); };
        }
    }, [message]);

    // Cleanup auto-save + undo timer + username check refs on unmount (prevent ghost timeouts)
    useEffect(() => {
        return () => {
            if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
            if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
            if (usernameCheckRef.current) clearTimeout(usernameCheckRef.current);
        };
    }, []);

    // Social stats and friends
    const [socialStats, setSocialStats] = useState({ friends: 0, followers: 0, following: 0, posts: 0 });
    const [friends, setFriends] = useState([]);

    // Photo, Reels, and Lives galleries
    const [photoGalleryOpen, setPhotoGalleryOpen] = useState(false);
    const [reelsGalleryOpen, setReelsGalleryOpen] = useState(false);
    const [livesGalleryOpen, setLivesGalleryOpen] = useState(false);
    const [userPhotos, setUserPhotos] = useState([]);
    const [userReels, setUserReels] = useState([]);
    const [userLives, setUserLives] = useState([]);

    // HamburgerMenu state
    const [menuOpen, setMenuOpen] = useState(false);
    const menuConfig = getMenuConfig('profile', user, {}, {});

    // Profile fields
    const [profile, setProfile] = useState({
        full_name: '',
        first_name: '',
        last_name: '',
        username: '',
        bio: '',
        city: '',
        state: '',
        country: '',
        phone: '',
        email: '',
        website: '',
        twitter: '',
        instagram: '',
        tiktok: '',
        telegram: '',
        hendon_url: '',
        favorite_game: '',
        favorite_hand: '',
        favorite_hand_type: 'holdem',
        favorite_hand_plo: '',
        home_casino: '',
        birth_year: '',
        birthday: '',
        avatar_url: '',
        cover_photo_url: '', // Cover photo for profile
        cover_photo_position: '50% 50%', // CSS object-position for repositioned cover
        card_back_preference: 'white', // Default to white deck
        // HendonMob scraped data
        hendon_total_cashes: null,
        hendon_total_earnings: null,
        hendon_best_finish: null,
        hendon_biggest_cash: null,
        hendon_last_scraped: null,
    });
    const [originalProfile, setOriginalProfile] = useState(null);
    const [coverEditorOpen, setCoverEditorOpen] = useState(false);

    // ── Unsaved changes warning ──
    useEffect(() => {
        const handleBeforeUnload = (e) => {
            if (!originalProfile || !profile) return;
            // Compare key fields to detect dirty state
            const fields = ['first_name','last_name','username','bio','city','state','country',
                'phone','email','website','twitter','instagram','tiktok','telegram',
                'hendon_url','favorite_game','favorite_hand','favorite_hand_plo',
                'home_casino','birth_year','birthday','card_back_preference'];
            const isDirty = fields.some(f => String(profile[f] || '') !== String(originalProfile[f] || ''));
            if (isDirty) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [profile, originalProfile]);

    useEffect(() => {
        const fetchUser = async () => {
            try {
                const authUser = getAuthUser();

                if (authUser) {
                    setUser(authUser);
                    // Fetch profile using native fetch to avoid AbortError
                    try {
                        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
                        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

                        // Use user JWT for profile read (respects RLS) — fallback to anon key
                        const loadToken = getProfileJwt();

                        // Profile read uses the get_my_full_profile() RPC because
                        // direct table SELECT of phone/email is blocked at column
                        // level for non-service-role callers. The RPC runs
                        // SECURITY DEFINER + auth.uid() so it can only ever
                        // return THIS user's row.
                        const response = await fetch(`${supabaseUrl}/rest/v1/rpc/get_my_full_profile`, {
                            method: 'POST',
                            headers: {
                                'apikey': supabaseKey,
                                'Authorization': `Bearer ${loadToken}`,
                                'Content-Type': 'application/json'
                            },
                            body: '{}'
                        });

                        if (response.ok) {
                            const profiles = await response.json();
                            const profileData = Array.isArray(profiles) ? profiles[0] : profiles;
                            if (profileData) {
                                // Parse full_name into first_name/last_name if those columns are empty
                                if (!profileData.first_name && !profileData.last_name && profileData.full_name) {
                                    const parts = profileData.full_name.trim().split(/\s+/);
                                    profileData.first_name = parts[0] || '';
                                    profileData.last_name = parts.slice(1).join(' ') || '';
                                }
                                setProfile(prev => ({ ...prev, ...profileData }));
                                setOriginalProfile(profileData);
                            }
                        }

                        // Fetch social stats and friends
                        const headers = {
                            'apikey': supabaseKey,
                            'Authorization': `Bearer ${loadToken}`,
                            'Content-Type': 'application/json'
                        };

                        // ── Parallel fetch: all social data at once (60% faster) ──
                        const [friendsRes, followersRes, followingRes, postsRes, photosRes, reelsRes, livesRes] = await Promise.all([
                            fetch(`${supabaseUrl}/rest/v1/friendships?or=(user_id.eq.${authUser.id},friend_id.eq.${authUser.id})&status=eq.accepted&select=user_id,friend_id`, { headers }),
                            fetch(`${supabaseUrl}/rest/v1/follows?following_id=eq.${authUser.id}&select=id`, { headers }),
                            fetch(`${supabaseUrl}/rest/v1/follows?follower_id=eq.${authUser.id}&select=id`, { headers }),
                            fetch(`${supabaseUrl}/rest/v1/social_posts?author_id=eq.${authUser.id}&select=id`, { headers }),
                            fetch(`${supabaseUrl}/rest/v1/social_posts?author_id=eq.${authUser.id}&content_type=eq.photo&order=created_at.desc&limit=50&select=id,media_urls,content,created_at`, { headers }),
                            fetch(`${supabaseUrl}/rest/v1/social_posts?author_id=eq.${authUser.id}&content_type=eq.video&order=created_at.desc&limit=50&select=id,media_urls,content,created_at`, { headers }),
                            fetch(`${supabaseUrl}/rest/v1/live_streams?broadcaster_id=eq.${authUser.id}&status=eq.ended&order=created_at.desc&limit=50&select=id,title,video_url,thumbnail_url,is_draft,is_posted,viewer_count,started_at,ended_at,created_at`, { headers }),
                        ]);

                        const friendsData = friendsRes.ok ? await friendsRes.json() : [];
                        const followersData = followersRes.ok ? await followersRes.json() : [];
                        const followingData = followingRes.ok ? await followingRes.json() : [];
                        const postsData = postsRes.ok ? await postsRes.json() : [];

                        // Deduplicate bidirectional friendship rows to get the true friend count
                        const uniqueFriendIds = new Set(friendsData.map(f => f.user_id === authUser.id ? f.friend_id : f.user_id));

                        setSocialStats({
                            friends: uniqueFriendIds.size,
                            followers: followersData.length,
                            following: followingData.length,
                            posts: postsData.length
                        });

                        // Get friend profiles for display
                        if (friendsData.length > 0) {
                            const friendIds = friendsData.map(f => f.user_id === authUser.id ? f.friend_id : f.user_id);
                            const profilesRes = await fetch(
                                `${supabaseUrl}/rest/v1/profiles?id=in.(${friendIds.join(',')})&select=id,full_name,username,avatar_url`,
                                { headers }
                            );
                            const friendProfiles = profilesRes.ok ? await profilesRes.json() : [];
                            setFriends(friendProfiles.map(f => ({ ...f, mutualCount: 0 })));
                        }

                        // Photos
                        const photosData = photosRes.ok ? await photosRes.json() : [];
                        setUserPhotos(photosData.flatMap(post =>
                            (post.media_urls || []).map((url, idx) => ({
                                id: `${post.id}-${idx}`, media_url: url, content: post.content, created_at: post.created_at
                            }))
                        ));

                        // Reels
                        const reelsData = reelsRes.ok ? await reelsRes.json() : [];
                        setUserReels(reelsData.flatMap(post =>
                            (post.media_urls || []).map((url, idx) => ({
                                id: `${post.id}-${idx}`, media_url: url, content: post.content, created_at: post.created_at
                            }))
                        ));

                        // Lives
                        const livesData = livesRes.ok ? await livesRes.json() : [];
                        setUserLives(livesData);
                    } catch (e) {
                        console.warn('[Profile] Error fetching profile:', e);
                    }
                }
            } catch (e) {
                console.warn('[Profile] Auth error:', e);
            }
            setLoading(false);
        };
        fetchUser();
    }, []);

    // ── Ctrl+S keyboard shortcut to save ──
    useEffect(() => {
        const handleKeyDown = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                if (!saving && user) {
                    // Trigger save via DOM click to avoid stale closure
                    const saveBtn = document.querySelector('[data-save-btn]');
                    if (saveBtn) saveBtn.click();
                }
            }
            // Escape key closes gallery modals
            if (e.key === 'Escape') {
                if (photoGalleryOpen) setPhotoGalleryOpen(false);
                else if (reelsGalleryOpen) setReelsGalleryOpen(false);
                else if (livesGalleryOpen) setLivesGalleryOpen(false);
                else if (coverEditorOpen) setCoverEditorOpen(false);
                else if (libraryOpen) setLibraryOpen(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [saving, user, photoGalleryOpen, reelsGalleryOpen, livesGalleryOpen, coverEditorOpen, libraryOpen]);

    // ── Dirty check helper — detects unsaved changes ──
    const isDirty = (() => {
        if (!originalProfile || !profile) return false;
        const fields = ['first_name','last_name','username','bio','city','state','country',
            'phone','email','website','twitter','instagram','tiktok','telegram',
            'hendon_url','favorite_game','favorite_hand','favorite_hand_plo',
            'home_casino','birth_year','birthday','card_back_preference'];
        return fields.some(f => String(profile[f] || '') !== String(originalProfile[f] || ''));
    })();

    const updateField = (field) => (value) => {
        // Social link auto-formatting: strip URLs and @ prefixes
        const socialFields = { twitter: 'twitter', instagram: 'instagram', tiktok: 'tiktok', telegram: 'telegram' };
        if (socialFields[field]) {
            value = stripSocialHandle(value, socialFields[field]);
        }
        // Username format enforcement: alphanumeric + underscores only (mixed case allowed)
        if (field === 'username' && value) {
            value = value.replace(/[^a-zA-Z0-9_]/g, '');
        }
        setProfile(prev => ({ ...prev, [field]: value }));

        // Auto-save debounce: save after 5 seconds of inactivity (only if dirty)
        if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
        autoSaveRef.current = setTimeout(() => {
            // Re-check isDirty at fire time — profile/originalProfile may have changed
            const saveBtn = document.querySelector('[data-save-btn]');
            if (saveBtn && !saveBtn.disabled && saveBtn.textContent.includes('Unsaved')) saveBtn.click();
        }, 5000);

        // Username uniqueness check (debounced)
        if (field === 'username') {
            if (usernameCheckRef.current) clearTimeout(usernameCheckRef.current);
            const trimmed = (value || '').trim();
            if (!trimmed || trimmed.length < 3) {
                setUsernameStatus('idle');
                return;
            }
            // Skip check if username hasn't changed from original (case-insensitive: KingFish == kingfish is still yours)
            if (originalProfile && trimmed.toLowerCase() === (originalProfile.username || '').trim().toLowerCase()) {
                setUsernameStatus('available');
                return;
            }
            setUsernameStatus('checking');
            usernameCheckRef.current = setTimeout(async () => {
                try {
                    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
                    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
                    // Use ilike for case-insensitive duplicate check (KingFish conflicts with kingfish)
                    const res = await fetch(
                        `${supabaseUrl}/rest/v1/profiles?username=ilike.${encodeURIComponent(trimmed)}&select=id`,
                        { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${getProfileJwt()}` } }
                    );
                    const data = res.ok ? await res.json() : [];
                    // If the only result is the current user, it's available
                    const takenByOther = data.filter(d => d.id !== user?.id);
                    setUsernameStatus(takenByOther.length > 0 ? 'taken' : 'available');
                } catch {
                    setUsernameStatus('idle');
                }
            }, 500);
        }
    };

    const handleAvatarUpload = async (file) => {
        if (!user) return;
        if (file.size > MAX_UPLOAD_SIZE) {
            setMessage('Error: Image too large (max 5MB). Please choose a smaller image.');
            return;
        }

        // Phase 1: Compress
        setAvatarUploadPhase('Compressing');
        const compressed = await compressImage(file, 800, 0.85);

        // Phase 2: Upload via signed-URL proxy (avoids SDK auth lock + uses service role)
        setAvatarUploadPhase('Uploading');
        const avatarToken = getAccessToken();
        const avatarMetaRes = await fetch('/api/social/upload-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${avatarToken}` },
            body: JSON.stringify({
                fileName: `avatar_${Date.now()}.${compressed.name.split('.').pop() || 'jpg'}`,
                fileSize: compressed.size,
                mimeType: compressed.type || 'image/jpeg',
                folder: 'avatars',
                prefix: user.id,
            }),
        });
        if (!avatarMetaRes.ok) {
            setAvatarUploadPhase(null);
            setMessage('Error getting upload URL: ' + avatarMetaRes.status);
            return;
        }
        const avatarMeta = await avatarMetaRes.json();
        if (!avatarMeta.success || !avatarMeta.signedUrl) {
            setAvatarUploadPhase(null);
            setMessage('Error uploading avatar: ' + (avatarMeta.error || 'No signed URL'));
            return;
        }

        const avatarPutRes = await fetch(avatarMeta.signedUrl, {
            method: 'PUT',
            headers: { 'Content-Type': compressed.type || 'image/jpeg' },
            body: compressed,
        });
        if (!avatarPutRes.ok) {
            setAvatarUploadPhase(null);
            setMessage('Error uploading avatar: HTTP ' + avatarPutRes.status);
            return;
        }

        const publicUrl = avatarMeta.publicUrl;

        // Phase 3: Save to database
        setAvatarUploadPhase('Saving');
        const _supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const _supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        const _avatarToken = getProfileJwt();

        try {
            const avatarRes = await fetch(`${_supabaseUrl}/rest/v1/profiles?id=eq.${user.id}`, {
                method: 'PATCH',
                headers: { 'apikey': _supabaseKey, 'Authorization': `Bearer ${_avatarToken}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
                body: JSON.stringify({ avatar_url: publicUrl, updated_at: new Date().toISOString() }),
            });
            if (!avatarRes.ok) {
                const errText = await avatarRes.text();
                setAvatarUploadPhase(null);
                setMessage('Error saving avatar: ' + errText);
                console.warn('Save error:', errText);
                return;
            }

            // ── DEACTIVATE AI/PRESET AVATARS ──
            // If the user manually uploaded a photo, it should override any AI or preset avatars.
            await fetch(`${_supabaseUrl}/rest/v1/user_avatars?user_id=eq.${user.id}`, {
                method: 'PATCH',
                headers: { 'apikey': _supabaseKey, 'Authorization': `Bearer ${_avatarToken}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
                body: JSON.stringify({ is_active: false, updated_at: new Date().toISOString() }),
            });
        } catch (fetchErr) {
            setAvatarUploadPhase(null);
            setMessage('Error saving avatar: ' + fetchErr.message);
            return;
        }

        // ── UPDATE AUTH METADATA ──
        try {
            const mdRes = await fetch('/api/auth/update-metadata', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${_avatarToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ metadata: { avatar_url: publicUrl } })
            });
            if (!mdRes.ok) console.warn('[Avatar Upload] Non-fatal error syncing auth metadata:', await mdRes.text());
        } catch (mdErr) {
            console.warn('[Avatar Upload] Failed to update auth metadata:', mdErr);
        }

        setAvatarUploadPhase(null);
        setProfile(prev => ({ ...prev, avatar_url: publicUrl }));

        // ── CRITICAL: Dispatch bus event so header updates in real-time ──
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('profile-updated', {
                detail: { avatar_url: publicUrl }
            }));
        }

        // ── CACHE: Invalidate profile cache + notify other tabs ──
        try {
            const cacheKey = `sp-profile-cache-${profile.username}`;
            localStorage.removeItem(cacheKey);
            broadcastSync('smarter_poker_cache_sync', { type: 'cache_sync', cacheKey, action: 'invalidate', ts: Date.now() });
            broadcastSync('smarter_poker_avatar_sync', 'refresh');
        } catch { /* noop */ }
        busEmit.dataMutated('profile');

        // Award profile pic diamonds (fire-and-forget, 10 one-time)
        claimReward('/api/rewards/profile-pic', { userId: user.id }, 'Profile Picture Uploaded');
        setMessage('Avatar saved!');
        setOriginalProfile(prev => ({ ...prev, avatar_url: publicUrl }));
    };

    const handleCoverPhotoUpload = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = ''; // Reset input so same file can be re-selected
        if (!file || !user) return;
        if (file.size > MAX_UPLOAD_SIZE) {
            setMessage('Error: Cover photo too large (max 5MB). Please choose a smaller image.');
            return;
        }

        setCoverUploadPhase('Compressing');

        try {
            // Compress before upload (max 1600px wide)
            const compressed = await compressImage(file, 1600, 0.85);

            // Replace file reference with compressed version
            const uploadFile = compressed;
            setCoverUploadPhase('Uploading');
            // Use the server-side upload proxy (service role key) to bypass storage RLS
            const formData = new FormData();
            formData.append('file', uploadFile);
            formData.append('folder', 'covers');
            formData.append('prefix', user.id);

            const _coverToken = getAccessToken();
            const uploadRes = await fetch('/api/social/upload', {
                method: 'POST',
                headers: _coverToken ? { Authorization: `Bearer ${_coverToken}` } : {},
                body: formData,
            });
            // HIGH FIX #2j: Add response.ok check before .json()
            if (!uploadRes.ok) {
                const errorText = await uploadRes.text().catch(() => 'Unknown error');
                throw new Error(`HTTP ${uploadRes.status}: ${errorText}`);
            }
            const uploadJson = await uploadRes.json();

            if (!uploadJson.success || !uploadJson.url) {
                throw new Error(uploadJson.error || 'Upload failed');
            }

            const publicUrl = uploadJson.url;
            setCoverUploadPhase('Saving');

            // Update database — direct PostgREST (avoids SIGNED_OUT cascade)
            const _coverUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
            const _coverKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
            const _coverJwt = getProfileJwt();

            const coverSaveRes = await fetch(`${_coverUrl}/rest/v1/profiles?id=eq.${user.id}`, {
                method: 'PATCH',
                headers: { 'apikey': _coverKey, 'Authorization': `Bearer ${_coverJwt}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
                body: JSON.stringify({ cover_photo_url: publicUrl, updated_at: new Date().toISOString() }),
            });
            if (!coverSaveRes.ok) {
                const errText = await coverSaveRes.text();
                setCoverUploadPhase(null);
                setMessage('Error saving cover photo: ' + errText);
                console.warn('Save error:', errText);
                return;
            }

            setCoverUploadPhase(null);
            setProfile(prev => ({ ...prev, cover_photo_url: publicUrl, cover_photo_position: '50% 50%' }));
            setOriginalProfile(prev => ({ ...prev, cover_photo_url: publicUrl, cover_photo_position: '50% 50%' }));
            setMessage('Cover photo uploaded! Drag to reposition.');
            setCoverEditorOpen(true);

            // ── CRITICAL: Dispatch bus event so profile page updates in real-time ──
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('profile-updated', {
                    detail: { cover_photo_url: publicUrl }
                }));
            }

            // ── CACHE: Invalidate profile cache + notify other tabs ──
            try {
                const cacheKey = `sp-profile-cache-${profile.username}`;
                localStorage.removeItem(cacheKey);
                broadcastSync('smarter_poker_cache_sync', { type: 'cache_sync', cacheKey, action: 'invalidate', ts: Date.now() });
                broadcastSync('smarter_poker_avatar_sync', 'refresh');
            } catch { /* noop */ }
            busEmit.dataMutated('profile');
        } catch (error) {
            setCoverUploadPhase(null);
            setMessage('Error uploading cover photo: ' + error.message);
            console.warn('Upload error:', error);
        }
    };

    const handleCoverPhotoRemove = async (e) => {
        e.stopPropagation(); // Prevent triggering the upload click
        if (!user || !profile.cover_photo_url) return;

        // Confirm removal
        if (!confirm('Remove cover photo?')) return;

        setMessage('Removing cover photo...');

        // Try to delete from storage — detect bucket from URL
        try {
            const url = profile.cover_photo_url;
            if (url.includes('/social-media/')) {
                // New uploads via /api/social/upload go to social-media bucket
                const pathMatch = url.split('/social-media/')[1];
                if (pathMatch) {
                    await supabase.storage.from('social-media').remove([pathMatch]);
                }
            } else if (url.includes('/avatars/')) {
                // Legacy uploads went to avatars bucket
                const pathMatch = url.split('/avatars/')[1];
                if (pathMatch) {
                    await supabase.storage.from('avatars').remove([pathMatch]);
                }
            }
        } catch (deleteErr) {
            console.warn('Storage delete error (may not exist):', deleteErr);
            // Continue anyway - file might already be deleted
        }

        // Update database to remove URL — direct PostgREST (avoids SIGNED_OUT cascade)
        const _rmUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const _rmKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        const _rmJwt = getProfileJwt();

        try {
            const rmRes = await fetch(`${_rmUrl}/rest/v1/profiles?id=eq.${user.id}`, {
                method: 'PATCH',
                headers: { 'apikey': _rmKey, 'Authorization': `Bearer ${_rmJwt}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
                body: JSON.stringify({ cover_photo_url: null, cover_photo_position: '50% 50%', updated_at: new Date().toISOString() }),
            });
            if (!rmRes.ok) {
                const errText = await rmRes.text();
                setMessage('Error removing cover photo: ' + errText);
                console.warn('Update error:', errText);
                return;
            }
        } catch (fetchErr) {
            setMessage('Error removing cover photo: ' + fetchErr.message);
            console.warn('Cover remove fetch error:', fetchErr);
            return;
        }

        setProfile(prev => ({ ...prev, cover_photo_url: null, cover_photo_position: '50% 50%' }));
        setOriginalProfile(prev => ({ ...prev, cover_photo_url: null, cover_photo_position: '50% 50%' }));
        setMessage('Cover photo removed!');

        // ── CRITICAL: Dispatch bus event so profile page updates in real-time ──
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('profile-updated', {
                detail: { cover_photo_url: null, cover_photo_position: '50% 50%' }
            }));
        }

        // ── CACHE: Invalidate profile cache + notify other tabs ──
        try {
            const cacheKey = `sp-profile-cache-${profile.username}`;
            localStorage.removeItem(cacheKey);
            broadcastSync('smarter_poker_cache_sync', { type: 'cache_sync', cacheKey, action: 'invalidate', ts: Date.now() });
            broadcastSync('smarter_poker_avatar_sync', 'refresh');
        } catch { /* noop */ }
        busEmit.dataMutated('profile');
    };

    const handleSave = async () => {
        if (!user) return;
        if (usernameStatus === 'taken') {
            setMessage('Error: Username is already taken. Please choose a different username.');
            return;
        }
        // Email format validation
        if (profile.email && profile.email.trim()) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(profile.email.trim())) {
                setMessage('Error: Please enter a valid email address.');
                return;
            }
        }
        // HendonMob URL format validation
        if (profile.hendon_url && profile.hendon_url.trim()) {
            const url = profile.hendon_url.trim().toLowerCase();
            if (!url.includes('hendonmob.com') && !url.includes('pokerdb.')) {
                setMessage('Error: HendonMob URL must be from thehendonmob.com or pokerdb.thehendonmob.com');
                return;
            }
        }
        setSaving(true);
        setMessage('');
        setSavePhase('Validating');

        // ── CRITICAL: Use direct PostgREST fetch — NOT supabase.update() ──
        // supabase.update() triggers autoRefreshToken → if refresh fails → SIGNED_OUT event
        // → authGuard clears session → user gets logged out. Direct fetch avoids this cascade.
        // The global fetch interceptor in _app.js auto-injects JWT for auth.
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        const updatePayload = {
            full_name: `${(profile.first_name || '').trim()} ${(profile.last_name || '').trim()}`.trim(),
            first_name: (profile.first_name || '').trim(),
            last_name: (profile.last_name || '').trim(),
            username: (profile.username || '').trim() || null,
            alias: (profile.username || '').trim() || null,
            bio: profile.bio,
            city: profile.city,
            state: profile.state,
            country: profile.country,
            phone: profile.phone,
            email: profile.email,
            website: profile.website,
            twitter: profile.twitter,
            instagram: profile.instagram,
            tiktok: profile.tiktok,
            telegram: profile.telegram,
            hendon_url: profile.hendon_url,
            favorite_game: profile.favorite_game,
            favorite_hand: profile.favorite_hand,
            favorite_hand_type: profile.favorite_hand_type || 'holdem',
            favorite_hand_plo: profile.favorite_hand_plo || '',
            home_casino: profile.home_casino,
            birth_year: profile.birth_year ? parseInt(profile.birth_year, 10) || null : null,
            birthday: (() => {
                const b = profile.birthday;
                if (!b) return null;
                const parts = b.split('-');
                // Only save if all 3 parts (year, month, day) are present, non-empty, and numeric
                if (parts.length === 3 && parts[0] && parts[1] && parts[2] &&
                    /^\d{4}$/.test(parts[0]) && /^\d{1,2}$/.test(parts[1]) && /^\d{1,2}$/.test(parts[2])) {
                    return b;
                }
                return null;
            })(),
            avatar_url: profile.avatar_url,
            cover_photo_url: profile.cover_photo_url,
            cover_photo_position: profile.cover_photo_position || '50% 50%',
            card_back_preference: profile.card_back_preference,
            updated_at: new Date().toISOString(),
        };

        // Get user's JWT from localStorage for authenticated write
        const userToken = getProfileJwt();

        setSavePhase('Saving');
        let error = null;
        try {
            const res = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}`, {
                method: 'PATCH',
                headers: {
                    'apikey': supabaseKey,
                    'Authorization': `Bearer ${userToken}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal',
                },
                body: JSON.stringify(updatePayload),
            });
            if (!res.ok) {
                const errBody = await res.text();
                error = { message: `HTTP ${res.status}: ${errBody}` };
            }
        } catch (fetchErr) {
            error = { message: fetchErr.message };
        }

        // ── UPDATE AUTH METADATA ──
        if (!error) {
            try {
                const mdRes = await fetch('/api/auth/update-metadata', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${userToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        metadata: {
                            poker_alias: (profile.username || '').trim() || null,
                            full_name: `${(profile.first_name || '').trim()} ${(profile.last_name || '').trim()}`.trim(),
                            avatar_url: profile.avatar_url || null
                        }
                    })
                });
                if (!mdRes.ok) {
                    console.warn('[Profile Edit] Non-fatal error syncing auth metadata:', await mdRes.text());
                }
            } catch (mdErr) {
                console.warn('[Profile Edit] Failed to update auth metadata:', mdErr);
            }
        }

        if (error) {
            setSaving(false);
            setSavePhase(null);
            setMessage(`Error saving profile: ${error.message || error.code || JSON.stringify(error)}`);
            console.warn('Profile save error:', error);
        } else {
            setSavePhase('Syncing');
            // ── UNDO: Store snapshot before overwriting originalProfile ──
            setUndoSnapshot({ ...originalProfile });
            if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
            undoTimerRef.current = setTimeout(() => setUndoSnapshot(null), 10000);

            // ── OPTIMISTIC: Update originalProfile immediately (already succeeded) ──
            setOriginalProfile({ ...profile });

            // Fire Phase 2 diamond reward claims (fire-and-forget with toast)
            if (profile.avatar_url) {
                claimReward('/api/rewards/profile-pic', { userId: user.id }, 'Profile Picture Uploaded');
            }
            if (profile.hendon_url && profile.hendon_url.trim().length >= 5) {
                claimReward('/api/rewards/hendonmob-link', { userId: user.id }, 'HendonMob Profile Linked');
            }
            if (profile.avatar_url && profile.bio && profile.username) {
                claimReward('/api/rewards/profile-complete', { userId: user.id }, 'Profile Completed');
            }

            // ── CRITICAL: Dispatch bus event so header updates in real-time ──
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('profile-updated', {
                    detail: {
                        full_name: `${(profile.first_name || '').trim()} ${(profile.last_name || '').trim()}`.trim(),
                        first_name: (profile.first_name || '').trim(),
                        last_name: (profile.last_name || '').trim(),
                        username: profile.username,
                        avatar_url: profile.avatar_url,
                    }
                }));
            }
            busEmit.dataMutated('profile');

            // ── CACHE: Invalidate profile cache + avatar sync ──
            try {
                const cacheKey = `sp-profile-cache-${profile.username}`;
                localStorage.removeItem(cacheKey);
                
                // ALSO update the username cache used by UniversalHeader & ProfileRedirect
                localStorage.setItem('sp-profile-username', JSON.stringify({
                    userId: user.id,
                    username: profile.username,
                    ts: Date.now()
                }));
                
                broadcastSync('smarter_poker_cache_sync', { type: 'cache_sync', cacheKey, action: 'invalidate', ts: Date.now() });
                broadcastSync('smarter_poker_avatar_sync', 'refresh');
            } catch { /* noop */ }

            setSaving(false);
            setSavePhase(null);
            // Show success toast (non-blocking)
            setMessage(undoSnapshot ? 'Profile saved! Tap to Undo (10s)' : 'Profile saved successfully!');
        }
    };

    if (loading) return <ProfileSkeleton />;
    if (!user) return <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
            <h2>Please Log In To View Your Profile</h2>
            <Link href="/auth/login" style={{ color: C.blue }}>Log In</Link>
        </div>
    </div>;

    return (
        <>
            <SEOHead
                title="Edit Profile"
                description="Update Your Smarter.Poker Profile Information, Avatar, And Display Settings."
                canonical="/hub/profile-edit"
                noindex={true}
            />
            <div className="profile-page" style={{ minHeight: '100vh', background: '#F0F2F5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif' }}>
                {/* Header - Universal Header with Back navigation (nested page) */}
                <UniversalHeader pageDepth={2} onMenuClick={() => setMenuOpen(true)} />
                <HamburgerMenu
                    isOpen={menuOpen}
                    onClose={() => setMenuOpen(false)}
                    direction="right"
                    theme="dark"
                    user={user}
                    menuItems={menuConfig.menuItems}
                    bottomLinks={menuConfig.bottomLinks}
                />

                {/* Cover Photo Area - Clickable to upload */}
                <div
                    onClick={() => coverPhotoRef.current?.click()}
                    style={{
                        height: 200,
                        position: 'relative',
                        cursor: 'pointer',
                        overflow: 'hidden',
                        background: profile.cover_photo_url ? '#0d0d1e' : '#E5E7EB',
                    }}
                >
                    {/* Cover Photo Image with saved position */}
                    {profile.cover_photo_url && (
                        <img
                            src={profile.cover_photo_url}
                            alt="Cover photo"
                            loading="lazy"
                            style={{
                                position: 'absolute', inset: 0, width: '100%', height: '100%',
                                objectFit: 'cover',
                                objectPosition: profile.cover_photo_position || '50% 50%',
                                pointerEvents: 'none',
                            }}
                        />
                    )}
                    <input
                        ref={coverPhotoRef}
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={handleCoverPhotoUpload}
                    />

                    {/* Remove Cover Photo - Top Right (only show if cover exists) */}
                    {profile.cover_photo_url && (
                        <button
                            onClick={handleCoverPhotoRemove}
                            style={{
                                position: 'absolute',
                                top: 12,
                                right: 12,
                                background: 'rgba(0,0,0,0.7)',
                                color: 'white',
                                border: '1px solid rgba(255,255,255,0.3)',
                                padding: '8px 12px',
                                borderRadius: 8,
                                fontSize: 13,
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                transition: 'all 0.2s ease'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(220,38,38,0.9)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.7)'}
                        >
                            Remove
                        </button>
                    )}

                    {/* Reposition button - only when cover exists */}
                    {profile.cover_photo_url && (
                        <button
                            onClick={(e) => { e.stopPropagation(); setCoverEditorOpen(true); }}
                            style={{
                                position: 'absolute',
                                bottom: 12,
                                left: 12,
                                background: 'rgba(0,0,0,0.6)',
                                color: 'white',
                                padding: '8px 16px',
                                borderRadius: 8,
                                fontSize: 13,
                                fontWeight: 600,
                                border: '1px solid rgba(255,255,255,0.2)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                transition: 'all 0.2s ease'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(24,119,242,0.8)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.6)'}
                        >
                            Reposition
                        </button>
                    )}

                    {/* Add/Change Cover Photo - Bottom Right inside cover */}
                    <div style={{
                        position: 'absolute',
                        bottom: 12,
                        right: 12,
                        background: 'rgba(0,0,0,0.6)',
                        color: 'white',
                        padding: '8px 16px',
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6
                    }}>
                        {profile.cover_photo_url ? 'Change Cover' : 'Add Cover Photo'}
                    </div>

                    {/* Cover Upload Progress Overlay */}
                    {coverUploadPhase && (
                        <div style={{
                            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                            background: 'rgba(0,0,0,0.7)', display: 'flex',
                            flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                            borderRadius: '12px 12px 0 0', zIndex: 5,
                        }}>
                            <div style={{
                                width: 40, height: 40, border: '3px solid rgba(255,255,255,0.2)',
                                borderTop: '3px solid #00f5ff', borderRadius: '50%',
                                animation: 'spin 0.8s linear infinite',
                            }} />
                            <div style={{ color: '#fff', fontSize: 14, fontWeight: 600, marginTop: 10 }}>
                                {coverUploadPhase}...
                            </div>
                        </div>
                    )}

                    {/* Profile Avatar - MOVED outside overflow:hidden container */}
                </div>

                {/* Profile Avatar - overlapping cover photo bottom */}
                <div style={{ position: 'relative', zIndex: 2, marginTop: -60, display: 'flex', justifyContent: 'center' }}>
                    <Avatar src={profile.avatar_url} size={120} onUpload={handleAvatarUpload} uploadPhase={avatarUploadPhase} />
                </div>

                {/* Cover Photo Reposition Editor Modal */}
                {coverEditorOpen && profile.cover_photo_url && (
                    <CoverPhotoEditor
                        imageUrl={profile.cover_photo_url}
                        initialPosition={profile.cover_photo_position || '50% 50%'}
                        coverHeight={200}
                        onCancel={() => setCoverEditorOpen(false)}
                        onSave={async (positionStr) => {
                            // Direct PostgREST fetch — avoids SIGNED_OUT cascade
                            const _posUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
                            const _posKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
                            const _posJwt = getProfileJwt();

                            try {
                                const posRes = await fetch(`${_posUrl}/rest/v1/profiles?id=eq.${user.id}`, {
                                    method: 'PATCH',
                                    headers: { 'apikey': _posKey, 'Authorization': `Bearer ${_posJwt}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
                                    body: JSON.stringify({ cover_photo_position: positionStr, updated_at: new Date().toISOString() }),
                                });
                                if (!posRes.ok) {
                                    const errText = await posRes.text();
                                    setMessage('Error saving position: ' + errText);
                                    return;
                                }
                            } catch (fetchErr) {
                                setMessage('Error saving position: ' + fetchErr.message);
                                console.warn('Reposition fetch error:', fetchErr);
                                return;
                            }
                            setProfile(prev => ({ ...prev, cover_photo_position: positionStr }));
                            setOriginalProfile(prev => ({ ...prev, cover_photo_position: positionStr }));
                            setCoverEditorOpen(false);
                            setMessage('Cover photo position saved!');
                            if (typeof window !== 'undefined') {
                                window.dispatchEvent(new CustomEvent('profile-updated', {
                                    detail: { cover_photo_position: positionStr }
                                }));
                            }
                            try {
                                const cacheKey = `sp-profile-cache-${profile.username}`;
                                localStorage.removeItem(cacheKey);
                                broadcastSync('smarter_poker_cache_sync', { type: 'cache_sync', cacheKey, action: 'invalidate', ts: Date.now() });
                                broadcastSync('smarter_poker_avatar_sync', 'refresh');
                            } catch { /* noop */ }
                            busEmit.dataMutated('profile');
                        }}
                    />
                )}

                {/* Action Buttons Row - BELOW cover photo in the black area */}
                <div style={{
                    background: C.bg,
                    padding: '16px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    maxWidth: 800,
                    margin: '0 auto',
                    marginTop: 70 // Account for avatar overlap
                }}>
                    {/* Left side - Photos & Reels */}
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button
                            onClick={() => setPhotoGalleryOpen(true)}
                            style={{
                                background: C.card,
                                color: C.text,
                                border: `1px solid ${C.border}`,
                                borderRadius: 8,
                                padding: '10px 16px',
                                fontSize: 14,
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6
                            }}
                        >
                            📷 Photos
                        </button>
                        <button
                            onClick={() => setReelsGalleryOpen(true)}
                            style={{
                                background: C.card,
                                color: C.text,
                                border: `1px solid ${C.border}`,
                                borderRadius: 8,
                                padding: '10px 16px',
                                fontSize: 14,
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6
                            }}
                        >
                            Reels
                        </button>
                        <button
                            onClick={() => setLivesGalleryOpen(true)}
                            style={{
                                background: C.card,
                                color: C.text,
                                border: `1px solid ${C.border}`,
                                borderRadius: 8,
                                padding: '10px 16px',
                                fontSize: 14,
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6
                            }}
                        >
                            🔴 Lives
                        </button>
                    </div>

                    {/* Right side - Share Profile + Build Custom Avatar */}
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button
                            onClick={async () => {
                                const shareUrl = `https://smarter.poker/hub/user/${profile.username || user?.id}`;
                                try {
                                    await navigator.clipboard.writeText(shareUrl);
                                    setMessage('Profile link copied to clipboard!');
                                } catch {
                                    // Fallback for older browsers
                                    const ta = document.createElement('textarea');
                                    ta.value = shareUrl;
                                    document.body.appendChild(ta);
                                    ta.select();
                                    document.execCommand('copy');
                                    document.body.removeChild(ta);
                                    setMessage('Profile link copied to clipboard!');
                                }
                            }}
                            style={{
                                background: C.card,
                                color: C.text,
                                border: `1px solid ${C.border}`,
                                borderRadius: 8,
                                padding: '10px 16px',
                                fontSize: 14,
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6
                            }}
                        >
                            Share Profile
                        </button>
                        <button
                            onClick={() => window.open(`/hub/user/${profile.username || user?.id}`, '_blank')}
                            style={{
                                background: 'transparent',
                                color: '#1877F2',
                                border: '1px solid #1877F2',
                                borderRadius: 8,
                                padding: '10px 16px',
                                fontSize: 14,
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                transition: 'all 0.2s ease',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(24,119,242,0.08)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                        >
                            View Public Profile
                        </button>
                        <button
                            onClick={() => router.push('/hub/avatars')}
                            style={{
                                background: '#E74C3C',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: 8,
                                padding: '10px 16px',
                                fontSize: 14,
                                fontWeight: 700,
                                cursor: 'pointer',
                                boxShadow: '0 2px 8px rgba(231,76,60,0.3)'
                            }}
                        >
                            Build A Custom Avatar
                        </button>
                    </div>
                </div>

                {/* Main Content */}
                <div style={{ maxWidth: 800, margin: '80px auto 40px', padding: '0 16px' }}>
                    {/* Non-blocking Toast notification */}
                    <Toast message={message} onDismiss={() => { setMessage(''); setToastExiting(false); }} isExiting={toastExiting} />

                    {/* Profile Completion Progress Bar */}
                    <ProfileCompletionBar profile={profile} />

                    {/* Section Jump Navigation */}
                    <SectionNav />

                    {/* Social Stats Row */}
                    <div style={{
                        background: C.card, borderRadius: 12, padding: 16, marginBottom: 16,
                        border: `1px solid ${C.border}`,
                        display: 'flex', justifyContent: 'space-around', textAlign: 'center'
                    }}>
                        <div style={{ cursor: 'pointer' }} onClick={() => router.push('/hub/friends')}>
                            <div style={{ fontSize: 24, fontWeight: 700, color: C.text }}>{socialStats.friends}</div>
                            <div style={{ fontSize: 13, color: C.textSec }}>Friends</div>
                        </div>
                        <div>
                            <div style={{ fontSize: 24, fontWeight: 700, color: C.text }}>{socialStats.followers}</div>
                            <div style={{ fontSize: 13, color: C.textSec }}>Followers</div>
                        </div>
                        <div>
                            <div style={{ fontSize: 24, fontWeight: 700, color: C.text }}>{socialStats.following}</div>
                            <div style={{ fontSize: 13, color: C.textSec }}>Following</div>
                        </div>
                        <div style={{ cursor: 'pointer' }} onClick={() => router.push('/hub/social-media')}>
                            <div style={{ fontSize: 24, fontWeight: 700, color: C.text }}>{socialStats.posts}</div>
                            <div style={{ fontSize: 13, color: C.textSec }}>Posts</div>
                        </div>
                    </div>

                    {/* Friends Section - SmarterPoker Style */}
                    {friends.length > 0 && (
                        <div style={{
                            background: C.card, borderRadius: 8, padding: 16, marginBottom: 16,
                            boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.text }}>Friends</h3>
                                {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                                <a
                                    href="/hub/friends"
                                    style={{ color: C.blue, fontSize: 14, fontWeight: 600, textDecoration: 'none' }}
                                >
                                    See all
                                </a>
                            </div>
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(4, 1fr)',
                                gap: 12
                            }}>
                                {/* eslint-disable @next/next/no-html-link-for-pages */}
                                {friends.slice(0, 8).map(friend => (
                                    <a
                                        key={friend.id}
                                        href={`/hub/user/${friend.username || friend.id}`}
                                        style={{
                                            textDecoration: 'none',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            textAlign: 'center'
                                        }}
                                    >
                                        <img
                                            src={friend.avatar_url || '/default-avatar.png'}
                                            alt={friend.full_name || friend.username}
                                            loading="lazy"
                                            style={{
                                                width: 80, height: 80, borderRadius: '50%',
                                                objectFit: 'cover', marginBottom: 8,
                                                border: '2px solid #eee'
                                            }}
                                        />
                                        <div style={{
                                            fontSize: 13, fontWeight: 600, color: C.text,
                                            maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                                        }}>
                                            {friend.full_name || friend.username || 'User'}
                                        </div>
                                        {friend.mutualCount > 0 && (
                                            <div style={{ fontSize: 11, color: C.textSec }}>
                                                {friend.mutualCount} mutual friends
                                            </div>
                                        )}
                                    </a>
                                ))}
                                {/* eslint-enable @next/next/no-html-link-for-pages */}
                            </div>
                        </div>
                    )}

                    {/* Basic Info */}
                    <CollapsibleSection id="sec-basic" title="Basic Information" icon="👤">
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
                            <ProfileField label="First Name" value={profile.first_name} onChange={updateField('first_name')} placeholder="John" icon="📛" maxLength={50} />
                            <ProfileField label="Last Name" value={profile.last_name} onChange={updateField('last_name')} placeholder="Doe" icon="📛" maxLength={50} />
                            <div>
                                <ProfileField
                                    label="Username"
                                    value={profile.username}
                                    onChange={updateField('username')}
                                    placeholder="@JohnDoe"
                                    icon="@"
                                    maxLength={30}
                                    suffix={usernameStatus === 'checking' ? '⟳' : usernameStatus === 'available' ? '✅' : usernameStatus === 'taken' ? '❌' : null}
                                />
                                {/* Username validation label */}
                                {usernameStatus !== 'idle' && (
                                    <div style={{
                                        fontSize: 11, fontWeight: 600, marginTop: -12, marginBottom: 8, paddingLeft: 2,
                                        color: usernameStatus === 'available' ? '#42B72A'
                                            : usernameStatus === 'taken' ? '#FA383E'
                                            : '#888'
                                    }}>
                                        {usernameStatus === 'checking' && 'Checking availability...'}
                                        {usernameStatus === 'available' && 'Username is available'}
                                        {usernameStatus === 'taken' && 'Username is already taken'}
                                    </div>
                                )}
                            </div>
                        </div>
                        <ProfileField label="Bio" value={profile.bio} onChange={updateField('bio')} type="textarea" placeholder="Tell Us About Yourself And Your Poker Journey..." icon="" maxLength={500} showCount />

                        {/* Profile Picture History */}
                        <ProfilePictureHistory
                            userId={user?.id}
                            supabase={supabase}
                            onViewAll={() => setLibraryOpen(true)}
                            limit={6}
                            onPictureRestored={async (item) => {
                                const newUrl = item.thumbnail_url || item.public_url;
                                try {
                                    // 1. Sync Auth Metadata
                                    const _avatarToken = getProfileJwt();
                                    await fetch('/api/auth/update-metadata', {
                                        method: 'POST',
                                        headers: { 'Authorization': `Bearer ${_avatarToken}`, 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ metadata: { avatar_url: newUrl } })
                                    });

                                    // 2. Update local state
                                    setProfile(prev => ({ ...prev, avatar_url: newUrl }));
                                    setOriginalProfile(prev => ({ ...prev, avatar_url: newUrl }));
                                    
                                    // 3. Dispatch event for header/identity update
                                    window.dispatchEvent(new CustomEvent('profile-updated', {
                                        detail: { avatar_url: newUrl }
                                    }));
                                    
                                    setMessage('Profile picture restored!');
                                } catch (err) {
                                    setMessage('Error syncing restored picture: ' + err.message);
                                }
                            }}
                        />
                    </CollapsibleSection>

                    {/* Location */}
                    <CollapsibleSection id="sec-location" title="Location" icon="📍">
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                            <ProfileField label="City" value={profile.city} onChange={updateField('city')} placeholder="Las Vegas" maxLength={100} />
                            <ProfileField label="State" value={profile.state} onChange={updateField('state')} placeholder="Nevada" maxLength={100} />
                            <ProfileField label="Country" value={profile.country} onChange={updateField('country')} placeholder="USA" maxLength={100} />
                        </div>
                    </CollapsibleSection>

                    {/* Contact & Social */}
                    <CollapsibleSection id="sec-social" title="Contact & Social" icon="🔗">
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
                            <ProfileField label="Email" value={profile.email} onChange={updateField('email')} type="email" placeholder="you@example.com" icon="✉️" maxLength={100} />
                            <ProfileField label="Phone" value={profile.phone} onChange={updateField('phone')} type="tel" placeholder="555-123-4567" icon="📱" maxLength={20} />
                            <ProfileField label="Website" value={profile.website} onChange={updateField('website')} placeholder="https://yoursite.com" icon="🌐" maxLength={200} />
                            <ProfileField label="Twitter/X" value={profile.twitter} onChange={updateField('twitter')} placeholder="Username" icon="𝕏" maxLength={100} />
                            <ProfileField label="Instagram" value={profile.instagram} onChange={updateField('instagram')} placeholder="Username" icon="📸" maxLength={100} />
                            <ProfileField label="TikTok" value={profile.tiktok} onChange={updateField('tiktok')} placeholder="Username" icon="🎵" maxLength={100} />
                            <ProfileField label="Telegram" value={profile.telegram} onChange={updateField('telegram')} placeholder="Username" icon="✈️" maxLength={100} />
                        </div>
                    </CollapsibleSection>

                    {/* Card Deck Preference */}
                    <CollapsibleSection id="sec-cards" title="Card Deck Preference" icon="🎴">
                        <p style={{ fontSize: 13, color: C.textSec, marginBottom: 16 }}>
                            Choose your preferred card back design. This will be used across all games (Training, Club Arena, Diamond Arena).
                        </p>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                            {['white', 'black', 'red', 'blue'].map(deck => (
                                <div
                                    key={deck}
                                    onClick={() => updateField('card_back_preference')(deck)}
                                    style={{
                                        cursor: 'pointer',
                                        borderRadius: 8,
                                        border: profile.card_back_preference === deck ? '3px solid #FFD700' : `2px solid ${C.border}`,
                                        padding: 8,
                                        textAlign: 'center',
                                        transition: 'all 0.2s ease',
                                        background: profile.card_back_preference === deck ? 'rgba(255, 215, 0, 0.1)' : 'transparent',
                                        boxShadow: profile.card_back_preference === deck ? '0 0 15px rgba(255, 215, 0, 0.3)' : 'none'
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
                                            background: deck === 'white' ? '#f0f0f0' : deck === 'black' ? '#1a1a1a' : 'transparent'
                                        }}
                                    />
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
                            ))}
                        </div>
                    </CollapsibleSection>

                    {/* Poker Info */}
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

                    {/* HendonMob Integration / Poker Resume */}
                    <CollapsibleSection id="sec-resume" title="Poker Resume" icon="🏆">
                        <p style={{ fontSize: 13, color: C.textSec, marginBottom: 16 }}>
                            Link your Hendon Mob profile to automatically display your tournament stats.
                            Stats are synced directly from HendonMob.
                        </p>

                        <ProfileField
                            label="Hendon Mob Profile URL"
                            value={profile.hendon_url}
                            onChange={updateField('hendon_url')}
                            placeholder="https://pokerdb.thehendonmob.com/player.php?a=r&n=YOUR_ID"
                            icon="🔗"
                        />

                        {/* Display Poker Resume badge with sync button */}
                        <PokerResumeBadge
                            hendonData={{
                                hendon_url: profile.hendon_url,
                                total_cashes: profile.hendon_total_cashes,
                                total_earnings: profile.hendon_total_earnings,
                                biggest_cash: profile.hendon_biggest_cash,
                            }}
                            onRefresh={async () => {
                                if (!profile.hendon_url) {
                                    setMessage('Please enter your Hendon Mob URL first');
                                    return;
                                }

                                setIsRefreshing(true);
                                setMessage('🔄 Checking for updated stats...');
                                try {
                                    const _syncToken = getAccessToken();

                                    // Step 1: Try reading from DB (Scrapling may have already synced)
                                    const dbRes = await fetch('/api/hendonmob/sync', {
                                        method: 'GET',
                                        headers: {
                                            ...(_syncToken ? { 'Authorization': `Bearer ${_syncToken}` } : {}),
                                        },
                                    });
                                    const dbData = await dbRes.json();

                                    if (dbRes.ok && dbData.success && (dbData.total_cashes != null || dbData.total_earnings != null)) {
                                        // DB has data — use it
                                        setProfile(prev => ({
                                            ...prev,
                                            hendon_total_cashes: dbData.total_cashes,
                                            hendon_total_earnings: dbData.total_earnings,
                                            hendon_biggest_cash: dbData.biggest_cash,
                                        }));
                                        busEmit.dataMutated('profile');
                                        // Dispatch profile-updated + cache invalidation for cross-tab sync
                                        if (typeof window !== 'undefined') {
                                            window.dispatchEvent(new CustomEvent('profile-updated', {
                                                detail: { hendon_total_cashes: dbData.total_cashes, hendon_total_earnings: dbData.total_earnings }
                                            }));
                                        }
                                        try {
                                            const cacheKey = `sp-profile-cache-${profile.username}`;
                                            localStorage.removeItem(cacheKey);
                                            broadcastSync('smarter_poker_cache_sync', { type: 'cache_sync', cacheKey, action: 'invalidate', ts: Date.now() });
                                        } catch { /* noop */ }
                                        setMessage('✅ Stats refreshed successfully!');
                                        setIsRefreshing(false);
                                        return;
                                    }

                                    // Step 2: No data in DB yet (new user) — prompt manual entry
                                    setMessage('📋 No synced stats found. Opening your HendonMob page...');
                                    window.open(profile.hendon_url, '_blank');
                                    await new Promise(r => setTimeout(r, 800));

                                    const earningsInput = window.prompt(
                                        'Your HendonMob page is open in a new tab.\n\nEnter your Total Live Earnings from that page (numbers only, e.g. 900957):',
                                        ''
                                    );
                                    if (earningsInput === null) { setIsRefreshing(false); return; }

                                    const cashesInput = window.prompt(
                                        'Now enter your Total Cashes count:',
                                        ''
                                    );
                                    if (cashesInput === null) { setIsRefreshing(false); return; }

                                    const biggestInput = window.prompt(
                                        'Enter your Best Live Cash amount (numbers only, e.g. 252020):\n\n(Leave blank if unsure)',
                                        ''
                                    );

                                    const totalEarnings = parseFloat(String(earningsInput).replace(/[^0-9.]/g, '')) || null;
                                    const totalCashes = parseInt(String(cashesInput).replace(/[^0-9]/g, ''), 10) || null;
                                    const biggestCash = biggestInput ? parseFloat(String(biggestInput).replace(/[^0-9.]/g, '')) : null;

                                    if (!totalCashes && !totalEarnings) {
                                        setMessage('No valid stats entered. Please try again.');
                                        setIsRefreshing(false);
                                        return;
                                    }

                                    // Save to DB via POST
                                    const postRes = await fetch('/api/hendonmob/sync', {
                                        method: 'POST',
                                        headers: {
                                            'Content-Type': 'application/json',
                                            ...(_syncToken ? { 'Authorization': `Bearer ${_syncToken}` } : {}),
                                        },
                                        body: JSON.stringify({
                                            hendonUrl: profile.hendon_url,
                                            stats: { totalCashes, totalEarnings, biggestCash }
                                        })
                                    });
                                    const postData = await postRes.json();

                                    if (postRes.ok && postData.success) {
                                        setProfile(prev => ({
                                            ...prev,
                                            hendon_total_cashes: postData.total_cashes,
                                            hendon_total_earnings: postData.total_earnings,
                                            hendon_biggest_cash: postData.biggest_cash,
                                        }));
                                        busEmit.dataMutated('profile');
                                        // Dispatch profile-updated + cache invalidation for cross-tab sync
                                        if (typeof window !== 'undefined') {
                                            window.dispatchEvent(new CustomEvent('profile-updated', {
                                                detail: { hendon_total_cashes: postData.total_cashes, hendon_total_earnings: postData.total_earnings }
                                            }));
                                        }
                                        try {
                                            const cacheKey = `sp-profile-cache-${profile.username}`;
                                            localStorage.removeItem(cacheKey);
                                            broadcastSync('smarter_poker_cache_sync', { type: 'cache_sync', cacheKey, action: 'invalidate', ts: Date.now() });
                                        } catch { /* noop */ }
                                        setMessage('✅ Stats saved successfully! Your Poker Resume is now live.');
                                    } else {
                                        setMessage(`❌ ${postData.error || 'Could not save stats.'}`);
                                    }
                                } catch (e) {
                                    console.warn('Sync error:', e);
                                    setMessage('❌ Error syncing stats. Please try again.');
                                }
                                setIsRefreshing(false);
                            }}
                            isRefreshing={isRefreshing}
                        />
                    </CollapsibleSection>

                    {/* View Public Profile Link */}
                    {profile.username && (
                        <div style={{ textAlign: 'center', marginTop: 4, marginBottom: 8 }}>
                            <a
                                href={`/hub/social-media/profile/${profile.username}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                    fontSize: 13, color: '#1877F2', textDecoration: 'none',
                                    display: 'inline-flex', alignItems: 'center', gap: 6,
                                    padding: '8px 16px', borderRadius: 20,
                                    background: 'rgba(24,119,242,0.06)',
                                    border: '1px solid rgba(24,119,242,0.15)',
                                    transition: 'all 0.2s ease',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(24,119,242,0.12)'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(24,119,242,0.06)'; }}
                            >
                                View My Public Profile
                                <span style={{ fontSize: 11 }}>↗</span>
                            </a>
                        </div>
                    )}

                    {/* Save + Discard + Undo Buttons */}
                    <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                        {isDirty && (
                            <button
                                onClick={() => {
                                    if (confirm('Discard all unsaved changes?')) {
                                        setProfile({ ...originalProfile });
                                        setMessage('Changes discarded.');
                                    }
                                }}
                                style={{
                                    flex: '0 0 auto', padding: '16px 24px',
                                    background: 'transparent', color: '#FA383E',
                                    border: '2px solid #FA383E', borderRadius: 8,
                                    fontSize: 15, fontWeight: 600, cursor: 'pointer',
                                    transition: 'all 0.2s ease'
                                }}
                            >
                                Discard Changes
                            </button>
                        )}
                        {undoSnapshot && !isDirty && (
                            <button
                                onClick={async () => {
                                    // Restore snapshot and save to DB
                                    setProfile({ ...undoSnapshot });
                                    setOriginalProfile({ ...undoSnapshot });
                                    setUndoSnapshot(null);
                                    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
                                    // Persist undo to database
                                    try {
                                        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
                                        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
                                        const undoToken = getProfileJwt();
                                        await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}`, {
                                            method: 'PATCH',
                                            headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${undoToken}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
                                            body: JSON.stringify({
                                                first_name: (undoSnapshot.first_name || '').trim(),
                                                last_name: (undoSnapshot.last_name || '').trim(),
                                                full_name: `${(undoSnapshot.first_name || '').trim()} ${(undoSnapshot.last_name || '').trim()}`.trim(),
                                                username: (undoSnapshot.username || '').trim() || null,
                                                bio: undoSnapshot.bio, city: undoSnapshot.city, state: undoSnapshot.state,
                                                country: undoSnapshot.country, phone: undoSnapshot.phone, email: undoSnapshot.email,
                                                updated_at: new Date().toISOString(),
                                            }),
                                        });
                                        // Full 4-layer sync for undo save
                                        window.dispatchEvent(new CustomEvent('profile-updated', {
                                            detail: {
                                                full_name: `${(undoSnapshot.first_name || '').trim()} ${(undoSnapshot.last_name || '').trim()}`.trim(),
                                                first_name: (undoSnapshot.first_name || '').trim(),
                                                last_name: (undoSnapshot.last_name || '').trim(),
                                                username: undoSnapshot.username,
                                                avatar_url: undoSnapshot.avatar_url,
                                            }
                                        }));
                                        try {
                                            const cacheKey = `sp-profile-cache-${undoSnapshot.username}`;
                                            localStorage.removeItem(cacheKey);
                                            broadcastSync('smarter_poker_cache_sync', { type: 'cache_sync', cacheKey, action: 'invalidate', ts: Date.now() });
                                            broadcastSync('smarter_poker_avatar_sync', 'refresh');
                                        } catch { /* noop */ }
                                        busEmit.dataMutated('profile');
                                        setMessage('Undo successful — previous profile restored.');
                                    } catch (e) {
                                        console.warn('Undo save error:', e);
                                        setMessage('Error: Could not undo. Please try again.');
                                    }
                                }}
                                style={{
                                    flex: '0 0 auto', padding: '16px 24px',
                                    background: 'rgba(255,215,0,0.08)', color: '#FFD700',
                                    border: '2px solid rgba(255,215,0,0.4)', borderRadius: 8,
                                    fontSize: 15, fontWeight: 600, cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                    animation: 'undoPulse 2s ease-in-out infinite',
                                }}
                            >
                                Undo Save
                            </button>
                        )}
                        <button
                            data-save-btn="true"
                            onClick={handleSave}
                            disabled={saving}
                            style={{
                                flex: 1, padding: 16,
                                background: isDirty ? 'linear-gradient(135deg, #1877F2, #0E5FC7)' : C.blue,
                                color: 'white',
                                border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 600,
                                cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1,
                                boxShadow: isDirty ? '0 4px 15px rgba(24,119,242,0.4)' : 'none',
                                transition: 'all 0.3s ease',
                                position: 'relative'
                            }}
                        >
                            {saving
                                ? (savePhase ? `${savePhase}...` : 'Saving...')
                                : isDirty ? 'Save Profile (Unsaved Changes)' : 'Save Profile'
                            }
                        </button>
                    </div>
                </div>
            </div>

            {/* Media Library Modal */}
            <MediaLibrary
                isOpen={libraryOpen}
                onClose={() => setLibraryOpen(false)}
                userId={user?.id}
                supabase={supabase}
                mode="browse"
            />

            {/* Photo Gallery Modal */}
            {photoGalleryOpen && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.9)', zIndex: 9999,
                    display: 'flex', flexDirection: 'column'
                }}>
                    <div style={{
                        padding: 16, display: 'flex', justifyContent: 'space-between',
                        alignItems: 'center', borderBottom: '1px solid #333'
                    }}>
                        <h2 style={{ margin: 0, color: 'white', fontSize: 20 }}>📷 My Photos</h2>
                        <button
                            onClick={() => setPhotoGalleryOpen(false)}
                            style={{
                                background: 'none', border: 'none', color: 'white',
                                fontSize: 28, cursor: 'pointer'
                            }}
                        >×</button>
                    </div>
                    <div style={{
                        flex: 1, overflow: 'auto', padding: 16,
                        display: 'flex', flexDirection: 'column', gap: 16,
                        maxWidth: 600, margin: '0 auto', width: '100%'
                    }}>
                        {userPhotos.length === 0 ? (
                            <div style={{
                                textAlign: 'center', color: '#888',
                                padding: 60
                            }}>
                                <div style={{ fontSize: 48, marginBottom: 16 }}>📷</div>
                                <div style={{ fontSize: 18 }}>No Photos Yet</div>
                                <div style={{ fontSize: 14, color: '#666', marginTop: 8 }}>
                                    Photos from your posts will appear here
                                </div>
                            </div>
                        ) : (
                            userPhotos.map(photo => (
                                <div key={photo.id} style={{
                                    background: '#111', borderRadius: 12, overflow: 'hidden'
                                }}>
                                    <img
                                        src={photo.media_url}
                                        alt={photo.content || 'Photo'}
                                        loading="lazy"
                                        style={{
                                            width: '100%', height: 'auto',
                                            display: 'block'
                                        }}
                                    />
                                    {photo.content && (
                                        <div style={{
                                            padding: '12px 16px', color: 'white',
                                            fontSize: 14, background: '#1a1a1a'
                                        }}>{photo.content}</div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* Reels Gallery Modal */}
            {reelsGalleryOpen && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.9)', zIndex: 9999,
                    display: 'flex', flexDirection: 'column'
                }}>
                    <div style={{
                        padding: 16, display: 'flex', justifyContent: 'space-between',
                        alignItems: 'center', borderBottom: '1px solid #333'
                    }}>
                        <h2 style={{ margin: 0, color: 'white', fontSize: 20 }}>My Reels</h2>
                        <button
                            onClick={() => setReelsGalleryOpen(false)}
                            style={{
                                background: 'none', border: 'none', color: 'white',
                                fontSize: 28, cursor: 'pointer'
                            }}
                        >×</button>
                    </div>
                    <div style={{
                        flex: 1, overflow: 'auto', padding: 16,
                        display: 'flex', flexDirection: 'column', gap: 16,
                        maxWidth: 600, margin: '0 auto', width: '100%'
                    }}>
                        {userReels.length === 0 ? (
                            <div style={{
                                textAlign: 'center', color: '#888',
                                padding: 60
                            }}>
                                <div style={{ fontSize: 48, marginBottom: 16 }}>🎞️</div>
                                <div style={{ fontSize: 18 }}>No Reels Yet</div>
                                <div style={{ fontSize: 14, color: '#666', marginTop: 8 }}>
                                    Videos from your posts will appear here
                                </div>
                            </div>
                        ) : (
                            userReels.map(reel => (
                                <div
                                    key={reel.id}
                                    style={{
                                        background: '#111', borderRadius: 12, overflow: 'hidden'
                                    }}
                                >
                                    <video
                                        src={reel.media_url}
                                        poster={reel.thumbnail_url}
                                        style={{
                                            width: '100%', height: 'auto',
                                            display: 'block', maxHeight: '80vh'
                                        }}
                                        controls
                                    />
                                    {reel.caption && (
                                        <div style={{
                                            padding: '12px 16px', color: 'white',
                                            fontSize: 14, background: '#1a1a1a'
                                        }}>{reel.caption}</div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* Lives Gallery Modal */}
            {livesGalleryOpen && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.9)', zIndex: 9999,
                    display: 'flex', flexDirection: 'column'
                }}>
                    <div style={{
                        padding: 16, display: 'flex', justifyContent: 'space-between',
                        alignItems: 'center', borderBottom: '1px solid #333'
                    }}>
                        <h2 style={{ margin: 0, color: 'white', fontSize: 20 }}>🔴 My Lives</h2>
                        <button
                            onClick={() => setLivesGalleryOpen(false)}
                            style={{
                                background: 'none', border: 'none', color: 'white',
                                fontSize: 28, cursor: 'pointer'
                            }}
                        >×</button>
                    </div>
                    <div style={{
                        flex: 1, overflow: 'auto', padding: 16,
                        display: 'flex', flexDirection: 'column', gap: 16,
                        maxWidth: 600, margin: '0 auto', width: '100%'
                    }}>
                        {userLives.length === 0 ? (
                            <div style={{
                                textAlign: 'center', color: '#888',
                                padding: 60
                            }}>
                                <div style={{ fontSize: 48, marginBottom: 16 }}>🔴</div>
                                <div style={{ fontSize: 18 }}>No Saved Lives Yet</div>
                                <div style={{ fontSize: 14, color: '#666', marginTop: 8 }}>
                                    When you end a live stream, you can save it here
                                </div>
                            </div>
                        ) : (
                            userLives.map(live => {
                                const duration = live.started_at && live.ended_at
                                    ? Math.round((new Date(live.ended_at) - new Date(live.started_at)) / 1000)
                                    : 0;
                                const durationStr = `${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}`;
                                const dateStr = new Date(live.created_at).toLocaleDateString();

                                return (
                                    <div
                                        key={live.id}
                                        style={{
                                            background: '#1a1a1a',
                                            borderRadius: 12,
                                            overflow: 'hidden'
                                        }}
                                    >
                                        {/* Video Preview */}
                                        <div style={{ position: 'relative', background: '#000' }}>
                                            {live.video_url ? (
                                                <video
                                                    src={live.video_url}
                                                    poster={live.thumbnail_url}
                                                    style={{ width: '100%', height: 'auto', display: 'block', maxHeight: '80vh' }}
                                                    controls
                                                />
                                            ) : live.thumbnail_url ? (
                                                <img
                                                    src={live.thumbnail_url}
                                                    alt={live.title}
                                                    style={{ width: '100%', height: 'auto', display: 'block' }}
                                                />
                                            ) : (
                                                <div style={{
                                                    width: '100%', height: '100%',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    color: '#666', fontSize: 40
                                                }}>📺</div>
                                            )}
                                            {/* Duration badge */}
                                            <div style={{
                                                position: 'absolute', bottom: 8, right: 8,
                                                background: 'rgba(0,0,0,0.8)', color: 'white',
                                                padding: '4px 8px', borderRadius: 4, fontSize: 12
                                            }}>{durationStr}</div>
                                            {/* Status badge */}
                                            <div style={{
                                                position: 'absolute', top: 8, left: 8,
                                                background: live.is_posted ? '#42B72A' : '#FA383E',
                                                color: 'white',
                                                padding: '4px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600
                                            }}>{live.is_posted ? 'Posted' : 'Draft'}</div>
                                        </div>
                                        {/* Info */}
                                        <div style={{ padding: 12 }}>
                                            <div style={{ color: 'white', fontWeight: 600, marginBottom: 4 }}>
                                                {live.title || 'Live Stream'}
                                            </div>
                                            <div style={{ color: '#888', fontSize: 13, marginBottom: 12 }}>
                                                {dateStr} • {live.viewer_count || 0} viewers
                                            </div>
                                            {/* Actions */}
                                            {!live.is_posted && (
                                                <div style={{ display: 'flex', gap: 8 }}>
                                                    <button
                                                        onClick={async () => {
                                                            if (!live.video_url) {
                                                                setMessage('No video available to post');
                                                                return;
                                                            }
                                                            // Post to feed
                                                            try {
                                                                // Direct PostgREST — avoids SIGNED_OUT cascade
                                                                const _liveUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
                                                                const _liveKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
                                                                const _liveJwt = getProfileJwt();
                                                                const _liveHeaders = { 'apikey': _liveKey, 'Authorization': `Bearer ${_liveJwt}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' };

                                                                // Insert social post
                                                                const insertRes = await fetch(`${_liveUrl}/rest/v1/social_posts`, {
                                                                    method: 'POST',
                                                                    headers: _liveHeaders,
                                                                    body: JSON.stringify({
                                                                        author_id: user?.id,
                                                                        content: `🔴 ${live.title || 'Live replay'}`,
                                                                        content_type: 'video',
                                                                        media_urls: [live.video_url],
                                                                        visibility: 'public'
                                                                    }),
                                                                });
                                                                if (!insertRes.ok) throw new Error(await insertRes.text());

                                                                // Update live stream status
                                                                const updateRes = await fetch(`${_liveUrl}/rest/v1/live_streams?id=eq.${live.id}`, {
                                                                    method: 'PATCH',
                                                                    headers: _liveHeaders,
                                                                    body: JSON.stringify({ is_posted: true, is_draft: false }),
                                                                });
                                                                if (!updateRes.ok) throw new Error(await updateRes.text());

                                                                setUserLives(prev => prev.map(l =>
                                                                    l.id === live.id ? { ...l, is_posted: true, is_draft: false } : l
                                                                ));
                                                                setMessage('Live stream posted to your feed!');
                                                                busEmit.dataMutated('social');
                                                                try {
                                                                    broadcastSync('smarter_poker_cache_sync', { type: 'cache_sync', cacheKey: 'social-feed', action: 'invalidate', ts: Date.now() });
                                                                } catch { /* noop */ }
                                                            } catch (e) {
                                                                console.warn('Error posting live stream:', e);
                                                                setMessage('Error posting live stream: ' + (e.message || 'Unknown error'));
                                                            }
                                                        }}
                                                        style={{
                                                            flex: 1, padding: '10px 16px', borderRadius: 6,
                                                            background: '#1877F2', color: 'white',
                                                            border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer'
                                                        }}
                                                    >Post</button>
                                                    <button
                                                        onClick={async () => {
                                                            if (confirm('Delete this live stream?')) {
                                                                try {
                                                                    // Direct PostgREST DELETE — avoids SIGNED_OUT cascade
                                                                    const _delUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
                                                                    const _delKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
                                                                    const _delJwt = getProfileJwt();
                                                                    const delRes = await fetch(`${_delUrl}/rest/v1/live_streams?id=eq.${live.id}`, {
                                                                        method: 'DELETE',
                                                                        headers: { 'apikey': _delKey, 'Authorization': `Bearer ${_delJwt}`, 'Content-Type': 'application/json' },
                                                                    });
                                                                    if (!delRes.ok) throw new Error(await delRes.text());
                                                                    setUserLives(prev => prev.filter(l => l.id !== live.id));
                                                                    setMessage('Live stream deleted.');
                                                                    busEmit.dataMutated('social');
                                                                    try {
                                                                        broadcastSync('smarter_poker_cache_sync', { type: 'cache_sync', cacheKey: 'social-feed', action: 'invalidate', ts: Date.now() });
                                                                    } catch { /* noop */ }
                                                                } catch (e) {
                                                                    console.warn('Error deleting live stream:', e);
                                                                    setMessage('Error deleting live stream: ' + (e.message || 'Unknown error'));
                                                                }
                                                            }
                                                        }}
                                                        style={{
                                                            padding: '10px 16px', borderRadius: 6,
                                                            background: 'transparent', color: '#FA383E',
                                                            border: '1px solid #FA383E', fontSize: 14, fontWeight: 600, cursor: 'pointer'
                                                        }}
                                                    >Delete</button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                  <BottomNavBar />
                </div>
            )}
            {/* Global CSS keyframes for toast and avatar spinner */}
            <style>{`
                @keyframes toastSlideIn {
                    from { opacity: 0; transform: translateX(60px); }
                    to { opacity: 1; transform: translateX(0); }
                }
                @keyframes toastSlideOut {
                    from { opacity: 1; transform: translateX(0); }
                    to { opacity: 0; transform: translateX(60px); }
                }
                @keyframes undoPulse {
                    0%, 100% { box-shadow: 0 0 0 0 rgba(255,215,0,0.3); }
                    50% { box-shadow: 0 0 12px 4px rgba(255,215,0,0.15); }
                }
                @keyframes avatarSpin {
                    to { transform: rotate(360deg); }
                }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                /* Mobile responsive grids */
                @media (max-width: 600px) {
                    .profile-page [style*="grid-template-columns: repeat(2"] {
                        grid-template-columns: 1fr !important;
                    }
                    .profile-page [style*="grid-template-columns: repeat(3"] {
                        grid-template-columns: 1fr !important;
                    }
                    .profile-page [style*="grid-template-columns: repeat(4"] {
                        grid-template-columns: repeat(2, 1fr) !important;
                    }
                }
            `}</style>
        </>
    );
}
