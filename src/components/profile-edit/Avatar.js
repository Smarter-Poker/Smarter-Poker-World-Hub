import { useRef } from 'react';
import { C } from './constants';

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

export default Avatar;
