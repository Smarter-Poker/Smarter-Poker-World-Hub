/**
 * ProfileSkeleton — Shimmer loading skeleton for the profile page
 * ═══════════════════════════════════════════════════════════════════
 * Replaces the generic "Loading Profile..." spinner with a
 * Facebook-style shimmer that matches the profile page layout.
 * Includes the UniversalHeader for seamless navigation during load.
 */

import React from 'react';
import UniversalHeader from '../ui/UniversalHeader';

const shimmerKeyframes = `
@keyframes sp-shimmer {
  0% { background-position: -400px 0; }
  100% { background-position: 400px 0; }
}
`;

const shimmerStyle = {
    background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)',
    backgroundSize: '800px 100%',
    animation: 'sp-shimmer 1.5s infinite linear',
    borderRadius: 8,
};

export function ShimmerBlock({ width = '100%', height = 16, radius = 8, style = {} }) {
    return (
        <div style={{
            ...shimmerStyle,
            width,
            height,
            borderRadius: radius,
            ...style,
        }} />
    );
}

export default function ProfileSkeleton() {
    return (
        <div style={{ minHeight: '100vh', background: '#F0F2F5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif' }}>
            <style dangerouslySetInnerHTML={{ __html: shimmerKeyframes }} />

            {/* Header — persists during loading for seamless transition */}
            <UniversalHeader pageDepth={2} />

            {/* Cover Photo */}
            <ShimmerBlock width="100%" height={220} radius={0} style={{ borderRadius: '0 0 12px 12px' }} />

            {/* Profile Header */}
            <div style={{ padding: '0 16px', marginTop: -50, position: 'relative', zIndex: 10 }}>
                <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end' }}>
                    {/* Avatar */}
                    <ShimmerBlock width={120} height={120} radius={60} style={{ border: '4px solid white', flexShrink: 0 }} />
                    {/* Name & Stats */}
                    <div style={{ flex: 1, paddingBottom: 8 }}>
                        <ShimmerBlock width="60%" height={26} style={{ marginBottom: 8 }} />
                        <ShimmerBlock width="40%" height={14} />
                    </div>
                </div>

                {/* Intro Bar */}
                <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                    <ShimmerBlock width={100} height={14} />
                    <ShimmerBlock width={80} height={14} />
                    <ShimmerBlock width={120} height={14} />
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                    <ShimmerBlock width="50%" height={40} />
                    <ShimmerBlock width="50%" height={40} />
                </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 0, marginTop: 16, padding: '0 16px', borderBottom: '1px solid #DADDE1' }}>
                {['All', 'Poker', 'Photos', 'Videos', 'Reels'].map((_, i) => (
                    <ShimmerBlock key={i} width={70} height={36} radius={0} style={{ margin: '0 4px' }} />
                ))}
            </div>

            {/* Post Cards */}
            <div style={{ padding: 16 }}>
                {[1, 2].map(i => (
                    <div key={i} style={{ background: '#FFFFFF', borderRadius: 12, marginBottom: 16, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                            <ShimmerBlock width={40} height={40} radius={20} />
                            <div style={{ flex: 1 }}>
                                <ShimmerBlock width="50%" height={14} style={{ marginBottom: 6 }} />
                                <ShimmerBlock width="30%" height={12} />
                            </div>
                        </div>
                        <ShimmerBlock width="100%" height={14} style={{ marginBottom: 8 }} />
                        <ShimmerBlock width="80%" height={14} style={{ marginBottom: 12 }} />
                        <ShimmerBlock width="100%" height={200} />
                    </div>
                ))}
            </div>
        </div>
    );
}
