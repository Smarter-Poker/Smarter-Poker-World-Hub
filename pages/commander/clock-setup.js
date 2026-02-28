/**
 * Tournament Clock Setup — Theme & Template Configuration
 * Configure clock display colors, layouts, and preset templates
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../src/components/seo/SEOHead';
import CommanderLayout from '../../src/components/commander/shared/CommanderLayout';
import { Palette, Save, RotateCcw, Loader2, Monitor, Check } from 'lucide-react';

const PRESET_THEMES = [
    { id: 'classic', name: 'Classic Green', background: '#0a3d0a', text: '#ffffff', accent: '#31A24C', blinds: '#F59E0B', description: 'Traditional casino green felt' },
    { id: 'midnight', name: 'Midnight Blue', background: '#0D192E', text: '#ffffff', accent: '#1877F2', blinds: '#22D3EE', description: 'Sleek dark blue theme' },
    { id: 'royal', name: 'Royal Purple', background: '#1a0a2e', text: '#ffffff', accent: '#8B5CF6', blinds: '#F59E0B', description: 'Luxurious purple theme' },
    { id: 'crimson', name: 'Crimson Red', background: '#2a0a0a', text: '#ffffff', accent: '#EF4444', blinds: '#F59E0B', description: 'Bold red tournament theme' },
    { id: 'gold', name: 'Gold Elite', background: '#1a1508', text: '#ffffff', accent: '#F59E0B', blinds: '#ffffff', description: 'Premium gold accents' },
    { id: 'stealth', name: 'Stealth Black', background: '#0a0a0a', text: '#ffffff', accent: '#64748B', blinds: '#94A3B8', description: 'Minimal dark theme' },
];

export default function ClockSetup() {
    const router = useRouter();
    const [staff, setStaff] = useState(null);
    const [activeTheme, setActiveTheme] = useState('midnight');
    const [customColors, setCustomColors] = useState({
        background: '#0D192E',
        text: '#ffffff',
        accent: '#1877F2',
        blinds: '#22D3EE',
    });
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        const stored = localStorage.getItem('commander_staff');
        if (!stored) { router.push('/commander/login').catch(() => { }); return; }
        try {
            const s = JSON.parse(stored);
            if (!s.venue_id) { router.push('/commander/login').catch(() => { }); return; }
            setStaff(s);
        } catch { router.push('/commander/login').catch(() => { }); }

        // Load saved theme
        try {
            const savedTheme = JSON.parse(localStorage.getItem('commander_clock_theme') || '{}');
            if (savedTheme.id) setActiveTheme(savedTheme.id);
            if (savedTheme.colors) setCustomColors(savedTheme.colors);
        } catch { }
    }, []);

    const selectTheme = (theme) => {
        setActiveTheme(theme.id);
        setCustomColors({
            background: theme.background,
            text: theme.text,
            accent: theme.accent,
            blinds: theme.blinds,
        });
    };

    const handleSave = () => {
        localStorage.setItem('commander_clock_theme', JSON.stringify({
            id: activeTheme,
            colors: customColors,
        }));
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    if (!staff) {
        return (
            <div className="cmd-page flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-[#1877F2]" />
            </div>
        );
    }

    return (
        <CommanderLayout title="Clock Setup | Commander" backHref="/commander/dashboard?card=tournaments">
            <SEOHead title="Commander — Clock Setup" description="Tournament clock theme configuration" noindex={true} />
            <div className="cmd-page">
                <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">

                    {/* Header */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-[#1877F2]/10 rounded-lg flex items-center justify-center">
                                <Palette className="w-5 h-5 text-[#1877F2]" />
                            </div>
                            <div>
                                <h1 className="text-xl font-bold text-white">Clock Setup</h1>
                                <p className="text-sm text-[#64748B]">Preset themes & color templates</p>
                            </div>
                        </div>
                        <button
                            onClick={handleSave}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-all ${saved ? 'bg-[#31A24C] text-white' : 'bg-[#1877F2] text-white hover:bg-[#1565D0]'
                                }`}
                        >
                            {saved ? <><Check className="w-4 h-4" /> Saved!</> : <><Save className="w-4 h-4" /> Save Theme</>}
                        </button>
                    </div>

                    {/* Live Preview */}
                    <div className="cmd-panel overflow-hidden">
                        <p className="px-4 pt-3 text-xs text-[#64748B] font-semibold uppercase tracking-wider">Live Preview</p>
                        <div
                            className="mx-4 my-3 rounded-xl p-6 text-center border border-white/10"
                            style={{ background: customColors.background }}
                        >
                            <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: customColors.accent }}>
                                Level 8
                            </p>
                            <p className="text-5xl font-black font-mono mb-2" style={{ color: customColors.text }}>
                                12:00
                            </p>
                            <p className="text-lg font-bold" style={{ color: customColors.blinds }}>
                                400 / 800
                            </p>
                            <p className="text-xs mt-2" style={{ color: customColors.accent, opacity: 0.7 }}>
                                Ante: 100 • Next: 500/1,000
                            </p>
                        </div>
                    </div>

                    {/* Preset Themes */}
                    <div>
                        <p className="text-xs text-[#64748B] font-semibold uppercase tracking-wider mb-2">Preset Themes</p>
                        <div className="grid grid-cols-2 gap-2">
                            {PRESET_THEMES.map(theme => (
                                <button
                                    key={theme.id}
                                    onClick={() => selectTheme(theme)}
                                    className={`cmd-panel p-3 text-left transition-all ${activeTheme === theme.id ? 'ring-2 ring-[#1877F2] bg-[#1877F2]/5' : 'hover:bg-[#132240]'
                                        }`}
                                >
                                    <div className="flex items-center gap-2 mb-1">
                                        <div className="w-4 h-4 rounded-full border border-white/20" style={{ background: theme.accent }}></div>
                                        <p className="text-sm font-semibold text-white">{theme.name}</p>
                                        {activeTheme === theme.id && <Check className="w-3.5 h-3.5 text-[#1877F2] ml-auto" />}
                                    </div>
                                    <p className="text-[10px] text-[#64748B]">{theme.description}</p>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Custom Color Adjustments */}
                    <div className="cmd-panel p-4">
                        <p className="text-xs text-[#64748B] font-semibold uppercase tracking-wider mb-3">Custom Colors</p>
                        <div className="grid grid-cols-2 gap-3">
                            {[
                                { key: 'background', label: 'Background' },
                                { key: 'text', label: 'Clock Text' },
                                { key: 'accent', label: 'Accent / Level' },
                                { key: 'blinds', label: 'Blinds Text' },
                            ].map(({ key, label }) => (
                                <div key={key} className="flex items-center gap-2">
                                    <input
                                        type="color"
                                        value={customColors[key]}
                                        onChange={e => { setCustomColors({ ...customColors, [key]: e.target.value }); setActiveTheme('custom'); }}
                                        className="w-8 h-8 rounded-lg border border-[#1E3A5F] cursor-pointer bg-transparent"
                                    />
                                    <div>
                                        <p className="text-xs text-white font-medium">{label}</p>
                                        <p className="text-[10px] text-[#64748B] font-mono">{customColors[key]}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                </div>
            </div>
        </CommanderLayout>
    );
}
