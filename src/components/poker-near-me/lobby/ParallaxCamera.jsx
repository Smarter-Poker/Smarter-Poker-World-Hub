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
const PARALLAX_STRENGTH_X = 1.2;
const PARALLAX_STRENGTH_Y = 0.6;
// Lerp speed (0-1, lower = smoother/slower)
const LERP_SPEED = 0.04;

/**
 * ParallaxCamera — attaches to the R3F camera and adjusts it every frame.
 */
export function ParallaxCamera() {
  const { camera } = useThree();
  const mouseRef = useRef({ x: 0, y: 0 });
  const targetPos = useRef(new Vector3(0, 5, 7));
  const lookTarget = useRef(new Vector3(0, 0, 0));

  // Mouse tracking
  useEffect(() => {
    const handleMouseMove = (e) => {
      mouseRef.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouseRef.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Device orientation (mobile)
  useEffect(() => {
    const handleOrientation = (e) => {
      if (e.gamma !== null) {
        mouseRef.current.x = Math.max(-1, Math.min(1, e.gamma / 30));
      }
      if (e.beta !== null) {
        mouseRef.current.y = Math.max(-1, Math.min(1, (e.beta - 45) / 30));
      }
    };

    window.addEventListener('deviceorientation', handleOrientation, { passive: true });
    return () => window.removeEventListener('deviceorientation', handleOrientation);
  }, []);

  useFrame(() => {
    const mx = mouseRef.current.x;
    const my = mouseRef.current.y;

    targetPos.current.set(
      mx * PARALLAX_STRENGTH_X,
      5 + my * -PARALLAX_STRENGTH_Y,
      7
    );

    // Smooth lerp camera position
    camera.position.lerp(targetPos.current, LERP_SPEED);

    // Always look at center (with slight offset from mouse for depth)
    lookTarget.current.set(mx * 0.3, 0, my * 0.2);
    camera.lookAt(lookTarget.current);
  });

  return null;
}
