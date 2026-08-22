/**
 * AVATAR GALLERY
 * Interactive grid for selecting preset and custom avatars
 * AAA Features: Holographic Tilt, SFX, Inspect Modal, Particle Burst
 */

import React, { useState, useEffect, useRef } from 'react';
import supabase from "../../lib/supabase";
import { useAvatar } from '../../contexts/AvatarContext';
import { getAvailableAvatars, getCustomAvatarGallery, deleteCustomAvatar } from '../../services/avatar-service';
import CustomAvatarBuilder from './CustomAvatarBuilder';
import toast from '../../stores/toastStore';
import SPImage from '../common/SPImage';

// --- NEW COMPONENT FOR PHASE 1: PERFORMANCE SKELETON LOADING ---
const AvatarMedia = ({ src, alt, index, frame = '', aura = '' }) => {
    const [loaded, setLoaded] = React.useState(false);
    const isVideo = src?.match(/\.(webm|mp4)$/i);
    const isAnimatedWebp = src?.match(/\.(webp|gif)$/i);
    const showsAnimationBadge = isVideo || isAnimatedWebp;

    return (
        <div 
            className="avatar-image-wrapper" 
            style={{ 
                animation: `ambientBreathe ${3 + (index % 3)}s ease-in-out infinite`,
                animationDelay: `${-(index % 5)}s` 
            }}
        >
            {showsAnimationBadge && (
                <div style={{
                    position: 'absolute',
                    top: '8px', right: '8px',
                    background: 'rgba(0, 245, 255, 0.15)',
                    border: '1px solid rgba(0, 245, 255, 0.4)',
                    boxShadow: '0 0 8px rgba(0,245,255,0.4)',
                    color: '#00f5ff',
                    fontSize: '9px',
                    fontWeight: 'bold',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    zIndex: 20,
                    letterSpacing: '1px',
                    backdropFilter: 'blur(4px)',
                    animation: 'skeletonPulse 2s infinite'
                }}>
                    ANIMATED
                </div>
            )}
            {frame && <div className={`cosmetic-frame ${frame}`} />}
            {aura && <div className={`cosmetic-aura ${aura}`} />}
            {!loaded && <div className="skeleton-loader" />}
            {isVideo ? (
                <video 
                    src={src} 
                    autoPlay loop muted playsInline 
                    onLoadedData={() => setLoaded(true)}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: loaded ? 1 : 0, transition: 'opacity 0.5s ease-in-out' }} 
                />
            ) : (
                <SPImage
                    src={src}
                    alt={alt}
                    fill
                    unoptimized={!!isAnimatedWebp}
                    onLoad={() => setLoaded(true)}
                    onLoadingComplete={() => setLoaded(true)}
                    style={{ objectFit: 'cover', opacity: loaded ? 1 : 0, transition: 'opacity 0.5s ease-in-out' }}
                />
            )}
        </div>
    );
};


// --- AAA FEATURE: SFX ---
const playSound = (type) => {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        if (type === 'click') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(800, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.1);
            gain.gain.setValueAtTime(0.05, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
            osc.start();
            osc.stop(ctx.currentTime + 0.1);
        } else if (type === 'equip') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(150, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.3);
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
            osc.start();
            osc.stop(ctx.currentTime + 0.3);
        } else if (type === 'error') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(100, ctx.currentTime);
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
            osc.start();
            osc.stop(ctx.currentTime + 0.2);
        }
    } catch(e) {}
};

// --- AAA FEATURE: 3D Holographic Tilt Card ---
const TiltCard = ({ children, className, onClick, style }) => {
  const cardRef = useRef(null);
  const [transform, setTransform] = useState('');
  const [glare, setGlare] = useState({ x: 50, y: 50, opacity: 0 });

  const handleMouseMove = (e) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rotateX = ((y - centerY) / centerY) * -15;
    const rotateY = ((x - centerX) / centerX) * 15;
    
    setTransform(`perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`);
    setGlare({ x: (x / rect.width) * 100, y: (y / rect.height) * 100, opacity: 1 });
  };

  const handleMouseLeave = () => {
    setTransform('perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)');
    setGlare({ x: 50, y: 50, opacity: 0 });
  };

  return (
    <div 
      ref={cardRef}
      className={className}
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ 
        ...style, 
        transform, 
        transition: transform === '' ? 'transform 0.5s ease' : 'none',
        position: 'relative',
        transformStyle: 'preserve-3d',
        zIndex: transform !== '' ? 10 : 1
      }}
    >
      {children}
      <div style={{
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        background: `radial-gradient(circle at ${glare.x}% ${glare.y}%, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0) 60%)`,
        opacity: glare.opacity,
        pointerEvents: 'none',
        transition: 'opacity 0.3s ease',
        borderRadius: 'inherit',
        zIndex: 20,
        mixBlendMode: 'overlay'
      }} />
    </div>
  );
};

