/**
 * 🎨 AVATAR SELECTOR MODAL
 * Unified modal for selecting preset avatars or creating custom ones
 * Tabs: Library | Custom Builder
 */

import React, { useState } from 'react';
import AvatarGallery from './AvatarGallery';
import CustomAvatarBuilder from './CustomAvatarBuilder';

export default function AvatarSelectorModal({ isOpen, onClose, isVip = false }) {
    const [activeTab, setActiveTab] = useState('library');

    if (!isOpen) return null;

    function handleSelect(avatarId) {
        // Avatar selected successfully
        setTimeout(() => {
            onClose();
        }, 500);
    }

    return (
        <div className="avatar-modal-overlay" onClick={onClose}>
            <div className="avatar-modal" onClick={(e) => e.stopPropagation()}>
                <style jsx>{`
          .avatar-modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.8);
            backdrop-filter: blur(10px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            padding: 20px;
            animation: fadeIn 0.3s ease;
          }

          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }

          .avatar-modal {
            background: linear-gradient(135deg, #0a0e27 0%, #1a1f3a 100%);
            border: 2px solid rgba(0, 245, 255, 0.3);
            border-radius: 24px;
            max-width: 1400px;
            width: 100%;
            max-height: 90vh;
            overflow-y: auto;
            position: relative;
            animation: slideUp 0.3s ease;
            box-shadow: 0 20px 60px rgba(0, 245, 255, 0.3);
          }

          @keyframes slideUp {
            from {
              transform: translateY(50px);
              opacity: 0;
            }
            to {
              transform: translateY(0);
              opacity: 1;
            }
          }

          .modal-header {
            position: sticky;
            top: 0;
            background: rgba(10, 14, 39, 0.95);
            backdrop-filter: blur(10px);
            padding: 20px 30px;
            border-bottom: 1px solid rgba(0, 245, 255, 0.2);
            z-index: 10;
          }

          .close-btn {
            position: absolute;
            top: 20px;
            right: 30px;
            width: 40px;
            height: 40px;
            background: rgba(255, 0, 0, 0.1);
            border: 1px solid rgba(255, 0, 0, 0.3);
            border-radius: 50%;
            color: #ff4444;
            font-size: 24px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s ease;
            font-family: Arial, sans-serif;
            line-height: 1;
          }

          .close-btn:hover {
            background: rgba(255, 0, 0, 0.2);
            border-color: #ff4444;
            transform: rotate(90deg);
          }

          .tabs {
            display: flex;
            gap: 10px;
            justify-content: center;
          }

          .tab-btn {
            padding: 12px 30px;
            background: transparent;
            border: 2px solid rgba(0, 245, 255, 0.3);
            border-radius: 12px;
            color: #888;
            font-family: 'Rajdhani', sans-serif;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            text-transform: uppercase;
          }

          .tab-btn:hover {
            border-color: rgba(0, 245, 255, 0.6);
            color: #00f5ff;
          }

          .tab-btn.active {
            background: linear-gradient(135deg, #00f5ff, #0099ff);
            border-color: #00f5ff;
            color: #0a0e27;
            font-weight: 700;
          }

          .modal-content {
            padding: 40px 30px;
          }

          /* Custom scrollbar */
          .avatar-modal::-webkit-scrollbar {
            width: 10px;
          }

          .avatar-modal::-webkit-scrollbar-track {
            background: rgba(0, 0, 0, 0.3);
            border-radius: 10px;
          }

          .avatar-modal::-webkit-scrollbar-thumb {
            background: linear-gradient(135deg, #00f5ff, #0099ff);
            border-radius: 10px;
          }

          .avatar-modal::-webkit-scrollbar-thumb:hover {
            background: linear-gradient(135deg, #0099ff, #00f5ff);
          }
        `}</style>

                <div className="modal-header">
                    <button className="close-btn" onClick={onClose} aria-label="Close">
                        ×
                    </button>

                    <div className="tabs">
                        <button
                            className={`tab-btn ${activeTab === 'library' ? 'active' : ''}`}
                            onClick={() => setActiveTab('library')}
                        >
                            📚 Avatar Library
                        </button>
                        <button
                            className={`tab-btn ${activeTab === 'custom' ? 'active' : ''}`}
                            onClick={() => setActiveTab('custom')}
                        >
                            🤖 Custom AI Generator
                        </button>
                    </div>
                </div>

                <div className="modal-content">
                    {activeTab === 'library' ? (
                        <AvatarGallery onSelect={handleSelect} />
                    ) : (
                        <CustomAvatarBuilder isVip={isVip} />
                    )}
                </div>
            </div>
        </div>
    );
}
