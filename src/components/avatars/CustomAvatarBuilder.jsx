/**
 * 🎨 CUSTOM AVATAR BUILDER
 * AI-powered custom avatar generation tool
 * FREE users: 1 custom avatar | VIP users: Up to 5
 * Features: Matrix-style loading, Accept/Regenerate flow, Gallery management
 */

import React, { useState, useEffect } from 'react';
import { useAvatar } from '../../contexts/AvatarContext';
import { getCustomAvatarGallery, deleteCustomAvatar } from '../../services/avatar-service';

export default function CustomAvatarBuilder({ isVip = false }) {
  const { user, createCustomAvatar, isVip: contextIsVip } = useAvatar();
  const effectiveVip = isVip || contextIsVip;

  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState(null);
  const [uploadedPhoto, setUploadedPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [showResult, setShowResult] = useState(false);

  // Gallery management
  const [customAvatars, setCustomAvatars] = useState([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [avatarToDelete, setAvatarToDelete] = useState(null);

  // Limits
  const maxAvatars = effectiveVip ? 5 : 1;
  const currentCount = customAvatars.length;
  const slotsRemaining = maxAvatars - currentCount;
  const canCreate = slotsRemaining > 0;

  // Load custom avatars gallery
  useEffect(() => {
    if (user?.id) {
      loadCustomAvatars();
    }
  }, [user?.id]);

  async function loadCustomAvatars() {
    const avatars = await getCustomAvatarGallery(user.id);
    setCustomAvatars(avatars || []);
  }

  async function handleDeleteAvatar(avatarId) {
    const result = await deleteCustomAvatar(user.id, avatarId);
    if (result.success) {
      await loadCustomAvatars();
      setShowDeleteModal(false);
      setAvatarToDelete(null);
    }
  }

  const examplePrompts = [
    "Fierce warrior with flaming sword",
    "Mystical wizard with glowing staff",
    "Cyberpunk hacker with neon visor",
    "Ancient samurai with katana",
    "Space explorer in futuristic suit",
    "Pirate captain with treasure map"
  ];

  // Matrix rain effect - vertical falling columns like the movie
  const [matrixColumns, setMatrixColumns] = useState([]);

  useEffect(() => {
    if (!generating) {
      setMatrixColumns([]);
      return;
    }

    // Create initial columns - LIGHTNING FAST speed
    const numColumns = 50;
    const chars = '01アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン♠♥♦♣';

    // Initialize columns with random starting positions
    const initialColumns = [];
    for (let i = 0; i < numColumns; i++) {
      initialColumns.push({
        id: i,
        x: (i / numColumns) * 100,
        chars: Array.from({ length: 20 + Math.floor(Math.random() * 15) }, () =>
          chars[Math.floor(Math.random() * chars.length)]
        ),
        speed: 0.5 + Math.random() * 1,  // FAST! 0.5-1.5 seconds
        startDelay: Math.random() * 0.5  // Quick stagger
      });
    }
    setMatrixColumns(initialColumns);

    // Update characters periodically
    const charInterval = setInterval(() => {
      setMatrixColumns(cols => cols.map(col => ({
        ...col,
        chars: col.chars.map(() => chars[Math.floor(Math.random() * chars.length)])
      })));
    }, 150);

    return () => clearInterval(charInterval);
  }, [generating]);

  function handlePhotoUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      alert('Image must be smaller than 10MB');
      return;
    }

    setUploadedPhoto(file);
    const reader = new FileReader();
    reader.onload = (e) => setPhotoPreview(e.target.result);
    reader.readAsDataURL(file);
  }

  function removePhoto() {
    setUploadedPhoto(null);
    setPhotoPreview(null);
  }

  async function handleGenerate() {
    if (!prompt.trim() && !uploadedPhoto) {
      alert('Please enter a description or upload a photo for your avatar');
      return;
    }

    setGenerating(true);
    setShowResult(false);
    setGeneratedImage(null);

    try {
      const result = await createCustomAvatar(prompt, effectiveVip, uploadedPhoto);

      if (result.success) {
        setGeneratedImage(result.imageUrl);
        setShowResult(true);
      } else {
        alert(`❌ ${result.error}`);
      }
    } catch (error) {
      alert('Error generating avatar. Please try again.');
    } finally {
      setGenerating(false);
    }
  }

  function handleAccept() {
    // Close the overlay FIRST, then show confirmation
    setShowResult(false);
    setGeneratedImage(null);
    setPrompt('');
    removePhoto();
    // Reload gallery to update slot count
    loadCustomAvatars();
    // Use setTimeout to ensure overlay closes before alert
    setTimeout(() => {
      alert('✅ Avatar accepted and set as your active avatar!');
    }, 100);
  }

  function handleRegenerate() {
    setShowResult(false);
    handleGenerate();
  }

  function handleStartOver() {
    setShowResult(false);
    setGeneratedImage(null);
  }

  return (
    <div className="custom-avatar-builder">
      <style jsx>{`
        .custom-avatar-builder {
          width: 100%;
          max-width: 800px;
          margin: 0 auto;
          padding: 30px;
          background: rgba(10, 14, 39, 0.8);
          border: 2px solid rgba(0, 245, 255, 0.3);
          border-radius: 20px;
          backdrop-filter: blur(10px);
          position: relative;
          overflow: hidden;
        }

        .builder-title {
          font-family: 'Orbitron', sans-serif;
          font-size: 28px;
          font-weight: 700;
          background: linear-gradient(135deg, #00f5ff, #ff00f5);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          text-align: center;
          margin-bottom: 10px;
        }

        .builder-subtitle {
          font-family: 'Rajdhani', sans-serif;
          font-size: 14px;
          color: #888;
          text-align: center;
          margin-bottom: 30px;
        }

        .vip-badge {
          display: inline-block;
          padding: 4px 12px;
          background: linear-gradient(135deg, #ffd700, #ff8c00);
          color: #000;
          font-family: 'Rajdhani', sans-serif;
          font-size: 12px;
          font-weight: 700;
          border-radius: 6px;
          margin-left: 10px;
          text-transform: uppercase;
        }

        .limit-warning {
          background: rgba(255, 140, 0, 0.1);
          border: 1px solid rgba(255, 140, 0, 0.3);
          border-radius: 8px;
          padding: 12px;
          margin-bottom: 20px;
          text-align: center;
          font-family: 'Rajdhani', sans-serif;
          color: #ff8c00;
          font-size: 14px;
        }

        /* Matrix Loading Overlay */
        .matrix-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: #000;
          z-index: 100;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }

        .matrix-column {
          position: absolute;
          top: -100%;
          display: flex;
          flex-direction: column;
          font-family: 'Courier New', monospace;
          font-size: 14px;
          color: #00ff00;
          text-shadow: 0 0 8px #00ff00, 0 0 15px #00ff00;
          animation: matrixFall linear infinite;
          white-space: nowrap;
        }

        .matrix-column span {
          opacity: 0.9;
        }

        .matrix-column span:first-child {
          color: #fff;
          text-shadow: 0 0 15px #fff;
        }

        @keyframes matrixFall {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(150vh); }
        }

        .loading-content {
          z-index: 101;
          text-align: center;
        }

        .loading-text {
          font-family: 'Orbitron', sans-serif;
          font-size: 24px;
          color: #00ff00;
          text-shadow: 0 0 20px #00ff00;
          margin-bottom: 20px;
          animation: pulse 1s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        .loading-spinner {
          width: 80px;
          height: 80px;
          border: 4px solid transparent;
          border-top: 4px solid #00ff00;
          border-right: 4px solid #00ff00;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin: 0 auto 20px;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .loading-subtext {
          font-family: 'Rajdhani', sans-serif;
          font-size: 14px;
          color: rgba(0, 255, 0, 0.7);
        }

        /* Result Overlay */
        .result-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(10, 14, 39, 0.98);
          z-index: 100;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 30px;
        }

        .result-title {
          font-family: 'Orbitron', sans-serif;
          font-size: 24px;
          color: #00f5ff;
          margin-bottom: 20px;
          text-align: center;
        }

        .result-image {
          max-width: 280px;
          max-height: 280px;
          border-radius: 16px;
          border: 3px solid #00f5ff;
          box-shadow: 0 20px 60px rgba(0, 245, 255, 0.5);
          animation: popIn 0.5s ease-out;
        }

        @keyframes popIn {
          0% { transform: scale(0); opacity: 0; }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; }
        }

        .result-buttons {
          display: flex;
          gap: 15px;
          margin-top: 25px;
          flex-wrap: wrap;
          justify-content: center;
        }

        .result-btn {
          padding: 12px 30px;
          border-radius: 10px;
          font-family: 'Rajdhani', sans-serif;
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.3s ease;
          text-transform: uppercase;
        }

        .accept-btn {
          background: linear-gradient(135deg, #00ff00, #00cc00);
          border: none;
          color: #000;
        }

        .accept-btn:hover {
          box-shadow: 0 5px 20px rgba(0, 255, 0, 0.5);
          transform: translateY(-2px);
        }

        .regenerate-btn {
          background: transparent;
          border: 2px solid #ff8c00;
          color: #ff8c00;
        }

        .regenerate-btn:hover {
          background: rgba(255, 140, 0, 0.2);
        }

        .back-btn {
          background: transparent;
          border: 2px solid #888;
          color: #888;
        }

        .back-btn:hover {
          border-color: #fff;
          color: #fff;
        }

        .vip-note {
          font-family: 'Rajdhani', sans-serif;
          font-size: 12px;
          color: #ffd700;
          margin-top: 15px;
          text-align: center;
        }

        /* Form Sections */
        .photo-upload-section {
          margin-bottom: 30px;
        }

        .section-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 15px;
        }

        .helper-text {
          font-family: 'Rajdhani', sans-serif;
          font-size: 12px;
          color: #888;
          font-style: italic;
        }

        .upload-zone {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 40px;
          background: rgba(0, 0, 0, 0.3);
          border: 2px dashed rgba(0, 245, 255, 0.4);
          border-radius: 16px;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .upload-zone:hover {
          border-color: #00f5ff;
          background: rgba(0, 245, 255, 0.05);
          transform: translateY(-2px);
        }

        .upload-icon { font-size: 48px; margin-bottom: 15px; }
        .upload-text {
          font-family: 'Rajdhani', sans-serif;
          font-size: 16px;
          color: #00f5ff;
          font-weight: 600;
          margin-bottom: 8px;
        }
        .upload-hint {
          font-family: 'Rajdhani', sans-serif;
          font-size: 12px;
          color: #666;
        }

        .photo-preview-container {
          position: relative;
          max-width: 400px;
          margin: 0 auto;
        }

        .photo-preview {
          width: 100%;
          border-radius: 12px;
          border: 2px solid #00f5ff;
          box-shadow: 0 5px 20px rgba(0, 245, 255, 0.3);
        }

        .remove-photo-btn {
          position: absolute;
          top: 10px;
          right: 10px;
          padding: 8px 16px;
          background: rgba(255, 0, 0, 0.8);
          color: white;
          border: none;
          border-radius: 8px;
          font-family: 'Rajdhani', sans-serif;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
        }

        .prompt-section { margin-bottom: 30px; }

        .prompt-label {
          font-family: 'Rajdhani', sans-serif;
          font-size: 16px;
          color: #00f5ff;
          font-weight: 600;
          margin-bottom: 10px;
          text-transform: uppercase;
        }

        .prompt-input {
          width: 100%;
          padding: 15px;
          background: rgba(0, 0, 0, 0.5);
          border: 2px solid rgba(0, 245, 255, 0.3);
          border-radius: 12px;
          color: #fff;
          font-family: 'Rajdhani', sans-serif;
          font-size: 16px;
          resize: vertical;
          min-height: 100px;
          transition: all 0.3s ease;
        }

        .prompt-input:focus {
          outline: none;
          border-color: #00f5ff;
          box-shadow: 0 0 20px rgba(0, 245, 255, 0.3);
        }

        .examples-section { margin-bottom: 30px; }

        .examples-label {
          font-family: 'Rajdhani', sans-serif;
          font-size: 14px;
          color: #888;
          margin-bottom: 10px;
          text-transform: uppercase;
        }

        .examples-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 10px;
        }

        .example-chip {
          padding: 8px 12px;
          background: rgba(0, 245, 255, 0.1);
          border: 1px solid rgba(0, 245, 255, 0.3);
          border-radius: 8px;
          color: #00f5ff;
          font-family: 'Rajdhani', sans-serif;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.3s ease;
          text-align: center;
        }

        .example-chip:hover {
          background: rgba(0, 245, 255, 0.2);
          border-color: #00f5ff;
          transform: translateY(-2px);
        }

        .generate-btn {
          width: 100%;
          padding: 18px;
          background: linear-gradient(135deg, #00f5ff, #0099ff);
          border: none;
          border-radius: 12px;
          color: #0a0e27;
          font-family: 'Orbitron', sans-serif;
          font-size: 18px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.3s ease;
          text-transform: uppercase;
        }

        .generate-btn:hover:not(:disabled) {
          transform: translateY(-3px);
          box-shadow: 0 10px 30px rgba(0, 245, 255, 0.5);
        }

        .generate-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .powered-by {
          margin-top: 20px;
          text-align: center;
          font-family: 'Rajdhani', sans-serif;
          font-size: 12px;
          color: #666;
        }
      `}</style>

      {/* Matrix Loading Overlay */}
      {generating && (
        <div className="matrix-overlay">
          {matrixColumns.map((col) => (
            <div
              key={col.id}
              className="matrix-column"
              style={{
                left: `${col.x}%`,
                animationDuration: `${col.speed}s`,
                animationDelay: `${col.startDelay}s`
              }}
            >
              {col.chars.map((char, idx) => (
                <span key={idx}>{char}</span>
              ))}
            </div>
          ))}
          <div className="loading-content">
            <div className="loading-spinner" />
            <div className="loading-text">BUILDING YOUR AVATAR</div>
            <div className="loading-subtext">AI is crafting your unique character...</div>
          </div>
        </div>
      )}

      {/* Result Overlay with Accept/Regenerate */}
      {showResult && generatedImage && (
        <div className="result-overlay">
          <div className="result-title">✨ YOUR AVATAR IS READY ✨</div>
          <img
            src={generatedImage}
            alt="Generated Avatar"
            className="result-image"
          />
          <div className="result-buttons">
            <button className="result-btn accept-btn" onClick={handleAccept}>
              ✓ Accept Avatar
            </button>
            {effectiveVip && (
              <button className="result-btn regenerate-btn" onClick={handleRegenerate}>
                🔄 Regenerate
              </button>
            )}
            <button className="result-btn back-btn" onClick={handleStartOver}>
              ← Try Different Style
            </button>
          </div>
          {effectiveVip && (
            <div className="vip-note">💎 VIP: Unlimited regenerations</div>
          )}
        </div>
      )}

      {/* Main Form */}
      <h2 className="builder-title">
        🤖 AI Avatar Generator
        {effectiveVip && <span className="vip-badge">VIP</span>}
      </h2>
      <p className="builder-subtitle">
        Create a unique custom avatar using AI
      </p>

      {/* VIP Slot Counter */}
      {effectiveVip && (
        <div className="vip-slots">
          💎 Custom Avatars: {currentCount}/5 slots used
          {!canCreate && (
            <button
              className="manage-gallery-btn"
              onClick={() => setShowDeleteModal(true)}
            >
              Manage Gallery
            </button>
          )}
        </div>
      )}

      {/* Limit Warnings */}
      {!effectiveVip && currentCount >= 1 && (
        <div className="limit-warning limit-reached">
          🔒 You've used your 1 free custom avatar. Upgrade to VIP for up to 5 avatars!
        </div>
      )}
      {!effectiveVip && currentCount === 0 && (
        <div className="limit-warning">
          ⚠️ FREE users get 1 custom avatar (one time only). Upgrade to VIP for up to 5!
        </div>
      )}
      {effectiveVip && !canCreate && (
        <div className="limit-warning limit-reached">
          ⚠️ VIP limit reached! Delete an avatar below to create a new one.
        </div>
      )}

      <div className="photo-upload-section">
        <div className="section-header">
          <span className="prompt-label">📸 Upload Photo (Optional)</span>
          <span className="helper-text">For AI to create a likeness</span>
        </div>

        {!photoPreview ? (
          <label className="upload-zone">
            <input
              type="file"
              accept="image/*"
              onChange={handlePhotoUpload}
              style={{ display: 'none' }}
              disabled={generating}
            />
            <div className="upload-icon">📷</div>
            <div className="upload-text">Click or drag photo here</div>
            <div className="upload-hint">Supports JPG, PNG (Max 10MB)</div>
          </label>
        ) : (
          <div className="photo-preview-container">
            <img src={photoPreview} alt="Uploaded" className="photo-preview" />
            <button className="remove-photo-btn" onClick={removePhoto} disabled={generating}>
              ✕ Remove
            </button>
          </div>
        )}
      </div>

      <div className="prompt-section">
        <div className="prompt-label">✨ Describe Your Avatar</div>
        <textarea
          className="prompt-input"
          placeholder="Describe your avatar in detail... (e.g., 'A fierce dragon warrior with glowing red eyes and golden armor')"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={generating}
        />
      </div>

      <div className="examples-section">
        <div className="examples-label">💡 Example Prompts</div>
        <div className="examples-grid">
          {examplePrompts.map((ex, idx) => (
            <div
              key={idx}
              className="example-chip"
              onClick={() => setPrompt(ex)}
            >
              {ex}
            </div>
          ))}
        </div>
      </div>

      <button
        className="generate-btn"
        onClick={handleGenerate}
        disabled={generating || (!prompt.trim() && !uploadedPhoto) || !canCreate}
      >
        {canCreate ? '⚡ Generate Avatar' : '🔒 Slot Limit Reached'}
      </button>

      <div className="powered-by">
        Powered by AI Image Generation
      </div>

      {/* VIP Gallery Management Modal */}
      {showDeleteModal && effectiveVip && (
        <div className="delete-modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="delete-modal" onClick={e => e.stopPropagation()}>
            <h3>Manage Your Avatars</h3>
            <p>Delete an avatar to free up a slot for a new creation.</p>
            <div className="avatar-gallery-grid">
              {customAvatars.map(avatar => (
                <div key={avatar.id} className="gallery-avatar-item">
                  <img src={avatar.image_url} alt="Custom Avatar" />
                  <button
                    className="delete-avatar-btn"
                    onClick={() => handleDeleteAvatar(avatar.id)}
                  >
                    🗑️ Delete
                  </button>
                </div>
              ))}
            </div>
            <button className="close-modal-btn" onClick={() => setShowDeleteModal(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
