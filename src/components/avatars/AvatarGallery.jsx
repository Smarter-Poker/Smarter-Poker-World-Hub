/**
 * 🎨 AVATAR GALLERY
 * Interactive grid for selecting preset avatars from the library
 * Supports FREE/VIP filtering and unlock status
 */

import React, { useState, useEffect } from 'react';
import { useAvatar } from '../../contexts/AvatarContext';
import { getAvailableAvatars } from '../../services/avatar-service';
import { getCategories } from '../../data/AVATAR_LIBRARY';

export default function AvatarGallery({ onSelect, showCustomTab = true }) {
  const { user, avatar: currentAvatar, selectPresetAvatar } = useAvatar();

  const [avatars, setAvatars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTier, setSelectedTier] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [previewAvatar, setPreviewAvatar] = useState(null);

  useEffect(() => {
    if (user) {
      loadAvatars();
    }
  }, [user, selectedTier]);

  async function loadAvatars() {
    setLoading(true);
    const data = await getAvailableAvatars(user.id, selectedTier);
    setAvatars(data);
    setLoading(false);
  }

  async function handleSelectAvatar(avatarId) {
    const result = await selectPresetAvatar(avatarId);

    if (result.success) {
      setPreviewAvatar(null);
      if (onSelect) onSelect(avatarId);
    } else {
      alert(result.error);
    }
  }

  const filteredAvatars = avatars.filter(av => {
    if (selectedCategory === 'all') return true;
    return av.category === selectedCategory;
  });

  const categories = getCategories();

  return (
    <div className="avatar-gallery">
      <style jsx>{`
        .avatar-gallery {
          width: 100%;
          max-width: 1200px;
          margin: 0 auto;
          padding: 20px;
        }

        .gallery-header {
          margin-bottom: 30px;
        }

        .gallery-title {
          font-family: 'Orbitron', sans-serif;
          font-size: 32px;
          font-weight: 700;
          background: linear-gradient(135deg, #00f5ff, #0099ff);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          text-align: center;
          margin-bottom: 20px;
        }

        .filters {
          display: flex;
          gap: 15px;
          flex-wrap: wrap;
          justify-content: center;
          margin-bottom: 20px;
        }

        .filter-group {
          display: flex;
          gap: 10px;
          align-items: center;
        }

        .filter-label {
          font-family: 'Rajdhani', sans-serif;
          font-size: 14px;
          color: #00f5ff;
          text-transform: uppercase;
          font-weight: 600;
        }

        .filter-btn {
          padding: 8px 16px;
          background: rgba(0, 245, 255, 0.1);
          border: 1px solid rgba(0, 245, 255, 0.3);
          color: #fff;
          border-radius: 8px;
          cursor: pointer;
          font-family: 'Rajdhani', sans-serif;
          font-size: 14px;
          transition: all 0.3s ease;
        }

        .filter-btn:hover {
          background: rgba(0, 245, 255, 0.2);
          border-color: #00f5ff;
        }

        .filter-btn.active {
          background: #00f5ff;
          color: #0a0e27;
          border-color: #00f5ff;
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

        .avatar-card.locked {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .avatar-card.locked::before {
          content: '🔒';
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          font-size: 48px;
          z-index: 2;
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

        .loading-state {
          text-align: center;
          padding: 60px 20px;
          color: #00f5ff;
          font-family: 'Rajdhani', sans-serif;
          font-size: 18px;
        }

        .stats-bar {
          display: flex;
          justify-content: center;
          gap: 30px;
          padding: 15px;
          background: rgba(0, 245, 255, 0.05);
          border-radius: 12px;
          margin-bottom: 20px;
        }

        .stat-item {
          text-align: center;
        }

        .stat-value {
          font-family: 'Orbitron', sans-serif;
          font-size: 24px;
          font-weight: 700;
          color: #00f5ff;
        }

        .stat-label {
          font-family: 'Rajdhani', sans-serif;
          font-size: 12px;
          color: #888;
          text-transform: uppercase;
        }
      `}</style>

      <div className="gallery-header">
        <h2 className="gallery-title">⚡ AVATAR LIBRARY ⚡</h2>

        <div className="stats-bar">
          <div className="stat-item">
            <div className="stat-value">{avatars.length}</div>
            <div className="stat-label">Total Avatars</div>
          </div>
          <div className="stat-item">
            <div className="stat-value">
              {avatars.filter(a => !a.isLocked).length}
            </div>
            <div className="stat-label">Unlocked</div>
          </div>
          <div className="stat-item">
            <div className="stat-value">
              {avatars.filter(a => a.isLocked).length}
            </div>
            <div className="stat-label">Locked</div>
          </div>
        </div>

        <div className="filters">
          <div className="filter-group">
            <span className="filter-label">Tier:</span>
            <button
              className={`filter-btn ${selectedTier === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedTier('all')}
            >
              All
            </button>
            <button
              className={`filter-btn ${selectedTier === 'free' ? 'active' : ''}`}
              onClick={() => setSelectedTier('free')}
            >
              FREE
            </button>
            <button
              className={`filter-btn ${selectedTier === 'vip' ? 'active' : ''}`}
              onClick={() => setSelectedTier('vip')}
            >
              VIP
            </button>
          </div>

          <div className="filter-group">
            <span className="filter-label">Category:</span>
            <button
              className={`filter-btn ${selectedCategory === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedCategory('all')}
            >
              All
            </button>
            {categories.map(cat => (
              <button
                key={cat}
                className={`filter-btn ${selectedCategory === cat ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="loading-state">
          <div>⏳ Loading Avatars...</div>
        </div>
      ) : (
        <div className="avatar-grid">
          {filteredAvatars.map(av => (
            <div
              key={av.id}
              className={`avatar-card ${av.isLocked ? 'locked' : ''} ${currentAvatar?.id === av.id ? 'selected' : ''
                }`}
              onClick={() => !av.isLocked && handleSelectAvatar(av.id)}
            >
              <img
                src={av.image}
                alt={av.name}
                className="avatar-image"
              />
              <span className={`tier-badge ${av.tier.toLowerCase()}`}>
                {av.tier}
              </span>
              <div className="avatar-info">
                <p className="avatar-name">{av.name}</p>
                <p className="avatar-tier">{av.category}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
