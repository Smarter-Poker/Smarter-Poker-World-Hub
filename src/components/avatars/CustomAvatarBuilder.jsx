/**
 * 🎨 CUSTOM AVATAR BUILDER
 * AI-powered custom avatar generation tool
 * FREE users: 1 custom avatar | VIP users: Up to 5
 * Features: Matrix-style loading, Accept/Regenerate flow, Gallery management
 */

import React, { useState, useEffect } from 'react';
import { useAvatar } from '../../contexts/AvatarContext';
import { getCustomAvatarGallery, deleteCustomAvatar } from '../../services/avatar-service';

export default function CustomAvatarBuilder({ isVip = false, onClose = null }) {
  const { user, createCustomAvatar, isVip: contextIsVip, initializing } = useAvatar();
  const effectiveVip = isVip || contextIsVip;

  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState(null);
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

    // Create initial columns - Fast but smooth
    const numColumns = 30;
    const chars = '01アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン♠♥♦♣';

    // Initialize columns with random starting positions
    const initialColumns = [];
    for (let i = 0; i < numColumns; i++) {
      initialColumns.push({
        id: i,
        x: (i / numColumns) * 100,
        chars: Array.from({ length: 15 + Math.floor(Math.random() * 10) }, () =>
          chars[Math.floor(Math.random() * chars.length)]
        ),
        speed: 1 + Math.random() * 1,  // 1-2 seconds (fast but not spammy)
        startDelay: Math.random() * 0.3
      });
    }
    setMatrixColumns(initialColumns);

    // Update characters periodically (slower = smoother)
    const charInterval = setInterval(() => {
      setMatrixColumns(cols => cols.map(col => ({
        ...col,
        chars: col.chars.map(() => chars[Math.floor(Math.random() * chars.length)])
      })));
    }, 100);

    return () => clearInterval(charInterval);
  }, [generating]);



  async function handleGenerate() {
    if (!prompt.trim()) {
      alert('Please enter a description for your avatar');
      return;
    }

    setGenerating(true);
    setShowResult(false);
    setGeneratedImage(null);

    try {
      const result = await createCustomAvatar(prompt, effectiveVip, null);

      if (result.success) {
        setGeneratedImage(result.imageUrl);
        setShowResult(true);
      } else {
        alert(`❌ ${result.error}`);
      }
    } catch (error) {
      console.error('Avatar generation error:', error);
      alert('Error generating avatar. Please try again.');
    } finally {
      setGenerating(false);
    }
  }

  function handleAccept() {
    // Reset state
    setShowResult(false);
    setGeneratedImage(null);
    setPrompt('');

    // Close the modal immediately - no popup needed
    if (onClose) {
      onClose();
    }
  }

  function handleRegenerate() {
    setShowResult(false);
    handleGenerate();
  }

  function handleStartOver() {
    setShowResult(false);
    setGeneratedImage(null);
  }

  // Show loading while auth is initializing (prevents premature "Sign In Required")
  if (initializing) {
    return (
      <div style={{
        width: '100%',
        maxWidth: '600px',
        margin: '40px auto',
        padding: '40px',
        background: 'rgba(10, 14, 39, 0.9)',
        border: '2px solid rgba(0, 245, 255, 0.3)',
        borderRadius: '20px',
        textAlign: 'center'
      }}>
        <div style={{
          fontSize: '48px',
          marginBottom: '20px'
        }}>♦️</div>
        <h2 style={{
          fontFamily: 'Orbitron, sans-serif',
          fontSize: '24px',
          color: '#00f5ff',
          marginBottom: '15px'
        }}>Loading...</h2>
        <p style={{
          color: 'rgba(255,255,255,0.7)',
          fontSize: '16px'
        }}>
          Checking authentication...
        </p>
      </div>
    );
  }

  // Show login prompt ONLY after confirming no session exists
  if (!user) {
    return (
      <div style={{
        width: '100%',
        maxWidth: '600px',
        margin: '40px auto',
        padding: '40px',
        background: 'rgba(10, 14, 39, 0.9)',
        border: '2px solid rgba(0, 245, 255, 0.3)',
        borderRadius: '20px',
        textAlign: 'center'
      }}>
        <div style={{
          fontSize: '48px',
          marginBottom: '20px'
        }}>🔐</div>
        <h2 style={{
          fontFamily: 'Orbitron, sans-serif',
          fontSize: '24px',
          color: '#00f5ff',
          marginBottom: '15px'
        }}>Sign In Required</h2>
        <p style={{
          color: 'rgba(255,255,255,0.7)',
          fontSize: '16px',
          marginBottom: '25px'
        }}>
          Please sign in to create your custom AI-powered avatar
        </p>
        <button
          onClick={() => window.location.href = '/auth/login'}
          style={{
            padding: '14px 32px',
            background: 'linear-gradient(135deg, #00f5ff, #0080ff)',
            border: 'none',
            borderRadius: '12px',
            color: '#fff',
            fontSize: '16px',
            fontWeight: '600',
            cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(0, 245, 255, 0.4)'
          }}
        >
          🚀 Sign In Now
        </button>
      </div>
    );
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

        .vip-slots {
          background: linear-gradient(135deg, rgba(255, 215, 0, 0.1), rgba(255, 140, 0, 0.1));
          border: 1px solid rgba(255, 215, 0, 0.3);
          border-radius: 8px;
          padding: 12px 20px;
          margin-bottom: 20px;
          text-align: center;
          font-family: 'Rajdhani', sans-serif;
          color: #ffd700;
          font-size: 16px;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 15px;
        }

        .manage-gallery-btn {
          padding: 6px 12px;
          background: linear-gradient(135deg, #ff4444, #cc0000);
          border: none;
          border-radius: 6px;
          color: white;
          font-family: 'Rajdhani', sans-serif;
          font-size: 12px;
          cursor: pointer;
          text-transform: uppercase;
          font-weight: 600;
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

        .limit-warning.limit-reached {
          background: rgba(255, 68, 68, 0.1);
          border-color: rgba(255, 68, 68, 0.3);
          color: #ff4444;
        }

        /* Delete Modal */
        .delete-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.9);
          z-index: 200;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .delete-modal {
          background: linear-gradient(135deg, #1a1a2e, #16213e);
          border: 2px solid rgba(0, 245, 255, 0.3);
          border-radius: 16px;
          padding: 30px;
          max-width: 500px;
          width: 90%;
          text-align: center;
        }

        .delete-modal h3 {
          font-family: 'Orbitron', sans-serif;
          color: #00f5ff;
          margin-bottom: 10px;
        }

        .delete-modal p {
          font-family: 'Rajdhani', sans-serif;
          color: #888;
          margin-bottom: 20px;
        }

        .avatar-gallery-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
          gap: 15px;
          margin-bottom: 20px;
        }

        .gallery-avatar-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }

        .gallery-avatar-item img {
          width: 80px;
          height: 80px;
          border-radius: 12px;
          object-fit: cover;
          border: 2px solid rgba(0, 245, 255, 0.3);
        }

        .delete-avatar-btn {
          padding: 4px 8px;
          background: linear-gradient(135deg, #ff4444, #cc0000);
          border: none;
          border-radius: 4px;
          color: white;
          font-family: 'Rajdhani', sans-serif;
          font-size: 10px;
          cursor: pointer;
        }

        .close-modal-btn {
          padding: 10px 30px;
          background: rgba(0, 245, 255, 0.2);
          border: 1px solid rgba(0, 245, 255, 0.5);
          border-radius: 8px;
          color: #00f5ff;
          font-family: 'Rajdhani', sans-serif;
          font-size: 14px;
          cursor: pointer;
        }

        /* Matrix Loading Overlay */
        .matrix-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: #000;
          z-index: 9999;
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
        disabled={generating || !prompt.trim() || !canCreate}
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
