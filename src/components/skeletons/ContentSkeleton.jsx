import React from 'react';
import { ShimmerBlock } from './ProfileSkeleton';

export default function ContentSkeleton({ type = 'posts' }) {
    if (type === 'posts') {
        return (
            <div>
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
        );
    }
    
    if (type === 'grid') {
        return (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2, marginTop: 16 }}>
                {[1, 2, 3, 4, 5, 6].map(i => (
                    <div key={i} style={{ aspectRatio: '1/1', background: '#e0e0e0' }}>
                        <ShimmerBlock width="100%" height="100%" radius={0} />
                    </div>
                ))}
            </div>
        );
    }
    
    return null;
}
