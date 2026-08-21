/**
 * AVATAR GALLERY
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
        .create-custom-btn {
          padding: 15px 40px;
          background: linear-gradient(145deg, #2c3545 0%, #161b22 100%);
          border: 2px solid #00f5ff;
          border-radius: 12px;
          color: #00f5ff;
          font-family: 'Rajdhani', sans-serif;
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
          text-transform: uppercase;
          box-shadow: inset 0 2px 4px rgba(255, 255, 255, 0.1), 0 4px 15px rgba(0, 0, 0, 0.6), 0 0 10px rgba(0, 245, 255, 0.4);
          transition: all 0.3s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .create-custom-btn:hover {
          background: linear-gradient(145deg, #364152 0%, #1e242d 100%);
          box-shadow: inset 0 2px 4px rgba(255, 255, 255, 0.2), 0 6px 20px rgba(0, 0, 0, 0.8), 0 0 20px rgba(0, 245, 255, 0.6);
          transform: translateY(-2px);
          color: #fff;
        }

        .glow-spinner {
          width: 50px;
          height: 50px;
          border: 3px solid rgba(0, 245, 255, 0.1);
          border-top: 3px solid #00f5ff;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .avatar-gallery {
          width: 100%;
        }

        .gallery-section {
          margin-bottom: 50px;
        }

        .section-title {
          font-family: 'Rajdhani', sans-serif;
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
          background: linear-gradient(135deg, #1c2229 0%, #101419 100%);
          border: 3px solid #8a929a;
          border-radius: 12px;
          overflow: hidden;
          cursor: pointer;
          transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
          box-shadow: 
            inset 0 2px 4px rgba(255, 255, 255, 0.2), 
            inset 0 -2px 4px rgba(0, 0, 0, 0.5),
            0 8px 20px rgba(0, 0, 0, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          transform: translateZ(0);
        }
        
        .avatar-card::before, .avatar-card::after {
          content: '';
          position: absolute;
          width: 6px;
          height: 6px;
          background: #4a525a;
          border-radius: 50%;
          box-shadow: inset 0 1px 1px rgba(0,0,0,0.8), 0 1px 1px rgba(255,255,255,0.4);
          z-index: 10;
        }
        
        .avatar-card::before {
          top: 6px; left: 6px;
          box-shadow: inset 0 1px 1px rgba(0,0,0,0.8), 0 1px 1px rgba(255,255,255,0.4), 0 0 0 0 transparent;
        }
        .avatar-card::after {
          bottom: 6px; right: 6px;
          box-shadow: inset 0 1px 1px rgba(0,0,0,0.8), 0 1px 1px rgba(255,255,255,0.4), 0 0 0 0 transparent;
        }

        /* Using a child element for the other two screws since pseudo-elements are limited to 2 */
        .screws {
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 10;
        }
        .screws::before, .screws::after {
          content: '';
          position: absolute;
          width: 6px;
          height: 6px;
          background: #4a525a;
          border-radius: 50%;
          box-shadow: inset 0 1px 1px rgba(0,0,0,0.8), 0 1px 1px rgba(255,255,255,0.4);
        }
        .screws::before { top: 6px; right: 6px; }
        .screws::after { bottom: 6px; left: 6px; }

        .avatar-card:hover {
          transform: translateY(-8px) scale(1.03);
          border-color: #00f5ff;
          box-shadow: 
            inset 0 2px 4px rgba(255, 255, 255, 0.2), 
            inset 0 -2px 4px rgba(0, 0, 0, 0.5),
            0 15px 35px rgba(0, 245, 255, 0.4);
          z-index: 2;
        }

        .avatar-card.selected {
          border-color: #00ff00;
          box-shadow: 
            inset 0 2px 4px rgba(255, 255, 255, 0.2), 
            inset 0 -2px 4px rgba(0, 0, 0, 0.5),
            0 15px 35px rgba(0, 255, 0, 0.5), 
            inset 0 0 20px rgba(0, 255, 0, 0.2);
          transform: translateY(-5px) scale(1.05);
          z-index: 2;
        }

        .avatar-card.placeholder {
          border: 3px solid #8a929a;
          background: linear-gradient(135deg, #1c2229 0%, #101419 100%);
          cursor: pointer;
          opacity: 0.8;
        }
        .avatar-card.placeholder:hover {
          opacity: 1;
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
              .category-btn {
          padding: 8px 20px;
          border-radius: 20px;
          background: linear-gradient(145deg, #1c2229 0%, #101419 100%);
          border: 1px solid #4a525a;
          color: #888;
          cursor: pointer;
          font-family: 'Rajdhani', sans-serif;
          font-weight: 600;
          font-size: 14px;
          white-space: nowrap;
          transition: all 0.3s ease;
          text-transform: uppercase;
          box-shadow: inset 0 2px 4px rgba(255, 255, 255, 0.05), 0 2px 8px rgba(0, 0, 0, 0.5);
        }
        .category-btn:hover {
          color: #fff;
          border-color: #8a929a;
          transform: translateY(-1px);
        }
        .category-btn.active {
          background: linear-gradient(145deg, #161b22 0%, #0d1116 100%);
          border-color: #00f5ff;
          color: #00f5ff;
          box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.5), 0 0 10px rgba(0, 245, 255, 0.3);
        }

              .delete-avatar-btn {
          position: absolute;
          top: 10px; left: 10px;
          width: 32px; height: 32px;
          border-radius: 50%;
          background: linear-gradient(145deg, #2c1111 0%, #160808 100%);
          border: 2px solid #ff4444;
          color: #ff4444;
          font-family: 'Rajdhani', sans-serif;
          font-size: 16px;
          font-weight: bold;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: inset 0 2px 4px rgba(255, 68, 68, 0.2), 0 2px 8px rgba(0,0,0,0.8);
          z-index: 10;
          transition: all 0.3s ease;
        }
        .delete-avatar-btn:hover {
          background: #ff4444;
          color: #fff;
          box-shadow: 0 0 10px rgba(255, 68, 68, 0.8);
          transform: scale(1.1);
        }
        .delete-avatar-btn.free-tier {
          opacity: 0.5;
        }
        .delete-avatar-btn.free-tier:hover {
          opacity: 1;
        }

      `}</style>

      {/* Custom Avatar Builder Modal */}
      {showCustomBuilder && (
        <div className="builder-modal">
          <button className="builder-close" onClick={handleCloseBuilder}>
            CLOSE
          </button>
          <CustomAvatarBuilder isVip={isVip} onClose={handleCloseBuilder} />
        </div>
      )}

      {/* CUSTOM AVATARS SECTION (VIP=5, FREE=1) */}
      <div className="gallery-section">
        <h2 className="section-title">MY CUSTOM {isVip ? 'AVATARS' : 'AVATAR'}</h2>
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
                <div className="screws"></div>
                <SPImage
                  src={customAvatar.image_url}
                  alt={`Custom Avatar ${index + 1}`}
                  fill
                  style={{ objectFit: 'cover' }}
                />

                {/* DELETE BUTTON */}
                <button
                  onClick={(e) => handleDeleteCustomAvatar(e, customAvatar.id)}
                  className={`delete-avatar-btn ${!isVip ? 'free-tier' : ''}`}
                  title={isVip ? "Delete This Avatar" : "Delete Avatar (Warning: Cannot create another one without VIP)"}
                >
                  X
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
                <div className="screws"></div>
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
              <div className="screws"></div>
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
            className="create-custom-btn"
          >
            <img src="/images/jarvis-avatar.png" alt="Jarvis" style={{ width: 20, height: 20, borderRadius: '50%', marginRight: 8, verticalAlign: 'middle' }} />
            {isVip ? 'Create Custom Avatar' : 'Create Free AI Avatar'}
          </button>
        </div>
      </div>

      {/* PRESET AVATARS SECTION */}
      <div className="gallery-section">
        <h2 className="section-title">
          {isVip ? 'VIP AVATAR LIBRARY' : 'AVATAR LIBRARY'}
        </h2>
        <p className="section-subtitle">
          {isVip
            ? `${avatars.length} avatars available`
            : `${avatars.filter(a => !a.isLocked).length} unlocked • ${avatars.filter(a => a.isLocked).length} VIP-only`}
        </p>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0', gap: '24px' }}>
            <div className="glow-spinner" />
            <div style={{ color: '#00f5ff', fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: '18px', letterSpacing: '2px', textTransform: 'uppercase', textShadow: '0 0 10px rgba(0, 245, 255, 0.5)' }}>
              INITIALIZING AVATAR LIBRARY...
            </div>
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
                  className={`category-btn ${activeCategory === cat ? 'active' : ''}`}
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
                      <div className="screws"></div>
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
                            {isSelected ? 'EQUIPPED' : 'Equip'}
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
                            <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#FFD700', fontFamily: "'Rajdhani', sans-serif", letterSpacing: '1px' }}>LOCKED</span>
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
