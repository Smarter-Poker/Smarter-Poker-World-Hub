/**
 * ParallaxCamera.jsx — Reactive camera controller.
 *
 * Tracks mouse position (desktop) or device orientation (mobile)
 * and smoothly adjusts the camera's lookAt/position to create
 * a subtle parallax depth effect.
 */

import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';

// How much the camera shifts (in world units)
const PARALLAX_STRENGTH_X = 1.5;
const PARALLAX_STRENGTH_Y = 0.8;
// Lerp speed (0-1, lower = smoother/slower)
const LERP_SPEED = 0.04;
// Base camera position — lower and further back for better pod face visibility
const BASE_Y = 4.0;
const BASE_Z = 9.0;

/**
 * ParallaxCamera — attaches to the R3F camera and adjusts it every frame.
 */
export function ParallaxCamera() {
  const { camera } = useThree();
  const mouseRef = useRef({ x: 0, y: 0 });
  const targetPos = useRef(new Vector3(0, BASE_Y, BASE_Z));
  const lookTarget = useRef(new Vector3(0, 0, 0));

  // Consolidated event listeners — mouse, touch, and device orientation
  useEffect(() => {
    const handleMouseMove = (e) => {
      let x = (e.clientX / window.innerWidth) * 2 - 1;
      let y = (e.clientY / window.innerHeight) * 2 - 1;
      mouseRef.current.x = Math.max(-1, Math.min(1, x));
      mouseRef.current.y = Math.max(-1, Math.min(1, y));
    };

    const handleTouchMove = (e) => {
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        let x = (touch.clientX / window.innerWidth) * 2 - 1;
        let y = (touch.clientY / window.innerHeight) * 2 - 1;
        mouseRef.current.x = Math.max(-1, Math.min(1, x));
        mouseRef.current.y = Math.max(-1, Math.min(1, y));
      }
    };

    const handleOrientation = (e) => {
      if (typeof DeviceOrientationEvent !== 'undefined') {
        if (e.gamma !== null) {
          mouseRef.current.x = Math.max(-1, Math.min(1, e.gamma / 30));
        }
        if (e.beta !== null) {
          mouseRef.current.y = Math.max(-1, Math.min(1, (e.beta - 45) / 30));
        }
      }
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    if (typeof DeviceOrientationEvent !== 'undefined') {
      window.addEventListener('deviceorientation', handleOrientation, { passive: true });
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchmove', handleTouchMove);
      if (typeof DeviceOrientationEvent !== 'undefined') {
        window.removeEventListener('deviceorientation', handleOrientation);
      }
    };
  }, []);

  useFrame(() => {
    const mx = mouseRef.current.x;
    const my = mouseRef.current.y;

    targetPos.current.set(
      mx * PARALLAX_STRENGTH_X,
      BASE_Y + my * -PARALLAX_STRENGTH_Y,
      BASE_Z
    );

    // Smooth lerp camera position
    camera.position.lerp(targetPos.current, LERP_SPEED);

    // Always look at center (with slight offset from mouse for depth)
    lookTarget.current.set(mx * 0.3, 0, my * 0.2);
    camera.lookAt(lookTarget.current);
  });

  return null;
}
