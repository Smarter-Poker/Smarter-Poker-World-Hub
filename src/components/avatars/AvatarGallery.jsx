/**
 * 🎨 AVATAR GALLERY
 * Interactive grid for selecting preset and custom avatars
 * VIP users see: 5 custom slots (at top) + VIP preset avatars
 * FREE users see: FREE preset avatars only
 */

import React, { useState, useEffect } from 'react';
import { useAvatar } from '../../contexts/AvatarContext';
import { getAvailableAvatars, getCustomAvatarGallery, deleteCustomAvatar } from '../../services/avatar-service';
import CustomAvatarBuilder from './CustomAvatarBuilder';
import toast from '../../stores/toastStore';
import SPImage from '../common/SPImage';

export default function AvatarGallery({ onSelect }) {
  const { user, avatar: currentAvatar, selectPresetAvatar, setActiveAvatar, isVip, createCustomAvatar } = useAvatar();

  // Custom avatars state
  const [customAvatars, setCustomAvatars] = useState([]);
  const [showCustomBuilder, setShowCustomBuilder] = useState(false);

  // Preset avatars state
  const [avatars, setAvatars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('All');

  useEffect(() => {
    async function loadAllAvatars() {
      try {
        setLoading(true);

        // Load custom avatars (VIP gets 5, FREE gets 1)
        if (user?.id) {
          try {
            const customs = await getCustomAvatarGallery(user.id);
            setCustomAvatars(customs || []);
          } catch (err) {
            console.warn('Error loading custom avatars:', err);
            setCustomAvatars([]);
          }
        }

        // Then load preset avatars
        await loadAvatars();
      } catch (error) {
        console.warn('Error in loadAllAvatars:', error);
      } finally {
        // BUGFIX: this used to run only when a user was logged in, so the
        // logged-out state showed "Loading Avatars..." forever.
        setLoading(false);
      }
    }

    loadAllAvatars();
  }, [user?.id, isVip]);



  async function loadAvatars() {
    try {
      // Load ALL avatars regardless of tier (to show VIP upsells).
      // The service computes isLocked correctly: FREE tier always unlocked,
      // VIP tier unlocked for VIP members or via an avatar_unlocks row.
      // BUGFIX: the old override here compared `a.tier !== 'free'` against the
      // library's uppercase 'FREE'/'VIP' tiers, which marked EVERY avatar
      // locked for non-VIP users — including all 25 free ones.
      const data = await getAvailableAvatars(user?.id || null, 'all', isVip);
      setAvatars(data);
    } catch (error) {
      console.warn('Error loading avatars:', error);
      setAvatars([]);
    }
  }

  async function handleSelectPresetAvatar(avatar) {
    if (avatar.isLocked) {
      toast.warning('Upgrade to VIP to unlock this premium avatar!');
      return;
    }

    const result = await selectPresetAvatar(avatar.id);
    if (result.success) {
      if (onSelect) onSelect(avatar.id);
      await loadAvatars(); // Refresh to show selection
    } else {
      toast.error(result.error);
    }
  }

  async function handleSelectCustomAvatar(customAvatar) {
    // Set the custom avatar as active
    const result = await setActiveAvatar(customAvatar.image_url, 'custom', null, customAvatar.prompt);
    if (result.success) {
      if (onSelect) onSelect(null);
      // Refresh custom avatars (free users have a custom slot too)
      if (user?.id) {
        const customs = await getCustomAvatarGallery(user.id);
        setCustomAvatars(customs || []);
      }
    } else {
      toast.error(result.error || 'Failed to set custom avatar');
    }
  }

  function handleCreateNewCustom() {
    const maxCustomSlots = isVip ? 5 : 1;
    // Check if at limit
    if (customAvatars.length >= maxCustomSlots) {
      if (isVip) {
        toast.warning('You have 5/5 custom avatars! Please delete one to create a new avatar.');
      } else {
        toast.warning('FREE users get 1 custom avatar. Upgrade to VIP for up to 5!');
      }
      return;
    }
    setShowCustomBuilder(true);
  }

  async function handleDeleteCustomAvatar(e, avatarId) {
    e.stopPropagation(); // Prevent selecting the avatar when clicking delete

    // Delete directly - no double confirmation needed

    try {
      const result = await deleteCustomAvatar(user.id, avatarId);

      if (result.success) {
        // Refresh the gallery
        const customs = await getCustomAvatarGallery(user.id);
        setCustomAvatars(customs || []);
      } else {
        toast.error(result.error || 'Failed to delete avatar');
      }
    } catch (err) {
      console.warn('Delete error:', err);
      toast.error('Failed to delete avatar');
    }
  }

  async function handleCloseBuilder() {
    setShowCustomBuilder(false);
    // Refresh custom avatars after creating (free users have a slot too)
    if (user?.id) {
      const customs = await getCustomAvatarGallery(user.id);
      setCustomAvatars(customs || []);
    }
  }

  // Create placeholder boxes for custom avatars (VIP = 5, FREE = 1)
  const maxCustomSlots = isVip ? 5 : 1;
  const customSlots = [];
  for (let i = 0; i < maxCustomSlots; i++) {
    customSlots.push(customAvatars[i] || null); // null = empty slot
  }

  return (
    <div className="avatar-gallery">
      <style>{`
        .avatar-gallery {
          width: 100%;
        }

        .gallery-section {
          margin-bottom: 50px;
        }

        .section-title {
          font-family: 'Orbitron', sans-serif;
          font-size: 24px;
          font-weight: 700;
          background: linear-gradient(135deg, #00f5ff, #0099ff);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          margin-bottom: 20px;
          text-align: center;
        }

        .section-subtitle {
          font-family: 'Rajdhani', sans-serif;
          font-size: 14px;
          color: #888;
          text-align: center;
          margin-bottom: 30px;
        }

        .avatar-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
          gap: 20px;
          margin-top: 30px;
        }

        .avatar-card {
          position: relative;
          aspect-ratio: 1;
          background: linear-gradient(145deg, rgba(10, 14, 39, 0.7), rgba(26, 31, 58, 0.8));
          border: 2px solid rgba(0, 245, 255, 0.2);
          border-radius: 16px;
          overflow: hidden;
          cursor: pointer;
          transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5), inset 0 2px 10px rgba(255, 255, 255, 0.05);
          display: flex;
          align-items: center;
          justify-content: center;
          transform: translateZ(0);
        }

        .avatar-card:hover {
          transform: translateY(-8px) scale(1.03);
          border-color: #00f5ff;
          box-shadow: 0 15px 35px rgba(0, 245, 255, 0.4), inset 0 2px 15px rgba(255, 255, 255, 0.15);
          z-index: 2;
        }

        .avatar-card.selected {
          border-color: #00ff00;
          box-shadow: 0 15px 35px rgba(0, 255, 0, 0.5), inset 0 0 20px rgba(0, 255, 0, 0.2);
          transform: translateY(-5px) scale(1.05);
          z-index: 2;
        }

        .avatar-card.placeholder {
          border-style: dashed;
          border-color: rgba(0, 245, 255, 0.3);
          background: rgba(10, 14, 39, 0.4);
          cursor: pointer;
        }

        .placeholder-content {
          text-align: center;
          color: #00f5ff;
          font-family: 'Rajdhani', sans-serif;
        }

        .placeholder-icon {
          font-size: 48px;
          margin-bottom: 10px;
        }

        .placeholder-text {
          font-size: 14px;
          font-weight: 600;
        }

        .avatar-image {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .avatar-info {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          background: linear-gradient(to top, rgba(0, 0, 0, 0.9), transparent);
          padding: 10px;
          transform: translateY(100%);
          transition: transform 0.3s ease;
        }

        .avatar-card:hover .avatar-info {
          transform: translateY(0);
        }

        .avatar-card:hover .equip-overlay {
          opacity: 1 !important;
        }

        .avatar-name {
          font-family: 'Rajdhani', sans-serif;
          font-size: 14px;
          font-weight: 600;
          color: #fff;
          margin: 0;
        }

        .avatar-tier {
          font-size: 11px;
          color: #00f5ff;
          text-transform: uppercase;
        }

        .tier-badge {
          position: absolute;
          top: 10px;
          right: 10px;
          padding: 4px 8px;
          background: rgba(255, 215, 0, 0.9);
          color: #000;
          font-family: 'Rajdhani', sans-serif;
          font-size: 11px;
          font-weight: 700;
          border-radius: 4px;
          text-transform: uppercase;
        }

        .tier-badge.free {
          background: rgba(0, 245, 255, 0.9);
        }

        .tier-badge.custom {
          background: linear-gradient(135deg, #ff00f5, #00f5ff);
        }

        .loading-state {
          text-align: center;
          padding: 60px 20px;
          color: #00f5ff;
          font-family: 'Rajdhani', sans-serif;
          font-size: 18px;
        }

        .builder-modal {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.95);
          z-index: 10000;
          overflow-y: auto;
          padding: 20px;
        }

        .builder-close {
          position: absolute;
          top: 20px;
          right: 20px;
          padding: 10px 20px;
          background: rgba(255, 68, 68, 0.2);
          border: 2px solid #ff4444;
          border-radius: 8px;
          color: #ff4444;
          font-family: 'Rajdhani', sans-serif;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          z-index: 10001;
        }

        .builder-close:hover {
          background: rgba(255, 68, 68, 0.4);
        }
      `}</style>

      {/* Custom Avatar Builder Modal */}
      {showCustomBuilder && (
        <div className="builder-modal">
          <button className="builder-close" onClick={handleCloseBuilder}>
            ✕ Close
          </button>
          <CustomAvatarBuilder isVip={isVip} onClose={handleCloseBuilder} />
        </div>
      )}

      {/* CUSTOM AVATARS SECTION (VIP=5, FREE=1) */}
      <div className="gallery-section">
        <h2 className="section-title">🎨 MY CUSTOM {isVip ? 'AVATARS' : 'AVATAR'}</h2>
        <p className="section-subtitle">
          {customAvatars.length}/{maxCustomSlots} slots used • Create up to {maxCustomSlots} unique AI-generated avatar{maxCustomSlots > 1 ? 's' : ''}
        </p>

        <div className="avatar-grid">
          {customSlots.map((customAvatar, index) => (
            customAvatar ? (
              <div
                key={customAvatar.id}
                className={`avatar-card ${currentAvatar?.type === 'custom' && currentAvatar?.imageUrl === customAvatar.image_url ? 'selected' : ''}`}
                onClick={() => handleSelectCustomAvatar(customAvatar)}
              >
                <SPImage
                  src={customAvatar.image_url}
                  alt={`Custom Avatar ${index + 1}`}
                  fill
                  style={{ objectFit: 'cover' }}
                />

                {/* DELETE BUTTON */}
                <button
                  onClick={(e) => handleDeleteCustomAvatar(e, customAvatar.id)}
                  style={{
                    position: 'absolute',
                    top: '8px',
                    left: '8px',
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    background: 'rgba(255, 68, 68, 0.9)',
                    border: '2px solid #fff',
                    color: '#fff',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                    zIndex: 10,
                    transition: 'all 0.2s ease',
                    opacity: isVip ? 1 : 0.5
                  }}
                  onMouseOver={(e) => e.currentTarget.style.background = '#ff0000'}
                  onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255, 68, 68, 0.9)'}
                  title={isVip ? "Delete This Avatar" : "Delete Avatar (Warning: Cannot create another one without VIP)"}
                >
                  ✕
                </button>

                <div className="avatar-info">
                  <p className="avatar-name">{customAvatar.prompt?.substring(0, 30) || 'Custom Avatar'}</p>
                  <p className="avatar-tier">AI Generated</p>
                </div>
              </div>
            ) : (
              <div
                key={`placeholder-${index}`}
                className="avatar-card placeholder"
                onClick={handleCreateNewCustom}
              >
                <div className="placeholder-content">
                  <div className="placeholder-icon">+</div>
                  <div className="placeholder-text">Create Custom</div>
                </div>
              </div>
            )
          ))}
        </div>

        {/* CREATE CUSTOM AVATAR BUTTON - ALWAYS visible for VIP */}
        <div style={{
          marginTop: '20px',
          textAlign: 'center',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
        }}>
          {/* Show active custom avatar thumbnail */}
          {customAvatars.length > 0 && customAvatars[0]?.image_url && (
            <div style={{
                position: 'relative', width: 48, height: 48, borderRadius: '50%', overflow: 'hidden',
                border: '2px solid #00f5ff',
                boxShadow: '0 0 12px rgba(0, 245, 255, 0.4)',
                flexShrink: 0
            }}>
              <SPImage
                src={customAvatars[0].image_url}
                alt="Active Custom Avatar"
                fill
                style={{ objectFit: 'cover' }}
              />
            </div>
          )}
          <button
            onClick={handleCreateNewCustom}
            style={{
              padding: '15px 40px',
              background: 'linear-gradient(135deg, #ff00f5, #00f5ff)',
              border: 'none',
              borderRadius: '12px',
              color: '#fff',
              fontFamily: "'Orbitron', sans-serif",
              fontSize: '16px',
              fontWeight: '700',
              cursor: 'pointer',
              textTransform: 'uppercase',
              boxShadow: '0 4px 20px rgba(255, 0, 245, 0.5)',
              transition: 'all 0.3s ease'
            }}
          >
            <img src="/images/jarvis-avatar.png" alt="Jarvis" style={{ width: 20, height: 20, borderRadius: '50%', marginRight: 8, verticalAlign: 'middle' }} />
            {isVip ? 'Create Custom Avatar' : 'Create Free AI Avatar'}
          </button>
        </div>
      </div>

      {/* PRESET AVATARS SECTION */}
      <div className="gallery-section">
        <h2 className="section-title">
          {isVip ? '💎 VIP AVATAR LIBRARY' : '⚡ AVATAR LIBRARY'}
        </h2>
        <p className="section-subtitle">
          {isVip
            ? `${avatars.length} avatars available`
            : `${avatars.filter(a => !a.isLocked).length} unlocked • ${avatars.filter(a => a.isLocked).length} VIP-only`}
        </p>

        {loading ? (
          <div className="loading-state">
            <div>⏳ Loading Avatars...</div>
          </div>
        ) : (
          <>
            {/* Category Filters */}
            <div style={{
              display: 'flex',
              gap: '10px',
              padding: '10px 0 20px 0',
              overflowX: 'auto',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              WebkitOverflowScrolling: 'touch',
              justifyContent: 'flex-start',
              flexWrap: 'nowrap'
            }}>
              {['All', ...new Set(avatars.map(a => a.category).filter(Boolean))].map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '20px',
                    background: activeCategory === cat ? 'rgba(0, 245, 255, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                    border: `1px solid ${activeCategory === cat ? '#00f5ff' : 'rgba(255, 255, 255, 0.1)'}`,
                    color: activeCategory === cat ? '#00f5ff' : '#888',
                    cursor: 'pointer',
                    fontFamily: "'Rajdhani', sans-serif",
                    fontWeight: 600,
                    fontSize: '14px',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.2s',
                    textTransform: 'uppercase'
                  }}
                  onMouseOver={(e) => {
                    if (activeCategory !== cat) {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                      e.currentTarget.style.color = '#fff';
                    }
                  }}
                  onMouseOut={(e) => {
                    if (activeCategory !== cat) {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                      e.currentTarget.style.color = '#888';
                    }
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="avatar-grid">
              {avatars
                .filter(av => activeCategory === 'All' || av.category === activeCategory)
                .map(av => {
                  const isSelected = currentAvatar?.id === av.id;
                  return (
                    <div
                      key={av.id}
                      className={`avatar-card ${isSelected ? 'selected' : ''}`}
                      onClick={() => handleSelectPresetAvatar(av)}
                      style={{ cursor: av.isLocked ? 'not-allowed' : 'pointer' }}
                    >
                      <SPImage
                        src={av.image}
                        alt={av.name}
                        fill
                        style={{ objectFit: 'cover' }}
                      />
                      <div className="avatar-info">
                        <p className="avatar-name">{av.name}</p>
                        <p className="avatar-tier">{av.category}</p>
                      </div>

                      {/* EQUIP OVERLAY */}
                      {!av.isLocked && (
                        <div style={{
                          position: 'absolute',
                          top: 0, left: 0, right: 0, bottom: 0,
                          background: 'rgba(0,0,0,0.5)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'opacity 0.2s ease',
                          opacity: isSelected ? 1 : 0
                        }}
                          className={`${isSelected ? '' : 'equip-overlay'}`}>
                          <div style={{
                            padding: '8px 20px',
                            background: isSelected ? 'rgba(0, 255, 0, 0.2)' : 'rgba(0, 245, 255, 0.2)',
                            border: `2px solid ${isSelected ? '#00ff00' : '#00f5ff'}`,
                            borderRadius: '20px',
                            color: isSelected ? '#00ff00' : '#00f5ff',
                            fontFamily: "'Rajdhani', sans-serif",
                            fontWeight: 'bold',
                            fontSize: '14px',
                            textTransform: 'uppercase',
                            boxShadow: `0 0 15px ${isSelected ? 'rgba(0,255,0,0.4)' : 'rgba(0,245,255,0.4)'}`,
                            transform: 'translateY(-10px)'
                          }}>
                            {isSelected ? '✓ Current' : 'Equip'}
                          </div>
                        </div>
                      )}

                      {/* VIP LOCK OVERLAY */}
                      {av.isLocked && (
                        <div style={{
                          position: 'absolute',
                          top: 0, left: 0, right: 0, bottom: 0,
                          background: 'rgba(0,0,0,0.6)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          zIndex: 5
                        }}>
                          <div style={{
                            padding: '10px 15px',
                            background: 'rgba(255, 215, 0, 0.1)',
                            border: '1px solid #FFD700',
                            borderRadius: '12px',
                            backdropFilter: 'blur(4px)',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '5px'
                          }}>
                            <span style={{ fontSize: '24px' }}>🔒</span>
                            <span style={{
                              color: '#FFD700',
                              fontFamily: "'Rajdhani', sans-serif",
                              fontWeight: 'bold',
                              fontSize: '12px',
                              textTransform: 'uppercase',
                              textShadow: '0 0 5px rgba(255, 215, 0, 0.5)'
                            }}>VIP ONLY</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