// --- AAA FEATURE: Inspect Modal ---
const InspectModal = ({ avatar, isCustom, onClose, onEquip, isVip }) => {
  if (!avatar) return null;

  const handleEquip = () => {
    if (avatar.isLocked) {
      playSound('error');
      toast.warning('Upgrade to VIP to unlock this premium avatar!');
      return;
    }
    playSound('equip');
    onEquip(avatar);
  };

  const name = isCustom ? (avatar.prompt?.substring(0,30) || 'Custom Avatar') : avatar.name;
  const imageUrl = isCustom ? avatar.image_url : avatar.image;
  const isVideo = imageUrl?.match(/\.(webm|mp4)$/i);
  const isSelected = avatar.isSelected;

  /* The comment below used to introduce a function. The function is gone and
     the CALL SITE stayed - `{getLore()}` still renders in the modal body. That
     is a ReferenceError on every inspect, which kills the modal behind the
     error boundary: the avatar opens to a blank card.

     Restored as data-first with a deterministic fallback. Data-first because a
     real `lore` or `description` on the avatar should always win; deterministic
     because a random pick re-rolls on every re-render and the line visibly
     flickers while the modal is open. Indexing by a stable hash of the name
     gives each avatar its own line, forever. */
  const getLore = () => {
    if (avatar.lore) return avatar.lore;
    if (avatar.description) return avatar.description;
    const LINES = [
      'Seen more river cards than most players have seen hands.',
      'Never shows the bluff. Never has to.',
      'Arrived at the table before anyone remembers opening it.',
      'Counts the pot once. That is always enough.',
      'Has folded aces, on purpose, and been right.',
      'Plays the player. The cards are a formality.',
      'Quiet at the table. Loud in the results.',
      'Left the game up, twice, and came back anyway.',
    ];
    const key = String(name || 'avatar');
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
    return LINES[h % LINES.length];
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.85)',
      backdropFilter: 'blur(10px)',
      zIndex: 99999,
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    }} onClick={onClose}>
      <div style={{
        background: 'linear-gradient(145deg, #161b22, #0d1116)',
        border: '2px solid #4a525a',
        borderRadius: '24px',
        padding: '30px',
        maxWidth: '500px',
        width: '90%',
        boxShadow: '0 20px 50px rgba(0,0,0,0.8), inset 0 2px 10px rgba(255,255,255,0.1)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px',
        position: 'relative'
      }} onClick={e => e.stopPropagation()}>
        
        <button onClick={onClose} style={{
          position: 'absolute', top: '15px', right: '15px',
          background: 'transparent', border: 'none', color: '#888',
          fontSize: '24px', cursor: 'pointer'
        }}>✕</button>

        <div style={{ width: '200px', height: '200px', borderRadius: '20px', border: '3px solid #00f5ff', boxShadow: '0 0 30px rgba(0,245,255,0.3), inset 0 0 20px rgba(0,0,0,0.8)', position: 'relative', background: 'linear-gradient(145deg, #161b22, #0d1116)' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, animation: 'ambientBreathe 4s ease-in-out infinite', filter: 'url(#defringe) drop-shadow(0 10px 20px rgba(0,0,0,0.9))', WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 85%, rgba(0,0,0,0) 100%)', maskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 85%, rgba(0,0,0,0) 100%)', transformOrigin: 'bottom center' }}>
                {isVideo ? (
                    <video src={imageUrl} autoPlay loop muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                    <SPImage src={imageUrl} alt={name} fill style={{ objectFit: 'cover' }} />
                )}
            </div>
        </div>

        <div style={{ textAlign: 'center' }}>
          <h2 style={{ color: '#fff', margin: '0 0 10px 0', fontFamily: "'Rajdhani', sans-serif", fontSize: '28px', textTransform: 'uppercase', textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>
            {name}
          </h2>
          <p style={{ color: '#aaa', fontStyle: 'italic', margin: 0, fontSize: '16px' }}>
            {getLore()}
          </p>
        </div>

        <button
          onClick={isSelected ? undefined : handleEquip}
          style={{
            padding: '15px 50px',
            background: avatar.isLocked ? 'linear-gradient(145deg, #3a3a3a, #1a1a1a)' : isSelected ? 'linear-gradient(145deg, #00ff00, #008800)' : 'linear-gradient(145deg, #00f5ff, #0088ff)',
            border: avatar.isLocked ? '2px solid #555' : 'none',
            borderRadius: '30px',
            color: avatar.isLocked ? '#888' : '#000',
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: '20px',
            fontWeight: 900,
            cursor: avatar.isLocked ? 'not-allowed' : isSelected ? 'default' : 'pointer',
            textTransform: 'uppercase',
            boxShadow: avatar.isLocked ? 'none' : isSelected ? '0 10px 20px rgba(0, 255, 0, 0.4)' : '0 10px 20px rgba(0, 245, 255, 0.4)',
            transition: 'all 0.3s'
          }}
        >
          {avatar.isLocked ? 'VIP LOCKED' : isSelected ? 'CURRENTLY EQUIPPED' : 'EQUIP NOW'}
        </button>

      </div>
    </div>
  );
};

