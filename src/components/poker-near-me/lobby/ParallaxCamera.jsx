/**
 * ParallaxCamera.jsx — Cinematic camera controller with auto-orbit.
 *
 * Phase 2 upgrade:
 *   - Auto-orbit when idle (no user input for 5 seconds)
 *   - Smooth transition between user control and auto-orbit
 *   - Camera "breathing" — subtle FOV micro-oscillation
 *   - Cinematic drift with eased return
 *   - Touch, mouse, and device orientation support
 */

import { useRef, useEffect, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';

// ─── Configuration ───
const PARALLAX_STRENGTH_X = 1.5;
const PARALLAX_STRENGTH_Y = 0.8;
const LERP_SPEED = 0.035;
const AUTO_ORBIT_LERP = 0.015; // Slower lerp for cinematic auto-orbit
const IDLE_TIMEOUT = 5.0; // Seconds before auto-orbit kicks in
const ORBIT_SPEED = 0.08; // Radians/sec for auto-orbit
const ORBIT_RADIUS_X = 2.0; // Horizontal orbit amplitude
const ORBIT_RADIUS_Y = 0.6; // Vertical orbit amplitude
const BREATH_AMPLITUDE = 0.15; // FOV breathing amplitude
const BREATH_SPEED = 0.3; // FOV breathing speed
const BASE_Y = 4.0;
const BASE_Z = 9.0;
const BASE_FOV = 48;

/**
 * ParallaxCamera — cinematic camera with parallax + auto-orbit.
 */
export function ParallaxCamera() {
  const { camera } = useThree();
  const mouseRef = useRef({ x: 0, y: 0 });
  const targetPos = useRef(new Vector3(0, BASE_Y, BASE_Z));
  const lookTarget = useRef(new Vector3(0, 0, 0));
  const lastInteractionRef = useRef(0); // timestamp of last user input
  const isIdleRef = useRef(true);
  const orbitPhaseRef = useRef(0);

  // Mark user interaction
  const markInteraction = useCallback(() => {
    lastInteractionRef.current = performance.now() / 1000;
    isIdleRef.current = false;
  }, []);

  // Consolidated event listeners — mouse, touch, device orientation
  useEffect(() => {
    const handleMouseMove = (e) => {
      let x = (e.clientX / window.innerWidth) * 2 - 1;
      let y = (e.clientY / window.innerHeight) * 2 - 1;
      mouseRef.current.x = Math.max(-1, Math.min(1, x));
      mouseRef.current.y = Math.max(-1, Math.min(1, y));
      markInteraction();
    };

    const handleTouchMove = (e) => {
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        let x = (touch.clientX / window.innerWidth) * 2 - 1;
        let y = (touch.clientY / window.innerHeight) * 2 - 1;
        mouseRef.current.x = Math.max(-1, Math.min(1, x));
        mouseRef.current.y = Math.max(-1, Math.min(1, y));
        markInteraction();
      }
    };

    const handleOrientation = (e) => {
      if (e.gamma !== null) {
        mouseRef.current.x = Math.max(-1, Math.min(1, e.gamma / 30));
        markInteraction();
      }
      if (e.beta !== null) {
        mouseRef.current.y = Math.max(-1, Math.min(1, (e.beta - 45) / 30));
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
  }, [markInteraction]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const now = performance.now() / 1000;
    const timeSinceInput = now - lastInteractionRef.current;

    // ─── Idle detection ───
    const wasIdle = isIdleRef.current;
    isIdleRef.current = timeSinceInput > IDLE_TIMEOUT;

    // ─── Auto-orbit phase ───
    if (isIdleRef.current) {
      orbitPhaseRef.current += ORBIT_SPEED * (1 / 60); // ~60fps step
    }

    // ─── Blend factor: 0 = full user control, 1 = full auto-orbit ───
    // Smooth ramp up over 2 seconds after going idle
    const idleDuration = Math.max(0, timeSinceInput - IDLE_TIMEOUT);
    const autoBlend = Math.min(1, idleDuration / 2.0);

    // ─── User-controlled target ───
    const mx = mouseRef.current.x;
    const my = mouseRef.current.y;
    const userX = mx * PARALLAX_STRENGTH_X;
    const userY = BASE_Y + my * -PARALLAX_STRENGTH_Y;

    // ─── Auto-orbit target ───
    const orbitT = orbitPhaseRef.current;
    const autoX = Math.sin(orbitT) * ORBIT_RADIUS_X;
    const autoY = BASE_Y + Math.sin(orbitT * 0.7) * ORBIT_RADIUS_Y;
    const autoZ = BASE_Z + Math.cos(orbitT * 0.5) * 0.8;

    // ─── Blend between user and auto-orbit ───
    const blendX = userX * (1 - autoBlend) + autoX * autoBlend;
    const blendY = userY * (1 - autoBlend) + autoY * autoBlend;
    const blendZ = BASE_Z * (1 - autoBlend) + autoZ * autoBlend;

    targetPos.current.set(blendX, blendY, blendZ);

    // ─── Lerp speed adapts: faster for user input, slower for auto-orbit ───
    const currentLerp = LERP_SPEED * (1 - autoBlend) + AUTO_ORBIT_LERP * autoBlend;
    camera.position.lerp(targetPos.current, currentLerp);

    // ─── Look target — slight offset from mouse, center during auto-orbit ───
    const lookX = mx * 0.3 * (1 - autoBlend) + Math.sin(orbitT * 0.3) * 0.2 * autoBlend;
    const lookY = 0;
    const lookZ = my * 0.2 * (1 - autoBlend) + Math.cos(orbitT * 0.2) * 0.15 * autoBlend;
    lookTarget.current.set(lookX, lookY, lookZ);
    camera.lookAt(lookTarget.current);

    // ─── Camera breathing — subtle FOV oscillation ───
    camera.fov = BASE_FOV + Math.sin(t * BREATH_SPEED) * BREATH_AMPLITUDE;
    camera.updateProjectionMatrix();
  });

  return null;
}
