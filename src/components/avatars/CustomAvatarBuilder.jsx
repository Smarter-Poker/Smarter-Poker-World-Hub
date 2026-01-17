/**
 * 🎨 CUSTOM AVATAR BUILDER
 * AI-powered custom avatar generation tool
 * FREE users: 1 custom avatar | VIP users: Unlimited
 */

import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useAvatar } from '../../contexts/AvatarContext';

export default function CustomAvatarBuilder({ isVip = false }) {
    const { user } = useAuth();
    const { createCustomAvatar } = useAvatar();

    const [prompt, setPrompt] = useState('');
    const [generating, setGenerating] = useState(false);
    const [generatedImage, setGeneratedImage] = useState(null);

    const examplePrompts = [
        "Fierce warrior with flaming sword",
        "Mystical wizard with glowing staff",
        "Cyberpunk hacker with neon visor",
        "Ancient samurai with katana",
        "Space explorer in futuristic suit",
        "Pirate captain with treasure map"
    ];

    async function handleGenerate() {
        if (!prompt.trim()) {
            alert('Please enter a description for your avatar');
            return;
        }

        setGenerating(true);

        try {
            const result = await createCustomAvatar(prompt, isVip);

            if (result.success) {
                setGeneratedImage(result.imageUrl);
                alert('✅ Custom avatar generated and set as active!');
                setPrompt('');
            } else {
                alert(`❌ ${result.error}`);
            }
        } catch (error) {
            alert('Error generating avatar. Please try again.');
        } finally {
            setGenerating(false);
        }
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

        .prompt-section {
          margin-bottom: 30px;
        }

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

        .examples-section {
          margin-bottom: 30px;
        }

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
          position: relative;
          overflow: hidden;
        }

        .generate-btn:hover:not(:disabled) {
          transform: translateY(-3px);
          box-shadow: 0 10px 30px rgba(0, 245, 255, 0.5);
        }

        .generate-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .generating-animation {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
          animation: shimmer 1.5s infinite;
        }

        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }

        .preview-section {
          margin-top: 30px;
          text-align: center;
        }

        .preview-image {
          max-width: 300px;
          border-radius: 16px;
          border: 3px solid #00f5ff;
          box-shadow: 0 10px 40px rgba(0, 245, 255, 0.4);
        }

        .powered-by {
          margin-top: 20px;
          text-align: center;
          font-family: 'Rajdhani', sans-serif;
          font-size: 12px;
          color: #666;
        }
      `}</style>

            <h2 className="builder-title">
                🤖 AI Avatar Generator
                {isVip && <span className="vip-badge">VIP</span>}
            </h2>
            <p className="builder-subtitle">
                Create a unique custom avatar using AI
            </p>

            {!isVip && (
                <div className="limit-warning">
                    ⚠️ FREE users can create 1 custom avatar. Upgrade to VIP for unlimited custom avatars!
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
                disabled={generating || !prompt.trim()}
            >
                {generating ? (
                    <>
                        <span>Generating...</span>
                        <div className="generating-animation" />
                    </>
                ) : (
                    '⚡ Generate Avatar'
                )}
            </button>

            {generatedImage && (
                <div className="preview-section">
                    <img
                        src={generatedImage}
                        alt="Generated Avatar"
                        className="preview-image"
                    />
                </div>
            )}

            <div className="powered-by">
                Powered by AI Image Generation
            </div>
        </div>
    );
}
