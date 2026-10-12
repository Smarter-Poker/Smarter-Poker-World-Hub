import { useEffect, useRef } from 'react';
import { createNativeReelVisibility } from '../lib/nativeReelVisibility.mjs';

export function useNativeReelVisibility(videoRef, identity) {
  const identityRef = useRef(identity);
  identityRef.current = identity;
  useEffect(() => createNativeReelVisibility({
    getVideo: () => videoRef.current,
    getIdentity: () => identityRef.current,
    document,
    window,
  }), [videoRef, identity]);
}
