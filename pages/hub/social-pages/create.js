/**
 * Create Social Page - Venue, Group, Community, or Brand page
 */
import SEOHead from '../../../src/components/seo/SEOHead';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { motion } from 'framer-motion';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import { getAuthUser } from '../../../src/lib/authUtils';

const C = {
    bg: '#F0F2F5', card: '#FFFFFF', text: '#050505', textSec: '#65676B',
    border: '#DADDE1', blue: '#1877F2', blueHover: '#166FE5', green: '#42B72A', red: '#FA383E',
};

const PAGE_TYPES = [
    { key: 'venue', label: 'Venue Page', desc: 'For poker rooms and casinos', icon: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z' },
    { key: 'group', label: 'Group Page', desc: 'For home games and study groups', icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2' },
    { key: 'community', label: 'Community', desc: 'For open poker communities', icon: 'M12 2L2 7l10 5 10-5-10-5z' },
    { key: 'brand', label: 'Brand Page', desc: 'For poker brands and products', icon: 'M20 7h-3V4a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v3H4a1 1 0 0 0-1 1v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a1 1 0 0 0-1-1z' },
];

const CATEGORIES = [
    'general', 'poker room', 'home game', 'study group', 'tournament circuit',
    'coaching', 'entertainment', 'strategy', 'news', 'regional',
];

export default function CreateSocialPage() {
    const router = useRouter();
    const [user, setUser] = useState(null);
    const [step, setStep] = useState(1);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);

    const [form, setForm] = useState({
        page_type: '',
        name: '',
        description: '',
        category: 'general',
        website: '',
        contact_email: '',
        phone: '',
        location_city: '',
        location_state: '',
        is_public: true,
        allow_member_posts: true,
        require_post_approval: false,
    });

    useEffect(() => {
        const u = getAuthUser();
        if (!u) { router.push('/auth/login?redirect=/hub/social-pages/create'); return; }
        setUser(u);
    }, [router]);

    function update(field, value) {
        setForm(prev => ({ ...prev, [field]: value }));
    }

    async function handleSubmit() {
        if (!form.name.trim()) { setError('Page name is required'); return; }
        if (!form.page_type) { setError('Select a page type'); return; }

        setSubmitting(true);
        setError(null);

        try {
            const res = await fetch('/api/social/pages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...form, owner_id: user.id }),
            });
            const json = await res.json();

            if (json.success) {
                router.push(`/hub/social-pages/${json.data.slug || json.data.id}`);
            } else {
                setError(json.error || 'Failed to create page');
            }
        } catch (e) {
            setError('Network error. Please try again.');
        }
        setSubmitting(false);
    }

    const inputStyle = {
        width: '100%', padding: '10px 12px', borderRadius: 8,
        border: `1px solid ${C.border}`, fontSize: 14, fontFamily: 'inherit',
        color: C.text, outline: 'none', boxSizing: 'border-box', background: C.bg,
    };

    const labelStyle = {
        fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 4, display: 'block',
    };

    return (
        <>
            <SEOHead
                title="Create Social Page"
                description="Create A New Social Page On Smarter.Poker To Share Content And Build A Community."
                canonical="/hub/social-pages/create"
                noindex={true}
            />
            <UniversalHeader />

            <div style={{
                minHeight: '100vh', background: C.bg, paddingTop: 60,
                fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
            }}>
                <div style={{ maxWidth: 600, margin: '0 auto', padding: 16 }}>
                    {/* Back */}
                    <button onClick={() => step > 1 ? setStep(step - 1) : router.back()} style={{
                        display: 'flex', alignItems: 'center', gap: 4, background: 'none',
                        border: 'none', color: C.blue, fontSize: 14, fontWeight: 600,
                        cursor: 'pointer', padding: 0, marginBottom: 16, fontFamily: 'inherit',
                    }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="15 18 9 12 15 6"/>
                        </svg>
                        {step > 1 ? 'Back' : 'Cancel'}
                    </button>

                    <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 24 }}>
                        <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: '0 0 4px' }}>
                            Create a Page
                        </h1>
                        <p style={{ fontSize: 14, color: C.textSec, margin: '0 0 20px' }}>
                            Step {step} of 2 - {step === 1 ? 'Choose type' : 'Page details'}
                        </p>

                        {error && (
                            <div style={{
                                padding: '10px 14px', borderRadius: 8, background: '#FEE2E2',
                                color: '#DC2626', fontSize: 13, fontWeight: 500, marginBottom: 16,
                            }}>
                                {error}
                            </div>
                        )}

                        {step === 1 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {PAGE_TYPES.map(pt => (
                                    <motion.button
                                        key={pt.key}
                                        whileHover={{ scale: 1.01 }}
                                        whileTap={{ scale: 0.99 }}
                                        onClick={() => { update('page_type', pt.key); setStep(2); }}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 14, padding: 16,
                                            borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                                            fontFamily: 'inherit',
                                            border: form.page_type === pt.key ? `2px solid ${C.blue}` : `1px solid ${C.border}`,
                                            background: form.page_type === pt.key ? '#E7F3FF' : C.card,
                                        }}
                                    >
                                        <div style={{
                                            width: 44, height: 44, borderRadius: 10, background: '#E7F3FF',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                        }}>
                                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d={pt.icon}/>
                                                {pt.key === 'venue' && <circle cx="12" cy="10" r="3"/>}
                                                {pt.key === 'group' && <circle cx="9" cy="7" r="4"/>}
                                                {pt.key === 'community' && <><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></>}
                                            </svg>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{pt.label}</div>
                                            <div style={{ fontSize: 13, color: C.textSec }}>{pt.desc}</div>
                                        </div>
                                    </motion.button>
                                ))}
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                <div>
                                    <label style={labelStyle}>Page Name *</label>
                                    <input type="text" value={form.name} onChange={e => update('name', e.target.value)}
                                        placeholder="Enter Page Name" style={inputStyle} maxLength={100} />
                                </div>

                                <div>
                                    <label style={labelStyle}>Description</label>
                                    <textarea value={form.description} onChange={e => update('description', e.target.value)}
                                        placeholder="Tell People About This Page..."
                                        style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} maxLength={500} />
                                </div>

                                <div>
                                    <label style={labelStyle}>Category</label>
                                    <select value={form.category} onChange={e => update('category', e.target.value)}
                                        style={inputStyle}>
                                        {CATEGORIES.map(c => (
                                            <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                                        ))}
                                    </select>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                    <div>
                                        <label style={labelStyle}>City</label>
                                        <input type="text" value={form.location_city}
                                            onChange={e => update('location_city', e.target.value)}
                                            placeholder="City" style={inputStyle} />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>State</label>
                                        <input type="text" value={form.location_state}
                                            onChange={e => update('location_state', e.target.value)}
                                            placeholder="State" style={inputStyle} />
                                    </div>
                                </div>

                                <div>
                                    <label style={labelStyle}>Website</label>
                                    <input type="url" value={form.website} onChange={e => update('website', e.target.value)}
                                        placeholder="https://..." style={inputStyle} />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                    <div>
                                        <label style={labelStyle}>Contact Email</label>
                                        <input type="email" value={form.contact_email} onChange={e => update('contact_email', e.target.value)}
                                            placeholder="contact@example.com" style={inputStyle} />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Phone</label>
                                        <input type="tel" value={form.phone} onChange={e => update('phone', e.target.value)}
                                            placeholder="(555) 123-4567" style={inputStyle} />
                                    </div>
                                </div>

                                {/* Settings */}
                                <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
                                    <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: '0 0 12px' }}>Settings</h3>

                                    {[
                                        { field: 'is_public', label: 'Public Page', desc: 'Anyone can find and view this page' },
                                        { field: 'allow_member_posts', label: 'Member Posts', desc: 'Allow followers to create posts' },
                                        { field: 'require_post_approval', label: 'Post Approval', desc: 'Review posts before they appear' },
                                    ].map(setting => (
                                        <div key={setting.field} style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            padding: '10px 0', borderBottom: `1px solid ${C.bg}`,
                                        }}>
                                            <div>
                                                <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{setting.label}</div>
                                                <div style={{ fontSize: 12, color: C.textSec }}>{setting.desc}</div>
                                            </div>
                                            <button onClick={() => update(setting.field, !form[setting.field])} style={{
                                                width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                                                background: form[setting.field] ? C.blue : '#CCD0D5',
                                                position: 'relative', transition: 'background 0.2s',
                                            }}>
                                                <div style={{
                                                    width: 20, height: 20, borderRadius: '50%', background: '#fff',
                                                    position: 'absolute', top: 2,
                                                    left: form[setting.field] ? 22 : 2,
                                                    transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                                                }}/>
                                            </button>
                                        </div>
                                    ))}
                                </div>

                                <button onClick={handleSubmit} disabled={submitting} style={{
                                    width: '100%', padding: '12px 0', borderRadius: 8, border: 'none',
                                    background: submitting ? '#CCD0D5' : C.blue, color: '#fff',
                                    fontSize: 15, fontWeight: 700, cursor: submitting ? 'default' : 'pointer',
                                    fontFamily: 'inherit', marginTop: 8,
                                }}>
                                    {submitting ? 'Creating...' : 'Create Page'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
