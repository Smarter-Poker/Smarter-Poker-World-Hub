/**
 * 🎨 AVATAR GALLERY
 * Interactive grid for selecting preset and custom avatars
 * VIP users see: 5 custom slots (at top) + VIP preset avatars
 * FREE users see: FREE preset avatars only
 */

import React, { useState, useEffect } from 'react';
import { useAvatar } from '../../contexts/AvatarContext';
import { getAvailableAvatars, getCustomAvatarGallery } from '../../services/avatar-service';
import CustomAvatarBuilder from './CustomAvatarBuilder';

export default function AvatarGallery({ onSelect }) {
  const { user, avatar: currentAvatar, selectPresetAvatar, setActiveAvatar, isVip, createCustomAvatar } = useAvatar();

  // Custom avatars state
  const [customAvatars, setCustomAvatars] = useState([]);
  const [showCustomBuilder, setShowCustomBuilder] = useState(false);

  // Preset avatars state
  const [avatars, setAvatars] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadAllAvatars() {
      try {
        setLoading(true);

        // Load custom avatars first if VIP
        if (user?.id && isVip) {
          try {
            const customs = await getCustomAvatarGallery(user.id);
            setCustomAvatars(customs || []);
          } catch (err) {
            console.error('Error loading custom avatars:', err);
            setCustomAvatars([]);
          }
        }

        // Then load preset avatars
        await loadAvatars();
      } catch (error) {
        console.error('Error in loadAllAvatars:', error);
      } finally {
        setLoading(false);
      }
    }

    if (user) {
      loadAllAvatars();
    }
  }, [user?.id, isVip]);



  async function loadAvatars() {
    try {
      // VIP users: show ONLY VIP avatars
      // FREE users: show ONLY FREE avatars
      const tierFilter = isVip ? 'vip' : 'free';
      const data = await getAvailableAvatars(user?.id || null, tierFilter);

      // All avatars are unlocked for their respective tiers
      setAvatars(data.map(a => ({ ...a, isLocked: false })));
    } catch (error) {
      console.error('Error loading avatars:', error);
      setAvatars([]);
    }
  }

  async function handleSelectPresetAvatar(avatarId) {
    const result = await selectPresetAvatar(avatarId);
    if (result.success) {
      if (onSelect) onSelect(avatarId);
      await loadAvatars(); // Refresh to show selection
    } else {
      alert(result.error);
    }
  }

  async function handleSelectCustomAvatar(customAvatar) {
    // Set the custom avatar as active
    const result = await setActiveAvatar(customAvatar.image_url, 'custom', null, customAvatar.prompt);
    if (result.success) {
      if (onSelect) onSelect(null);
      // Refresh custom avatars
      if (user?.id && isVip) {
        const customs = await getCustomAvatarGallery(user.id);
        setCustomAvatars(customs || []);
      }
    } else {
      alert(result.error || 'Failed to set custom avatar');
    }
  }

  function handleCreateNewCustom() {
    setShowCustomBuilder(true);
  }

  async function handleDeleteCustomAvatar(e, avatarId) {
    e.stopPropagation(); // Prevent selecting the avatar when clicking delete

    if (!confirm('Delete this custom avatar? This action cannot be undone.')) {
      return;
    }

    try {
      const { deleteCustomAvatar } = await import('../../services/avatar-service');
      const result = await deleteCustomAvatar(user.id, avatarId);

      if (result.success) {
        // Refresh the gallery
        const customs = await getCustomAvatarGallery(user.id);
        setCustomAvatars(customs || []);
      } else {
        alert(result.error || 'Failed to delete avatar');
      }
    } catch (err) {
      console.error('Delete error:', err);
      alert('Failed to delete avatar');
    }
  }

  async function handleCloseBuilder() {
    setShowCustomBuilder(false);
    // Refresh custom avatars after creating
    if (user?.id && isVip) {
      const customs = await getCustomAvatarGallery(user.id);
      setCustomAvatars(customs || []);
    }
  }

  // Create placeholder boxes for custom avatars (5 total for VIP)
  const maxCustomSlots = 5;
  const customSlots = [];
  for (let i = 0; i < maxCustomSlots; i++) {
    customSlots.push(customAvatars[i] || null); // null = empty slot
  }

  return (
    <div className="avatar-gallery">
      <style jsx>{`
        .avatar-gallery {
          width: 100%;
          max-width: 1200px;
          margin: 0 auto;
          padding: 20px;
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
          background: rgba(10, 14, 39, 0.6);
          border: 2px solid rgba(0, 245, 255, 0.2);
          border-radius: 16px;
          overflow: hidden;
          cursor: pointer;
          transition: all 0.3s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .avatar-card:hover {
          transform: translateY(-5px);
          border-color: #00f5ff;
          box-shadow: 0 10px 30px rgba(0, 245, 255, 0.3);
        }

        .avatar-card.selected {
          border-color: #00ff00;
          box-shadow: 0 10px 30px rgba(0, 255, 0, 0.5);
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
          <CustomAvatarBuilder isVip={isVip} />
        </div>
      )}

      {/* CUSTOM AVATARS SECTION (VIP ONLY) */}
      {isVip && (
        <div className="gallery-section">
          <h2 className="section-title">🎨 MY CUSTOM AVATARS</h2>
          <p className="section-subtitle">
            {customAvatars.length}/5 slots used • Create up to 5 unique AI-generated avatars
          </p>

          <div className="avatar-grid">
            {customSlots.map((customAvatar, index) => (
              customAvatar ? (
                <div
                  key={customAvatar.id}
                  className={`avatar-card ${currentAvatar?.type === 'custom' && currentAvatar?.imageUrl === customAvatar.image_url ? 'selected' : ''}`}
                  onClick={() => handleSelectCustomAvatar(customAvatar)}
                >
                  <img
                    src={customAvatar.image_url}
                    alt={`Custom Avatar ${index + 1}`}
                    className="avatar-image"
                  />
                  <span className="tier-badge custom">CUSTOM</span>

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
                      transition: 'all 0.2s ease'
                    }}
                    onMouseOver={(e) => e.target.style.background = '#ff0000'}
                    onMouseOut={(e) => e.target.style.background = 'rgba(255, 68, 68, 0.9)'}
                    title="Delete this avatar"
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

          {/* CREATE CUSTOM AVATAR BUTTON - Always visible for VIP */}
          <div style={{
            marginTop: '20px',
            textAlign: 'center'
          }}>
            {customAvatars.length < 5 ? (
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
                🤖 Create Custom Avatar
              </button>
            ) : (
              <div style={{
                padding: '15px 30px',
                background: 'rgba(255, 140, 0, 0.15)',
                border: '1px solid rgba(255, 140, 0, 0.4)',
                borderRadius: '12px',
                color: '#ff8c00',
                fontFamily: "'Rajdhani', sans-serif",
                fontSize: '14px',
                display: 'inline-block'
              }}>
                ⚠️ All 5 slots filled! Delete an existing avatar to create a new one.
              </div>
            )}
          </div>
        </div>
      )}

      {/* PRESET AVATARS SECTION */}
      <div className="gallery-section">
        <h2 className="section-title">
          {isVip ? '💎 VIP AVATAR LIBRARY' : '⚡ FREE AVATAR LIBRARY'}
        </h2>
        <p className="section-subtitle">
          {avatars.length} {isVip ? 'VIP' : 'FREE'} avatars available
        </p>

        {loading ? (
          <div className="loading-state">
            <div>⏳ Loading Avatars...</div>
          </div>
        ) : (
          <div className="avatar-grid">
            {avatars.map(av => (
              <div
                key={av.id}
                className={`avatar-card ${currentAvatar?.id === av.id ? 'selected' : ''}`}
                onClick={() => handleSelectPresetAvatar(av.id)}
              >
                <img
                  src={av.image}
                  alt={av.name}
                  className="avatar-image"
                />
                <div className="avatar-info">
                  <p className="avatar-name">{av.name}</p>
                  <p className="avatar-tier">{av.category}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
