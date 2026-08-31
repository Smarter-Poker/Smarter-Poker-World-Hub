import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';

export default function ImageCropModal({ file, onCropComplete, onCancel }) {
  const [imgSrc, setImgSrc] = useState(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  
  const containerRef = useRef(null);
  const imgRef = useRef(null);

  useEffect(() => {
    if (!file) return;
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => setImgSrc(reader.result);
  }, [file]);

  const handlePointerDown = (e) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX || e.touches?.[0]?.clientX, y: e.clientY || e.touches?.[0]?.clientY });
  };

  const handlePointerMove = (e) => {
    if (!isDragging) return;
    const clientX = e.clientX || e.touches?.[0]?.clientX;
    const clientY = e.clientY || e.touches?.[0]?.clientY;
    
    if (clientX === undefined) return;

    const dx = clientX - dragStart.x;
    const dy = clientY - dragStart.y;
    
    setPosition(p => ({ x: p.x + dx, y: p.y + dy }));
    setDragStart({ x: clientX, y: clientY });
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e) => {
    e.preventDefault();
    setScale(s => Math.min(Math.max(s - e.deltaY * 0.005, 0.5), 4));
  };

  const cropImage = () => {
    if (!imgRef.current || !containerRef.current) return;
    
    const canvas = document.createElement('canvas');
    const container = containerRef.current.getBoundingClientRect();
    const imgBound = imgRef.current.getBoundingClientRect();

    canvas.width = container.width;
    canvas.height = container.height;
    const ctx = canvas.getContext('2d');

    // Calculate source bounds relative to native image size
    const image = imgRef.current;
    const scaleRatioX = image.naturalWidth / imgBound.width;
    const scaleRatioY = image.naturalHeight / imgBound.height;

    const srcX = (container.left - imgBound.left) * scaleRatioX;
    const srcY = (container.top - imgBound.top) * scaleRatioY;
    const srcW = container.width * scaleRatioX;
    const srcH = container.height * scaleRatioY;

    ctx.drawImage(
      image,
      srcX, srcY, srcW, srcH,
      0, 0, container.width, container.height
    );

    const base64 = canvas.toDataURL('image/jpeg', 0.85);
    onCropComplete(base64.split(',')[1]); // return just the raw base64 string
  };

  if (!imgSrc) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(5,5,10,0.95)', zIndex: 99999,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
    }}>
      <div style={{
        background: '#18191a', border: '1px solid #3E4042', borderRadius: 12, overflow: 'hidden',
        width: '90%', maxWidth: 500, padding: 16
      }}>
        <div style={{ color: '#fff', fontSize: 16, fontWeight: 700, marginBottom: 8, textAlign: 'center' }}>
          Frame Your Poker Hand
        </div>
        <div style={{ color: '#B0B3B8', fontSize: 12, marginBottom: 16, textAlign: 'center' }}>
          Drag To Pan, Use Mouse Wheel To Zoom. Ensure Hole Cards And Board Are Visible.
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <div 
            ref={containerRef}
            style={{
              width: 320, height: 320, border: '2px dashed #4facfe', borderRadius: 8,
              position: 'relative', overflow: 'hidden', cursor: isDragging ? 'grabbing' : 'grab',
              background: '#0a0a0a'
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onTouchStart={handlePointerDown}
            onTouchMove={handlePointerMove}
            onTouchEnd={handlePointerUp}
            onWheel={handleWheel}
          >
            <img 
              ref={imgRef}
              src={imgSrc}
              alt="Crop target"
              draggable={false}
              style={{
                position: 'absolute',
                transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                transformOrigin: '0 0',
                willChange: 'transform'
              }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <motion.button
            whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
            onClick={onCancel}
            style={{
              padding: '10px 20px', borderRadius: 8, border: '1px solid #3E4042',
              background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer'
            }}
          >
            Cancel
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
            onClick={cropImage}
            style={{
              padding: '10px 20px', borderRadius: 8, border: 'none',
              background: 'linear-gradient(135deg, #4facfe, #00f2fe)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer'
            }}
          >
            Confirm & Scan
          </motion.button>
        </div>
      </div>
    </div>
  );
}
