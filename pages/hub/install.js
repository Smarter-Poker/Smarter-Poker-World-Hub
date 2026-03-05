/**
 * Smarter.Poker — Install on iPad & Android
 * /hub/install
 * Step-by-step guide to add the app to your home screen
 */
import { useState } from 'react';
import SEOHead from '../../src/components/seo/SEOHead';
import Link from 'next/link';
import { Smartphone, Tablet, Share, ArrowRight, CheckCircle2 } from 'lucide-react';

export default function InstallPage() {
    const [tab, setTab] = useState('ipad');

    const steps = {
        ipad: [
            {
                num: 1,
                title: 'Open Safari',
                desc: 'Navigate to smarter.poker in Safari. This must be Safari — Chrome and other browsers do not support "Add to Home Screen" on iOS/iPadOS.',
                icon: '🧭',
                highlight: 'Safari only — not Chrome'
            },
            {
                num: 2,
                title: 'Tap the Share Button',
                desc: 'Tap the Share icon (box with an arrow pointing up) in the Safari toolbar. On iPad, this is at the top-right of the screen.',
                icon: '📤',
                highlight: 'Box with arrow ↑'
            },
            {
                num: 3,
                title: 'Scroll Down & Tap "Add to Home Screen"',
                desc: 'Scroll down in the share sheet and tap "Add to Home Screen." You may need to scroll past other share options.',
                icon: '➕',
                highlight: 'Add to Home Screen'
            },
            {
                num: 4,
                title: 'Name It & Tap "Add"',
                desc: 'The name will auto-fill as "Smarter.Poker." Tap "Add" in the top-right corner to confirm.',
                icon: '✅',
                highlight: 'Tap Add'
            },
            {
                num: 5,
                title: 'Launch From Home Screen',
                desc: 'The Smarter.Poker icon now appears on your home screen. Tap it to open the app in full-screen mode — no browser bars, no tabs.',
                icon: '🚀',
                highlight: 'Full-screen app experience'
            }
        ],
        android: [
            {
                num: 1,
                title: 'Open Chrome',
                desc: 'Navigate to smarter.poker in Google Chrome. Chrome works best for Android installations.',
                icon: '🌐',
                highlight: 'Chrome recommended'
            },
            {
                num: 2,
                title: 'Tap the Three-Dot Menu',
                desc: 'Tap the ⋮ menu icon (three vertical dots) in the top-right corner of Chrome.',
                icon: '⋮',
                highlight: 'Three dots → top right'
            },
            {
                num: 3,
                title: 'Tap "Add to Home Screen" or "Install App"',
                desc: 'Look for "Add to Home screen" or "Install app" in the menu. If you see "Install app," Chrome has detected it as a full PWA and will install it like a native app.',
                icon: '📲',
                highlight: 'Install App or Add to Home Screen'
            },
            {
                num: 4,
                title: 'Confirm Installation',
                desc: 'Tap "Install" or "Add" in the confirmation prompt. The app will be added to your home screen and app drawer.',
                icon: '✅',
                highlight: 'Tap Install'
            },
            {
                num: 5,
                title: 'Launch From Home Screen',
                desc: 'Find the Smarter.Poker icon on your home screen or app drawer. It opens in full-screen mode as a standalone app.',
                icon: '🚀',
                highlight: 'Full-screen app experience'
            }
        ]
    };

    const currentSteps = steps[tab];

    return (
        <>
            <SEOHead
                title="Install Smarter.Poker — iPad & Android App"
                description="Get Smarter.Poker on your iPad or Android device. Add to home screen for a native app experience — free, no app store required."
            />
            <div className="min-h-screen bg-gradient-to-br from-[#0a0a15] via-[#0f1029] to-[#0a0a15] text-white font-['Inter']">

                {/* Hero */}
                <div className="relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-b from-[#1877F2]/10 via-transparent to-transparent" />
                    <div className="relative container mx-auto px-4 pt-12 pb-8 text-center">
                        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#1877F2]/15 border border-[#1877F2]/30 text-[#1877F2] text-xs font-medium mb-6">
                            <Smartphone className="w-3.5 h-3.5" />
                            Free • No App Store Required
                        </div>
                        <h1 className="text-4xl md:text-5xl font-extrabold mb-4 bg-gradient-to-r from-white via-[#E4E6EB] to-[#B0B3B8] bg-clip-text text-transparent">
                            Get Smarter.Poker<br />On Your Device
                        </h1>
                        <p className="text-[#B0B3B8] text-lg max-w-md mx-auto mb-8">
                            Add Smarter.Poker to your home screen for a full-screen, native app experience — completely free.
                        </p>
                    </div>
                </div>

                {/* Platform Tabs */}
                <div className="container mx-auto px-4 max-w-2xl">
                    <div className="flex gap-2 mb-8">
                        <button
                            onClick={() => setTab('ipad')}
                            className={`flex-1 py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${tab === 'ipad'
                                ? 'bg-white text-black shadow-lg shadow-white/10'
                                : 'bg-[#242526] text-[#B0B3B8] border border-[#3A3B3C]'
                                }`}
                        >
                            <Tablet className="w-5 h-5" />
                            iPad / iPhone
                        </button>
                        <button
                            onClick={() => setTab('android')}
                            className={`flex-1 py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${tab === 'android'
                                ? 'bg-[#34A853] text-white shadow-lg shadow-[#34A853]/20'
                                : 'bg-[#242526] text-[#B0B3B8] border border-[#3A3B3C]'
                                }`}
                        >
                            <Smartphone className="w-5 h-5" />
                            Android
                        </button>
                    </div>

                    {/* Steps */}
                    <div className="space-y-4 mb-12">
                        {currentSteps.map((step, idx) => (
                            <div
                                key={step.num}
                                className="bg-[#242526]/80 backdrop-blur-sm border border-[#3A3B3C] rounded-2xl p-5 relative overflow-hidden group hover:border-[#1877F2]/40 transition-colors"
                            >
                                {/* Step number badge */}
                                <div className="absolute top-0 right-0 w-16 h-16">
                                    <div className="absolute top-2 right-2 w-8 h-8 rounded-full bg-[#1877F2]/15 flex items-center justify-center">
                                        <span className="text-[#1877F2] text-sm font-bold">{step.num}</span>
                                    </div>
                                </div>

                                <div className="flex gap-4">
                                    <div className="w-12 h-12 rounded-xl bg-[#3A3B3C]/50 flex items-center justify-center text-2xl shrink-0">
                                        {step.icon}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-white font-bold text-base mb-1">{step.title}</h3>
                                        <p className="text-[#B0B3B8] text-sm leading-relaxed mb-2">{step.desc}</p>
                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#1877F2]/10 border border-[#1877F2]/20 text-[#1877F2] text-xs font-medium">
                                            <CheckCircle2 className="w-3 h-3" />
                                            {step.highlight}
                                        </span>
                                    </div>
                                </div>

                                {/* Connector line */}
                                {idx < currentSteps.length - 1 && (
                                    <div className="absolute -bottom-4 left-10 w-0.5 h-4 bg-[#3A3B3C]" />
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Benefits */}
                    <div className="bg-gradient-to-br from-[#1877F2]/10 to-[#1877F2]/5 border border-[#1877F2]/20 rounded-2xl p-6 mb-8">
                        <h3 className="text-white font-bold text-lg mb-4 flex items-center gap-2">
                            <span className="text-lg">✨</span> What You Get
                        </h3>
                        <div className="grid grid-cols-2 gap-3">
                            {[
                                { icon: '🖥️', text: 'Full-Screen Experience' },
                                { icon: '⚡', text: 'Instant Launch' },
                                { icon: '🔔', text: 'Push Notifications' },
                                { icon: '💎', text: 'No App Store Needed' },
                                { icon: '🔄', text: 'Always Up To Date' },
                                { icon: '📱', text: 'Works Offline' },
                            ].map((b, i) => (
                                <div key={i} className="flex items-center gap-2 text-sm text-[#E4E6EB]">
                                    <span>{b.icon}</span> {b.text}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* CTA */}
                    <div className="text-center pb-16">
                        <Link href="/hub"
                            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-[#1877F2] text-white font-bold text-base hover:bg-[#1664d9] transition-colors shadow-lg shadow-[#1877F2]/20">
                            Open Smarter.Poker <ArrowRight className="w-5 h-5" />
                        </Link>
                        <p className="text-[#6A6B6D] text-xs mt-4">
                            Then follow the steps above to add it to your home screen
                        </p>
                    </div>
                </div>
            </div>
        </>
    );
}
