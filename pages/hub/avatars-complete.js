/**
 * 🎨 COMPLETE AVATAR SELECTION PAGE
 * Fully functional with database, custom avatar creation, and all features
 * Self-contained but database-connected
 */

import { useState, useEffect } from 'react';
import Head from 'next/head';
import { createClient } from '@supabase/supabase-js';
import { getAll } from '../../src/data/AVATAR_LIBRARY';
import CustomAvatarBuilder from '../../src/components/avatars/CustomAvatarBuilder';

// Initialize Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MzA4NDQsImV4cCI6MjA4MzMwNjg0NH0.ZGFrUYq7yAbkveFdudh4q_Xk0qN0AZ-jnu4FkX9YKjo';
const supabase = createClient(supabaseUrl, supabaseKey);

export default function AvatarsComplete() {
    const [user, setUser] = useState(null);
    const [isVip, setIsVip] = useState(false);
    const [avatars, setAvatars] = useState([]);
    const [customAvatars, setCustomAvatars] = useState([]);
    const [selectedAvatar, setSelectedAvatar] = useState(null);
    const [showBuilder, setShowBuilder] = useState(false);
    const [loading, setLoading] = useState(true);

    // Load user and avatars
    useEffect(() => {
        loadUser();
        loadAvatars();
    }, []);

    async function loadUser() {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            setUser(user);

            if (user) {
                // Check VIP status from user metadata
                setIsVip(user.user_metadata?.is_vip || false);

                // Load custom avatars
                await loadCustomAvatars(user.id);
            }
        } catch (error) {
            console.error('Error loading user:', error);
        } finally {
            setLoading(false);
        }
    }

    async function loadAvatars() {
        // Load all 75 preset avatars from static library
        const allAvatars = getAll();
        setAvatars(allAvatars);
    }

    async function loadCustomAvatars(userId) {
        if (!userId) return;

        try {
            const { data, error } = await supabase
                .from('custom_avatar_gallery')
                .select('*')
                .eq('user_id', userId)
                .eq('is_deleted', false)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setCustomAvatars(data || []);
        } catch (error) {
            console.error('Error loading custom avatars:', error);
            setCustomAvatars([]);
        }
    }

    async function handleSelectPresetAvatar(avatar) {
        setSelectedAvatar(avatar);

        if (!user) {
            alert('Please sign in to save your avatar selection');
            return;
        }

        try {
            // Save to database
            const { error } = await supabase.rpc('set_active_avatar', {
                p_user_id: user.id,
                p_avatar_type: 'preset',
                p_preset_avatar_id: avatar.id
            });

            if (error) throw error;

            console.log('Avatar saved:', avatar.name);
        } catch (error) {
            console.error('Error saving avatar:', error);
            alert('Failed to save avatar');
        }
    }

    async function handleSelectCustomAvatar(customAvatar) {
        setSelectedAvatar(customAvatar);

        if (!user) return;

        try {
            const { error } = await supabase.rpc('set_active_avatar', {
                p_user_id: user.id,
                p_avatar_type: 'custom',
                p_custom_image_url: customAvatar.image_url,
                p_custom_prompt: customAvatar.prompt
            });

            if (error) throw error;
        } catch (error) {
            console.error('Error saving custom avatar:', error);
        }
    }

    async function handleDeleteCustomAvatar(avatarId) {
        if (!user) return;

        try {
            const { error } = await supabase
                .from('custom_avatar_gallery')
                .update({ is_deleted: true })
                .eq('id', avatarId)
                .eq('user_id', user.id);

            if (error) throw error;

            // Refresh custom avatars
            await loadCustomAvatars(user.id);
        } catch (error) {
            console.error('Error deleting avatar:', error);
            alert('Failed to delete avatar');
        }
    }

    function handleCreateCustom() {
        if (!user) {
            alert('Please sign in to create custom avatars');
            return;
        }

        if (!isVip && customAvatars.length >= 1) {
            alert('FREE users can create 1 custom avatar. Upgrade to VIP for 5 slots!');
            return;
        }

        if (isVip && customAvatars.length >= 5) {
            alert('⚠️ You have 5/5 custom avatars! Please delete one to create a new avatar.');
            return;
        }

        setShowBuilder(true);
    }

    function handleCloseBuilder() {
        setShowBuilder(false);
        // Refresh custom avatars after creation
        if (user) {
            loadCustomAvatars(user.id);
        }
    }

    if (loading) {
        return (
            <div style={{
                minHeight: '100vh',
                background: '#0a0e27',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#00f5ff',
                fontSize: '18px'
            }}>
                Loading avatars...
            </div>
        );
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
                    maxWidth: '1400px',
                    margin: '0 auto'
                }}>
                    {/* Header */}
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
                        marginBottom: '20px'
                    }}>
                        {user ? `Welcome, ${user.email}` : 'Sign in to save avatars'}
                        {isVip && <span style={{ color: '#FFD700', marginLeft: '10px' }}>💎 VIP</span>}
                    </p>

                    {/* Login/Logout Button */}
                    <div style={{
                        textAlign: 'center',
                        marginBottom: '40px'
                    }}>
                        {!user ? (
                            <button
                                onClick={() => window.location.href = '/intro'}
                                style={{
                                    padding: '12px 32px',
                                    background: 'linear-gradient(135deg, #00f5ff, #0080ff)',
                                    border: 'none',
                                    borderRadius: '8px',
                                    color: '#fff',
                                    fontSize: '16px',
                                    fontWeight: '600',
                                    cursor: 'pointer',
                                    boxShadow: '0 4px 15px rgba(0, 245, 255, 0.4)',
                                    transition: 'all 0.3s ease'
                                }}>
                                🔐 Sign In / Sign Up
                            </button>
                        ) : (
                            <button
                                onClick={async () => {
                                    await supabase.auth.signOut();
                                    setUser(null);
                                    setIsVip(false);
                                    setCustomAvatars([]);
                                }}
                                style={{
                                    padding: '10px 24px',
                                    background: 'rgba(255, 255, 255, 0.1)',
                                    border: '1px solid rgba(255, 255, 255, 0.2)',
                                    borderRadius: '8px',
                                    color: '#fff',
                                    fontSize: '14px',
                                    cursor: 'pointer',
                                    transition: 'all 0.3s ease'
                                }}>
                                🚪 Logout
                            </button>
                        )}
                    </div>

                    {/* Custom Avatars Section */}
                    {user && (
                        <div style={{ marginBottom: '60px' }}>
                            <h2 style={{
                                fontSize: '28px',
                                color: '#00f5ff',
                                marginBottom: '15px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px'
                            }}>
                                🤖 MY CUSTOM AVATARS
                            </h2>

                            <p style={{ color: '#888', marginBottom: '25px', fontSize: '15px' }}>
                                {customAvatars.length}/{isVip ? '5' : '1'} slots used •
                                {isVip ? ' Create up to 5 unique AI-generated avatars' : ' FREE users get 1 custom avatar'}
                            </p>

                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                                gap: '20px',
                                marginBottom: '25px'
                            }}>
                                {/* Filled Slots */}
                                {customAvatars.map((custom) => (
                                    <div key={custom.id} style={{
                                        position: 'relative',
                                        background: selectedAvatar?.id === custom.id
                                            ? 'rgba(0, 245, 255, 0.3)'
                                            : 'rgba(0, 0, 0, 0.4)',
                                        borderRadius: '12px',
                                        padding: '15px',
                                        border: selectedAvatar?.id === custom.id
                                            ? '3px solid #00f5ff'
                                            : '1px solid rgba(255, 255, 255, 0.2)',
                                        cursor: 'pointer',
                                        transition: 'all 0.3s ease'
                                    }}
                                        onClick={() => handleSelectCustomAvatar(custom)}>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteCustomAvatar(custom.id);
                                            }}
                                            style={{
                                                position: 'absolute',
                                                top: '8px',
                                                right: '8px',
                                                background: 'rgba(255, 68, 68, 0.9)',
                                                border: 'none',
                                                borderRadius: '50%',
                                                width: '28px',
                                                height: '28px',
                                                color: '#000',
                                                fontWeight: '700',
                                                cursor: 'pointer',
                                                fontSize: '16px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                zIndex: 10
                                            }}>
                                            ✕
                                        </button>
                                        <img
                                            src={custom.image_url}
                                            alt="Custom Avatar"
                                            style={{
                                                width: '100%',
                                                aspectRatio: '1',
                                                borderRadius: '8px',
                                                marginBottom: '10px',
                                                objectFit: 'cover'
                                            }}
                                        />
                                        <div style={{
                                            fontSize: '13px',
                                            color: '#888',
                                            textAlign: 'center',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis'
                                        }}>
                                            {custom.prompt?.substring(0, 20) || 'Custom'}
                                        </div>
                                    </div>
                                ))}

                                {/* Empty Slots */}
                                {[...Array(Math.max(0, (isVip ? 5 : 1) - customAvatars.length))].map((_, i) => (
                                    <div key={`empty-${i}`} style={{
                                        background: 'rgba(0, 0, 0, 0.3)',
                                        borderRadius: '12px',
                                        padding: '15px',
                                        border: '2px dashed rgba(255, 255, 255, 0.2)',
                                        aspectRatio: '1',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: '#555',
                                        fontSize: '14px',
                                        textAlign: 'center'
                                    }}>
                                        Empty Slot
                                    </div>
                                ))}
                            </div>

                            <div style={{ textAlign: 'center' }}>
                                <button
                                    onClick={handleCreateCustom}
                                    style={{
                                        padding: '16px 45px',
                                        background: 'linear-gradient(135deg, #ff00f5, #00f5ff)',
                                        border: 'none',
                                        borderRadius: '12px',
                                        color: '#fff',
                                        fontFamily: 'Orbitron, sans-serif',
                                        fontSize: '17px',
                                        fontWeight: '700',
                                        cursor: 'pointer',
                                        textTransform: 'uppercase',
                                        boxShadow: '0 4px 20px rgba(255, 0, 245, 0.5)',
                                        transition: 'all 0.3s ease'
                                    }}>
                                    🤖 Create Custom Avatar
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Preset Avatar Library */}
                    <div>
                        <h2 style={{
                            fontSize: '28px',
                            color: '#fff',
                            marginBottom: '15px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px'
                        }}>
                            💎 AVATAR LIBRARY
                        </h2>
                        <p style={{ color: '#888', marginBottom: '25px', fontSize: '15px' }}>
                            {avatars.length} avatars available
                        </p>

                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                            gap: '20px'
                        }}>
                            {avatars.map((avatar) => (
                                <div
                                    key={avatar.id}
                                    onClick={() => handleSelectPresetAvatar(avatar)}
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
                                    }}>
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
            </div>

            {/* Custom Avatar Builder Modal */}
            {
                showBuilder && (
                    <div style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'rgba(0, 0, 0, 0.95)',
                        zIndex: 1000,
                        overflow: 'auto',
                        padding: '40px 20px'
                    }}>
                        <button
                            onClick={handleCloseBuilder}
                            style={{
                                position: 'fixed',
                                top: '20px',
                                right: '20px',
                                background: 'rgba(255, 255, 255, 0.2)',
                                border: 'none',
                                borderRadius: '8px',
                                padding: '12px 24px',
                                color: '#fff',
                                fontSize: '16px',
                                cursor: 'pointer',
                                zIndex: 1001
                            }}>
                            ✕ Close
                        </button>
                        <CustomAvatarBuilder isVip={isVip} onClose={handleCloseBuilder} />
                    </div>
                )
            }
        </>
    );
}
