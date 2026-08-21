import React from 'react';
import { ShimmerBlock } from './ProfileSkeleton';

export default function PokerSkeleton() {
    return (
        <div>
            {/* Badges Skeleton */}
            <div style={{ background: '#FFFFFF', borderRadius: 12, padding: 16, marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                <ShimmerBlock width={120} height={20} style={{ marginBottom: 16 }} />
                <div style={{ display: 'flex', gap: 12, overflowX: 'hidden' }}>
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                            <ShimmerBlock width={60} height={60} radius={30} />
                            <ShimmerBlock width={50} height={12} />
                        </div>
                    ))}
                </div>
            </div>
            
            {/* Stats Grid Skeleton */}
            <div style={{ background: '#FFFFFF', borderRadius: 12, padding: 16, marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                <ShimmerBlock width={120} height={20} style={{ marginBottom: 16 }} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} style={{ padding: 12, background: '#f5f6f7', borderRadius: 8 }}>
                            <ShimmerBlock width={40} height={24} style={{ marginBottom: 8 }} />
                            <ShimmerBlock width={80} height={14} />
                        </div>
                    ))}
                </div>
            </div>
            
            {/* Heatmap Skeleton */}
            <div style={{ background: '#FFFFFF', borderRadius: 12, padding: 16, marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                <ShimmerBlock width={120} height={20} style={{ marginBottom: 16 }} />
                <ShimmerBlock width="100%" height={150} radius={8} />
            </div>
        </div>
    );
}