// --- MAIN GALLERY ---
export default function AvatarGallery({ onSelect }) {
  const { user, avatar: currentAvatar, selectPresetAvatar, setActiveAvatar, isVip, createCustomAvatar } = useAvatar();

  const [customAvatars, setCustomAvatars] = useState([]);
  const [showCustomBuilder, setShowCustomBuilder] = useState(false);
  const [avatars, setAvatars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('All');
  
  const [inspectingAvatar, setInspectingAvatar] = useState(null);
  const [equippedBurst, setEquippedBurst] = useState(null); // stores id of avatar that just equipped

  useEffect(() => {
    async function loadAllAvatars() {
      try {
        setLoading(true);
        if (user?.id) {
          try {
            const customs = await getCustomAvatarGallery(user.id);
            setCustomAvatars(customs || []);
          } catch (err) {
            setCustomAvatars([]);
          }
        }
        await loadAvatars();
      } catch (error) {
      } finally {
        setLoading(false);
      }
    }
    loadAllAvatars();
  }, [user?.id, isVip]);

  async function loadAvatars() {
    try {
      const data = await getAvailableAvatars(user?.id || null, 'all', isVip);
      setAvatars(data);
    } catch (error) {
      setAvatars([]);
    }
  }

  async function handleConfirmEquip(avatarObj) {
    let result;
    if (avatarObj.isCustomObj) {
        result = await setActiveAvatar(avatarObj.image_url, 'custom', null, avatarObj.prompt);
    } else {
        result = await selectPresetAvatar(avatarObj.id);
    }

    if (result.success) {
      setEquippedBurst(avatarObj.id || avatarObj.image_url);
      setInspectingAvatar(null);
      if (onSelect) onSelect(avatarObj.id || null);
      if (avatarObj.isCustomObj && user?.id) {
        const customs = await getCustomAvatarGallery(user.id);
        setCustomAvatars(customs || []);
      } else {
        await loadAvatars();
      }
      setTimeout(() => setEquippedBurst(null), 1000);
    } else {
      toast.error(result.error);
    }
  }

  function handleCreateNewCustom() {
    playSound('click');
    const maxCustomSlots = isVip ? 5 : 1;
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
    e.stopPropagation();
    if (!isVip) {
      playSound('error');
      toast.warning('Warning: You cannot create another custom avatar without upgrading to VIP.');
    }
    if (confirm("Are you sure you want to delete this custom avatar?")) {
      const success = await deleteCustomAvatar(user.id, avatarId);
      if (success) {
        setCustomAvatars(prev => prev.filter(a => a.id !== avatarId));
        
      } else {
        toast.error("Failed to delete avatar.");
      }
    }
  }

  const maxCustomSlots = isVip ? 5 : 1;
  const customSlots = Array(maxCustomSlots).fill(null);
  customAvatars.forEach((av, i) => {
    if (i < maxCustomSlots) customSlots[i] = av;
  });

  return (
    <div className="avatar-gallery-container">
      {inspectingAvatar && (
        <InspectModal 
            avatar={inspectingAvatar} 
            isCustom={inspectingAvatar.isCustomObj}
            onClose={() => { playSound('click'); setInspectingAvatar(null); }}
            onEquip={handleConfirmEquip}
            isVip={isVip}
        />
      )}

      {showCustomBuilder && (
        <CustomAvatarBuilder
          onClose={() => setShowCustomBuilder(false)}
          onAvatarCreated={async (newAvatar) => {
            const customs = await getCustomAvatarGallery(user.id);
            setCustomAvatars(customs || []);
            setShowCustomBuilder(false);
            // const result = await setActiveAvatar(newAvatar.image_url, 'custom', null, newAvatar.prompt);
          }}
        />
      )}

      <style>{`
        .avatar-gallery-container {
          display: flex;
          flex-direction: column;
          gap: 40px;
        }

        .top-layout {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          flex-wrap: wrap;
          gap: 20px;
        }
        
        .custom-avatars-side {
          flex: 1;
          min-width: 320px;
        }

        .current-avatar-side {
          width: 350px;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
        }
        
        @media (max-width: 768px) {
            .current-avatar-side {
                width: 100%;
                align-items: flex-start;
            }
        }

        .section-title {
          font-family: 'Rajdhani', sans-serif;
          font-size: 24px;
          color: #fff;
          margin-bottom: 8px;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .section-subtitle {
          font-size: 14px;
          color: #fff; /* Updated to white */
          margin-bottom: 20px;
        }

        .avatar-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 15px;
        }

        /* CARD STYLES */
        .avatar-card {
          width: 130px;
          height: 130px;
          border-radius: 16px;
          position: relative;
          overflow: hidden;
          cursor: pointer;
          background: linear-gradient(145deg, #161b22, #0d1116);
          border: 2px solid #8a929a;
          box-shadow: inset 0 2px 8px rgba(255,255,255,0.1), 0 5px 15px rgba(0,0,0,0.5);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }

        .avatar-card.placeholder {
          background: rgba(255,255,255,0.03);
          border: 2px solid #8a929a;
        }
        
        .avatar-card.selected {
          border-color: #00f5ff;
          box-shadow: 0 0 20px rgba(0, 245, 255, 0.4), inset 0 0 10px rgba(0, 245, 255, 0.2);
        }

        /* Particle Burst Animation */
        .burst-anim {
          animation: equipBurst 1s ease-out forwards;
        }
        @keyframes equipBurst {
          0% { box-shadow: 0 0 0 0 rgba(0,245,255,0.8); border-color: #fff; }
          50% { box-shadow: 0 0 40px 20px rgba(0,245,255,0); border-color: #00f5ff; }
          100% { box-shadow: 0 0 20px rgba(0, 245, 255, 0.4); border-color: #00f5ff; }
        }

        .screws {
          position: absolute; top: 0; left: 0; right: 0; bottom: 0;
          pointer-events: none; z-index: 10;
        }
        .screws::before, .screws::after {
          content: ''; position: absolute;
          width: 6px; height: 6px; background: #000; border-radius: 50%;
          border: 1px solid #444; box-shadow: inset 0 1px 2px rgba(255,255,255,0.3);
        }
        .screws::before { top: 6px; left: 6px; }
        .screws::after { top: 6px; right: 6px; }
        .avatar-card::before, .avatar-card::after {
          content: ''; position: absolute;
          width: 6px; height: 6px; background: #000; border-radius: 50%;
          border: 1px solid #444; box-shadow: inset 0 1px 2px rgba(255,255,255,0.3);
          z-index: 10; pointer-events: none;
        }
        .avatar-card::before { bottom: 6px; left: 6px; }
        .avatar-card::after { bottom: 6px; right: 6px; }

        .placeholder-content {
          text-align: center;
          color: #fff; /* Updated to white */
        }

        .placeholder-icon {
          font-size: 32px;
          margin-bottom: 4px;
          color: #fff; /* Updated to white */
          text-shadow: 0 0 10px rgba(255,255,255,0.3);
        }

        .placeholder-text {
          font-size: 12px;
          font-family: 'Rajdhani', sans-serif;
          text-transform: uppercase;
          font-weight: 600;
        }

        .avatar-info {
          position: absolute;
          bottom: 0; left: 0; right: 0;
          background: linear-gradient(to top, rgba(0,0,0,0.9), transparent);
          padding: 20px 8px 8px 8px;
          text-align: center;
          z-index: 5;
        }
        
        .avatar-name {
          font-family: 'Rajdhani', sans-serif;
          font-size: 14px;
          color: #fff;
          font-weight: 600;
          margin: 0;
          text-shadow: 0 1px 3px rgba(0,0,0,0.8);
        }

        .avatar-tier {
          font-size: 10px;
          color: #00f5ff;
          margin: 2px 0 0 0;
          text-transform: uppercase;
        }

        .create-custom-btn {
          padding: 15px 40px;
          background: linear-gradient(145deg, #2c3545 0%, #161b22 100%);
          border: 2px solid #00f5ff;
          border-radius: 12px;
          color: #fff; /* Updated to white */
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
          z-index: 30;
          transition: all 0.3s ease;
        }
        .delete-avatar-btn:hover {
          background: #ff4444;
          color: #fff;
          box-shadow: 0 0 10px rgba(255, 68, 68, 0.8);
          transform: scale(1.1);
        }
        .delete-avatar-btn.free-tier { opacity: 0.5; }
        .delete-avatar-btn.free-tier:hover { opacity: 1; }

        .category-btn {
          padding: 8px 20px;
          border-radius: 20px;
          background: linear-gradient(145deg, #1c2229 0%, #101419 100%);
          border: 1px solid #4a525a;
          color: #fff; /* Updated to white */
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
          border-color: #8a929a;
          transform: translateY(-1px);
        }
        .category-btn.active {
          background: linear-gradient(145deg, #161b22 0%, #0d1116 100%);
          border-color: #00f5ff;
          color: #fff;
          box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.5), 0 0 10px rgba(0, 245, 255, 0.3);
        }

        .glow-spinner {
          width: 50px; height: 50px;
          border: 3px solid rgba(0, 245, 255, 0.1);
          border-top: 3px solid #00f5ff;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        
        /* Life-like Ambient Breathing Animation */
        @keyframes ambientBreathe {
          0% { transform: translateY(0px) scale(1) rotate(0deg); }
          33% { transform: translateY(-3px) scale(1.02) rotate(1deg); }
          66% { transform: translateY(-1px) scale(1.01) rotate(-1deg); }
          100% { transform: translateY(0px) scale(1) rotate(0deg); }
        }

        .avatar-image-wrapper {
          position: absolute;
          top: 0; left: 0; right: 0; bottom: 0;
          filter: url(#defringe) drop-shadow(0 10px 15px rgba(0,0,0,0.9));
          -webkit-mask-image: linear-gradient(to bottom, rgba(0,0,0,1) 80%, rgba(0,0,0,0) 100%);
          mask-image: linear-gradient(to bottom, rgba(0,0,0,1) 80%, rgba(0,0,0,0) 100%);
          transform-origin: bottom center;
        }

                @keyframes skeletonPulse {
          0% { background: rgba(0, 245, 255, 0.05); }
          50% { background: rgba(0, 245, 255, 0.15); }
          100% { background: rgba(0, 245, 255, 0.05); }
        }
        .skeleton-loader {
          position: absolute;
          top: 0; left: 0; right: 0; bottom: 0;
          animation: skeletonPulse 1.5s infinite ease-in-out;
          border-radius: 20px;
        }
        
        /* --- PHASE 4: MODULAR COSMETICS --- */
        .cosmetic-frame {
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            pointer-events: none;
            z-index: 10;
            border-radius: 20px;
            transition: all 0.3s ease;
        }

        .frame-diamond { box-shadow: inset 0 0 30px rgba(0, 245, 255, 0.8), 0 0 15px rgba(0, 245, 255, 0.4); border: 3px solid #00f5ff; }
        .frame-gold { box-shadow: inset 0 0 30px rgba(255, 215, 0, 0.8), 0 0 15px rgba(255, 215, 0, 0.4); border: 3px solid #ffd700; }
        .frame-cyber { box-shadow: inset 0 0 30px rgba(255, 0, 255, 0.8), 0 0 15px rgba(255, 0, 255, 0.4); border: 3px solid #ff00ff; }
        .frame-hellfire { box-shadow: inset 0 0 40px rgba(255, 50, 0, 0.8), 0 0 20px rgba(255, 50, 0, 0.5); border: 3px solid #ff3200; }

        .cosmetic-aura {
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            pointer-events: none;
            z-index: 1; 
            border-radius: 20px;
        }

        @keyframes auraFire {
            0%, 100% { box-shadow: inset 0 -50px 50px -20px rgba(255, 68, 0, 0.6); }
            50% { box-shadow: inset 0 -60px 60px -10px rgba(255, 100, 0, 0.8); }
        }
        .aura-fire { animation: auraFire 2s infinite alternate; }

        @keyframes auraGlitch {
            0% { box-shadow: inset 0 0 20px rgba(0,255,255,0.5); }
            20% { box-shadow: inset 0 0 20px rgba(255,0,255,0.5); }
            40% { box-shadow: inset -10px 0 30px rgba(0,255,255,0.7); }
            60% { box-shadow: inset 10px 0 30px rgba(255,0,255,0.7); }
            100% { box-shadow: inset 0 0 20px rgba(0,255,255,0.5); }
        }
        .aura-glitch { animation: auraGlitch 0.3s infinite; }

        /* CURRENT AVATAR STYLES */
        .current-avatar {
            display: flex;
            align-items: center;
            gap: 15px;
            padding: 12px 20px;
            background: linear-gradient(145deg, rgba(10, 14, 39, 0.8), rgba(26, 31, 58, 0.9));
            border: 2px solid #00f5ff;
            border-radius: 16px;
            box-shadow: 0 8px 32px rgba(0, 245, 255, 0.2), inset 0 2px 10px rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            transition: all 0.3s ease;
        }
        .current-avatar-img {
            width: 60px; height: 60px;
            border-radius: 50%;
            border: 3px solid #00f5ff;
            box-shadow: 0 0 15px rgba(0, 245, 255, 0.5);
            object-fit: cover;
            background: #000;
        }
        .current-avatar-info { font-family: 'Rajdhani', sans-serif; }
        .current-avatar-label {
            font-size: 12px; color: #00f5ff; text-transform: uppercase;
            letter-spacing: 1px; margin-bottom: 4px; text-shadow: 0 0 5px rgba(0, 245, 255, 0.5);
        }
        .current-avatar-name {
            font-size: 18px; color: #fff; font-weight: 700; text-shadow: 0 2px 4px rgba(0,0,0,0.8);
        }

      `}</style>

      
      {/* SVG Filters for Image Cleanup */}
      <svg style={{ position: 'absolute', width: 0, height: 0 }} aria-hidden="true">
        <filter id="defringe">
          <feMorphology operator="erode" radius="1" in="SourceAlpha" result="ERODED" />
          <feComposite in="SourceGraphic" in2="ERODED" operator="in" />
        </filter>
      </svg>

      {/* TOP SECTION */}
      <div className="top-layout">
        
        {/* LEFT SIDE: CUSTOM AVATARS */}
        <div className="custom-avatars-side">
            <h2 className="section-title">MY CUSTOM {isVip ? 'AVATARS' : 'AVATAR'}</h2>
            <p className="section-subtitle">
              {customAvatars.length}/{maxCustomSlots} Slots Used &bull; Create Up To {maxCustomSlots} Unique AI-Generated Avatar{maxCustomSlots > 1 ? 's' : ''}
            </p>

            <div className="avatar-grid">
              {customSlots.map((customAvatar, index) => (
                customAvatar ? (
                  <TiltCard
                    key={customAvatar.id}
                    className={`avatar-card ${currentAvatar?.type === 'custom' && currentAvatar?.imageUrl === customAvatar.image_url ? 'selected' : ''} ${equippedBurst === customAvatar.image_url ? 'burst-anim' : ''}`}
                    onClick={() => { playSound('click'); setInspectingAvatar({ ...customAvatar, isCustomObj: true, isSelected: currentAvatar?.type === 'custom' && currentAvatar?.imageUrl === customAvatar.image_url }); }}
                  >
                    <div className="screws"></div>
                    {/* Phase 1 Skeleton Loader */}
                    <AvatarMedia src={customAvatar.image_url} alt={`Custom Avatar ${index + 1}`} index={index} frame={customAvatar.equipped_frame} aura={customAvatar.equipped_aura} />

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
                  </TiltCard>
                ) : (
                  <TiltCard
                    key={`placeholder-${index}`}
                    className="avatar-card placeholder"
                    onClick={handleCreateNewCustom}
                  >
                    <div className="screws"></div>
                    <div className="placeholder-content">
                      <div className="placeholder-icon">+</div>
                      <div className="placeholder-text">Create Custom</div>
                    </div>
                  </TiltCard>
                )
              ))}
            </div>
            
            <div style={{ marginTop: '20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                {(() => {
                  const activeCustom = customAvatars.find(a => a.image_url === currentAvatar?.imageUrl);
                  if (!activeCustom) return null;
                  return (
                    <div style={{
                        position: 'relative', width: 48, height: 48, borderRadius: '50%', overflow: 'hidden',
                        border: '2px solid #00f5ff',
                        boxShadow: '0 0 12px rgba(0, 245, 255, 0.4)',
                        flexShrink: 0
                    }}>
                        <div className="screws"></div>
                        <SPImage src={activeCustom.image_url} alt="Active Custom Avatar" fill style={{ objectFit: 'cover' }} />
                    </div>
                  );
                })()}
                <button onClick={handleCreateNewCustom} className="create-custom-btn">
                {isVip ? 'Create Custom Avatar' : 'Create Free AI Avatar'}
                </button>
            </div>
        </div>

        {/* RIGHT SIDE: CURRENT AVATAR */}
        <div className="current-avatar-side">
            {currentAvatar ? (
                <div className="current-avatar">
                    <div style={{ position: 'relative', width: 60, height: 60, flexShrink: 0, animation: 'ambientBreathe 4s ease-in-out infinite', filter: 'drop-shadow(0 5px 10px rgba(0,0,0,0.8))' }}>
                        <AvatarMedia 
                            src={currentAvatar.imageUrl || '/avatars/free/shark.png'} 
                            alt="Current Avatar" 
                            index={0} 
                            frame={currentAvatar.equipped_frame} 
                            aura={currentAvatar.equipped_aura} 
                        />
                    </div>
                    <div className="current-avatar-info">
                        <div className="current-avatar-label">Current Avatar</div>
                        <div className="current-avatar-name">{currentAvatar.name || 'Custom Avatar'}</div>
                    </div>
                </div>
            ) : (
                <div className="current-avatar" style={{ opacity: 0.7 }}>
                    <div className="current-avatar-img" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,245,255,0.05)', fontSize: 24, color: '#00f5ff', textShadow: '0 0 8px rgba(0,245,255,0.6)', border: '3px solid rgba(0,245,255,0.3)' }}>?</div>
                    <div className="current-avatar-info">
                        <div className="current-avatar-label">Current Avatar</div>
                        <div className="current-avatar-name">None Selected</div>
                    </div>
                </div>
            )}
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
                  onClick={() => { playSound('click'); setActiveCategory(cat); }}
                  className={`category-btn ${activeCategory === cat ? 'active' : ''}`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="avatar-grid">
              {avatars
                .filter(av => activeCategory === 'All' || av.category === activeCategory)
                .map((av, index) => {
                  const isSelected = currentAvatar?.id === av.id;
                  return (
                    <TiltCard
                      key={av.id}
                      className={`avatar-card ${isSelected ? 'selected' : ''} ${equippedBurst === av.id ? 'burst-anim' : ''}`}
                      onClick={() => {
                          playSound('click');
                          setInspectingAvatar({ ...av, isSelected });
                      }}
                    >
                      <div className="screws"></div>
                      
                      {/* Phase 1 Skeleton Loader */}
                    <AvatarMedia src={av.image} alt={av.name} index={index} frame={av.equipped_frame} aura={av.equipped_aura} />

                      <div className="avatar-info">
                        <p className="avatar-name">{av.name}</p>
                        <p className="avatar-tier">{av.category}</p>
                      </div>

                      {/* EQUIP OVERLAY */}
                      {!av.isLocked && isSelected && (
                        <div style={{
                          position: 'absolute',
                          top: 0, left: 0, right: 0, bottom: 0,
                          background: 'rgba(0,0,0,0.5)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          zIndex: 5
                        }}>
                          <div style={{
                            padding: '8px 20px',
                            background: 'rgba(0, 255, 0, 0.2)',
                            border: '2px solid #00ff00',
                            borderRadius: '20px',
                            color: '#00ff00',
                            fontFamily: "'Rajdhani', sans-serif",
                            fontWeight: 'bold',
                            fontSize: '14px',
                            textTransform: 'uppercase',
                            boxShadow: '0 0 15px rgba(0,255,0,0.4)',
                            transform: 'translateY(-10px)'
                          }}>
                            EQUIPPED
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
                    </TiltCard>
                  )
                })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
