/**
 * 🎨 STANDALONE AVATAR SELECTION PAGE
 * No dependencies on contexts or other pages
 * Self-contained and independent
 */

import { useState, useEffect } from 'react';
import Head from 'next/head';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { getAll, getByTier } from '../../src/data/AVATAR_LIBRARY';

// God-Mode Stack
import { useAvatarsStandaloneStore } from '../../src/stores/avatarsStandaloneStore';

export default function AvatarsStandalone() {
    const [avatars, setAvatars] = useState([]);
    const [selectedAvatar, setSelectedAvatar] = useState(null);

    useEffect(() => {
        // Load ALL avatars (75 total: FREE + VIP)
        const allAvatars = getAll();
        setAvatars(allAvatars);
    }, []);

    function handleSelectAvatar(avatar) {
        setSelectedAvatar(avatar);
        console.log('Selected avatar:', avatar);
    }

    return (
        <>
            <Head>
                <title>Avatar Selection | Smarter Poker</title>
            </Head>

            <div style={{
                minHeight: '100vh',
                background: 'linear-gradient(135deg, #0a0e27 0%, #1a1f3a 50%, #0d0d2e 100%)',
                padding: '40px 20px',
                color: '#fff',
                fontFamily: 'Inter, sans-serif'
            }}>
                <div style={{
                    maxWidth: '1200px',
                    margin: '0 auto'
                }}>
                    <h1 style={{
                        fontSize: '36px',
                        fontWeight: '700',
                        marginBottom: '10px',
                        textAlign: 'center',
                        background: 'linear-gradient(135deg, #00f5ff, #ff00f5)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent'
                    }}>
                        Choose Your Avatar
                    </h1>

                    <p style={{
                        textAlign: 'center',
                        color: '#888',
                        marginBottom: '40px'
                    }}>
                        {avatars.length} avatars available
                    </p>

                    {selectedAvatar && (
                        <div style={{
                            textAlign: 'center',
                            marginBottom: '30px',
                            padding: '20px',
                            background: 'rgba(0, 245, 255, 0.1)',
                            borderRadius: '12px',
                            border: '1px solid rgba(0, 245, 255, 0.3)'
                        }}>
                            <p style={{ fontSize: '14px', color: '#00f5ff', marginBottom: '10px' }}>
                                ✓ Selected: {selectedAvatar.name}
                            </p>
                            <img
                                src={selectedAvatar.image}
                                alt={selectedAvatar.name}
                                style={{
                                    width: '80px',
                                    height: '80px',
                                    borderRadius: '50%',
                                    border: '3px solid #00f5ff'
                                }}
                            />
                        </div>
                    )}

                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                        gap: '20px'
                    }}>
                        {avatars.map((avatar) => (
                            <div
                                key={avatar.id}
                                onClick={() => handleSelectAvatar(avatar)}
                                style={{
                                    background: selectedAvatar?.id === avatar.id
                                        ? 'rgba(0, 245, 255, 0.2)'
                                        : 'rgba(0, 0, 0, 0.4)',
                                    borderRadius: '12px',
                                    padding: '15px',
                                    cursor: 'pointer',
                                    border: selectedAvatar?.id === avatar.id
                                        ? '2px solid #00f5ff'
                                        : '1px solid rgba(255, 255, 255, 0.1)',
                                    transition: 'all 0.3s ease',
                                    textAlign: 'center'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.transform = 'translateY(-5px)';
                                    e.currentTarget.style.boxShadow = '0 10px 30px rgba(0, 245, 255, 0.3)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = 'translateY(0)';
                                    e.currentTarget.style.boxShadow = 'none';
                                }}
                            >
                                <img
                                    src={avatar.image}
                                    alt={avatar.name}
                                    style={{
                                        width: '100%',
                                        aspectRatio: '1',
                                        borderRadius: '8px',
                                        marginBottom: '10px',
                                        objectFit: 'cover'
                                    }}
                                />
                                <div style={{
                                    fontSize: '14px',
                                    fontWeight: '600',
                                    color: '#fff'
                                }}>
                                    {avatar.name}
                                </div>
                                <div style={{
                                    fontSize: '11px',
                                    color: '#888',
                                    marginTop: '5px'
                                }}>
                                    {avatar.tier}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </>
    );
}
