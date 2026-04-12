/**
 * Poker Brain — OCR Loop Module
 * ============================================
 * Extracts OCR processing into a pure, testable module.
 * Takes a video frame and executes all OCR reads against the engine,
 * returning a unified results object. Let the caller handle the React
 * state updates.
 */

function scaleRect(region, scaleX, scaleY) {
  return {
    x: Math.round(region.x * scaleX),
    y: Math.round(region.y * scaleY),
    w: Math.round(region.w * scaleX),
    h: Math.round(region.h * scaleY),
  };
}

// cropToCanvas creates a per-call canvas because OCR regions are processed in
// parallel via Promise.all — a shared canvas would be overwritten by the next
// crop before the async OCR engine finishes reading the previous one.
function cropToCanvas(sourceCanvas, rect) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.floor(rect.w));
  c.height = Math.max(1, Math.floor(rect.h));
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(
    sourceCanvas,
    Math.max(0, Math.floor(rect.x)),
    Math.max(0, Math.floor(rect.y)),
    c.width,
    c.height,
    0,
    0,
    c.width,
    c.height
  );
  return c;
}

/**
 * Execute a complete OCR pass over all defined regions.
 * @param {HTMLVideoElement|HTMLCanvasElement} video 
 * @param {object} layout 
 * @param {object} ocrEngine 
 * @returns {Promise<object>} Results object with all parsed values
 */
export async function execOcrPass(video, layout, ocrEngine) {
  if (!video || !ocrEngine || !layout.ocrRegions) {
    return null;
  }

  const srcW = video.videoWidth || video.width;
  const srcH = video.videoHeight || video.height;

  if (!srcW || !srcH) {
    return null;
  }

  const refW = layout.referenceSize.w;
  const refH = layout.referenceSize.h;
  const sx = srcW / refW;
  const sy = srcH / refH;

  // Draw the full frame once into a reusable canvas
  if (!execOcrPass._fullCanvas) {
    execOcrPass._fullCanvas = document.createElement('canvas');
    execOcrPass._fullCtx = null;
  }
  const full = execOcrPass._fullCanvas;
  if (full.width !== srcW || full.height !== srcH) {
    full.width = srcW;
    full.height = srcH;
    execOcrPass._fullCtx = null; // context invalidated by resize
  }
  if (!execOcrPass._fullCtx) {
    execOcrPass._fullCtx = full.getContext('2d', { willReadFrequently: true });
  }
  execOcrPass._fullCtx.drawImage(video, 0, 0, srcW, srcH);

  const run = async (name, method, opts = {}) => {
    const raw = layout.ocrRegions[name];
    if (!raw) return null;
    const rect = scaleRect(raw, sx, sy);
    const crop = cropToCanvas(full, rect);
    try {
      return await ocrEngine[method](crop, { cacheKey: name, ...opts });
    } catch (err) {
      return null;
    }
  };

  const results = {};

  // Fire and wait for all OCR promises to resolve
  // The engine debounces internally so parallel execution is safe.
  const promises = [];

  promises.push(run('pot', 'readPotSize').then(r => {
    if (r && typeof r.value === 'number') results.potSize = r.value;
  }));

  promises.push(run('heroStack', 'readStackSizes').then(r => {
    if (r && typeof r.value === 'number') results.heroStack = r.value;
  }));

  promises.push(run('blindLevel', 'readBlindLevel').then(r => {
    if (r && r.bigBlind) results.bigBlind = r.bigBlind;
    if (r && r.smallBlind) results.smallBlind = r.smallBlind;
  }));

  promises.push(run('currentBet', 'readBetAmounts').then(r => {
    if (r && typeof r.value === 'number' && r.value >= 0) results.betToCall = r.value;
  }));

  if (layout.ocrRegions.handStrength && typeof ocrEngine.readRegion === 'function') {
    promises.push(run('handStrength', 'readRegion').then(r => {
      if (r && r.text) results.handStrength = r.text;
    }));
  }

  if (layout.ocrRegions.gameVariant && typeof ocrEngine.readRegion === 'function') {
    promises.push(run('gameVariant', 'readRegion').then(r => {
      if (r && r.text && r.meetsThreshold) {
        const t = String(r.text).toUpperCase();
        if (t.includes('PLO6') || t.includes('PLO 6') || t.includes('6-CARD')) results.gameVariant = 'plo6';
        else if (t.includes('PLO5') || t.includes('PLO 5') || t.includes('5-CARD')) results.gameVariant = 'plo5';
        else if (t.includes('HI-LO') || t.includes('HI/LO') || t.includes('HILO') || t.includes('8 OR BETTER') || t.includes('PLO8')) results.gameVariant = 'plo_hilo';
        else if (t.includes('PLO') || t.includes('OMAHA')) results.gameVariant = 'plo';
        else if (t.includes('NLH') || t.includes("HOLD'EM") || t.includes('HOLDEM') || t.includes('TEXAS')) results.gameVariant = 'nlhe';
      }
    }));
  }

  if (layout.ocrRegions.heroName && typeof ocrEngine.readRegion === 'function') {
    promises.push(run('heroName', 'readRegion').then(r => {
      if (r && r.text) results.heroName = r.text;
    }));
  }

  const villainStacks = {};
  ['seat1Stack', 'seat2Stack', 'seat3Stack', 'seat4Stack', 'seat5Stack',
   'seat6Stack', 'seat7Stack', 'seat8Stack'].forEach((seatKey) => {
    if (layout.ocrRegions[seatKey]) {
      promises.push(run(seatKey, 'readStackSizes').then(r => {
        if (r && typeof r.value === 'number') {
          villainStacks[seatKey] = r.value;
        }
      }));
    }
  });

  await Promise.all(promises);

  // Always include villainStacks (even if empty) so callers don't need
  // existence checks — they can rely on the field being present.
  results.villainStacks = villainStacks;

  return results;
}

export default execOcrPass;
