/**
 * Poker OCR Engine - Tesseract.js-based OCR module for reading poker game numbers
 * Pure ES module for extracting numeric data from online poker client screen captures
 * 
 * Features:
 * - Region-based OCR with preprocessing pipeline
 * - Poker number format parsing ($1,234 | 1.2K | 2.5M | etc.)
 * - Image preprocessing: grayscale, contrast enhancement, adaptive thresholding, scaling, sharpening
 * - Caching with pixel checksum change detection
 * - Confidence scoring with 70% threshold
 * - Graceful degradation for missing Tesseract
 */

/**
 * Calculates a simple checksum for a region of pixels to detect changes
 * Uses a sampling approach for performance
 * @param {ImageData} imageData - The image data object
 * @param {number} stride - Sampling stride (1 = every pixel, 2 = every other, etc.)
 * @returns {number} Checksum value
 */
function regionChecksum(imageData, stride = 4) {
  const data = imageData.data;
  let checksum = 0;
  let count = 0;
  
  for (let i = 0; i < data.length; i += stride * 4) {
    checksum = ((checksum << 5) - checksum) + data[i];
    checksum = checksum & checksum; // Convert to 32-bit integer
    count++;
  }
  
  return Math.abs(checksum);
}

/**
 * Preprocesses an image region for optimal OCR recognition
 * Pipeline: grayscale → contrast enhancement → adaptive thresholding → scaling → sharpening
 * @param {Canvas} canvas - Canvas with the region image
 * @returns {ImageData} Preprocessed image data
 */
function preprocessForOCR(canvas) {
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  
  // Step 1: Grayscale conversion with weighted average
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    data[i] = gray;
    data[i + 1] = gray;
    data[i + 2] = gray;
  }
  
  // Step 2: Calculate histogram and apply contrast enhancement
  const histogram = new Array(256).fill(0);
  for (let i = 0; i < data.length; i += 4) {
    histogram[data[i]]++;
  }
  
  // Find min/max non-zero bins for contrast stretching
  let minBin = 0, maxBin = 255;
  for (let i = 0; i < 256; i++) {
    if (histogram[i] > 0) {
      minBin = i;
      break;
    }
  }
  for (let i = 255; i >= 0; i--) {
    if (histogram[i] > 0) {
      maxBin = i;
      break;
    }
  }
  
  const range = maxBin - minBin || 1;
  for (let i = 0; i < data.length; i += 4) {
    const stretched = ((data[i] - minBin) / range) * 255;
    data[i] = Math.round(Math.max(0, Math.min(255, stretched)));
    data[i + 1] = data[i];
    data[i + 2] = data[i];
  }
  
  // Step 3: Adaptive thresholding with local window
  const width = canvas.width;
  const height = canvas.height;
  const windowSize = Math.floor(Math.min(width, height) * 0.1) || 3;
  const half = Math.floor(windowSize / 2);
  const tempData = new Uint8ClampedArray(data);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;
      
      for (let wy = Math.max(0, y - half); wy <= Math.min(height - 1, y + half); wy++) {
        for (let wx = Math.max(0, x - half); wx <= Math.min(width - 1, x + half); wx++) {
          sum += tempData[(wy * width + wx) * 4];
          count++;
        }
      }
      
      const localMean = sum / count;
      const idx = (y * width + x) * 4;
      const threshold = localMean > 127 ? 255 : 0;
      data[idx] = threshold;
      data[idx + 1] = threshold;
      data[idx + 2] = threshold;
    }
  }
  
  // Step 4: Scale up the image for better OCR accuracy
  const scaleFactor = Math.min(4, Math.max(2, Math.floor(400 / Math.min(width, height))));
  if (scaleFactor > 1) {
    const scaledCanvas = document.createElement('canvas');
    scaledCanvas.width = width * scaleFactor;
    scaledCanvas.height = height * scaleFactor;
    const scaledCtx = scaledCanvas.getContext('2d');
    
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    tempCanvas.getContext('2d').putImageData(imageData, 0, 0);
    
    scaledCtx.imageSmoothingEnabled = false;
    scaledCtx.drawImage(tempCanvas, 0, 0, width, height, 0, 0, width * scaleFactor, height * scaleFactor);
    
    return scaledCtx.getImageData(0, 0, scaledCanvas.width, scaledCanvas.height);
  }
  
  // Step 5: Sharpening kernel (3x3 unsharp mask)
  const sharpened = new Uint8ClampedArray(data);
  const kernel = [
    -1, -1, -1,
    -1, 16, -1,
    -1, -1, -1
  ];
  const divisor = 8;
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let sum = 0;
      let kernelIdx = 0;
      
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const idx = ((y + ky) * width + (x + kx)) * 4;
          sum += tempData[idx] * kernel[kernelIdx];
          kernelIdx++;
        }
      }
      
      const idx = (y * width + x) * 4;
      const value = Math.max(0, Math.min(255, Math.round(sum / divisor)));
      sharpened[idx] = value;
      sharpened[idx + 1] = value;
      sharpened[idx + 2] = value;
    }
  }
  
  imageData.data.set(sharpened);
  return imageData;
}

/**
 * Parses poker number formats: $1,234 | 1.2K | 2.5M | 1,234 | 1234
 * @param {string} text - Raw OCR text
 * @returns {number|null} Parsed number or null if invalid
 */
function parsePokerNumber(text) {
  if (!text || typeof text !== 'string') return null;
  
  text = text.trim().toUpperCase();
  
  // Remove spaces
  text = text.replace(/\s+/g, '');
  
  // Pattern 1: Currency with commas ($1,234.56)
  const currencyMatch = text.match(/^\$?([\d,]+\.?\d*)/);
  if (currencyMatch) {
    const numStr = currencyMatch[1].replace(/,/g, '');
    const num = parseFloat(numStr);
    if (!isNaN(num) && isFinite(num)) return num;
  }
  
  // Pattern 2: Thousands suffix (1.2K, 2.5M, 1.5B)
  const suffixMatch = text.match(/^([\d.]+)\s*([KMB])$/);
  if (suffixMatch) {
    const num = parseFloat(suffixMatch[1]);
    const suffix = suffixMatch[2];
    if (!isNaN(num) && isFinite(num)) {
      const multipliers = { K: 1000, M: 1000000, B: 1000000000 };
      return num * (multipliers[suffix] || 1);
    }
  }
  
  // Pattern 3: Plain number with or without commas (1,234)
  const plainMatch = text.match(/^([\d,]+\.?\d*)$/);
  if (plainMatch) {
    const numStr = plainMatch[1].replace(/,/g, '');
    const num = parseFloat(numStr);
    if (!isNaN(num) && isFinite(num)) return num;
  }
  
  // Pattern 4: Decimal number (1.23)
  const decimalMatch = text.match(/^([\d.]+)$/);
  if (decimalMatch) {
    const num = parseFloat(decimalMatch[1]);
    if (!isNaN(num) && isFinite(num)) return num;
  }
  
  return null;
}

/**
 * Parses blind level from text (e.g., "1/2", "2/5", "100/200")
 * @param {string} text - Raw OCR text
 * @returns {object|null} {smallBlind, bigBlind} or null if invalid
 */
function parseBlindLevel(text) {
  if (!text || typeof text !== 'string') return null;
  
  text = text.trim();
  
  // Match patterns like "1/2", "2/5", "100/200", "$1/$2"
  const match = text.match(/^\$?([\d.]+)\s*\/\s*\$?([\d.]+)$/);
  if (match) {
    const smallBlind = parseFloat(match[1]);
    const bigBlind = parseFloat(match[2]);
    
    if (!isNaN(smallBlind) && !isNaN(bigBlind) && isFinite(smallBlind) && isFinite(bigBlind)) {
      return { smallBlind, bigBlind };
    }
  }
  
  return null;
}

/**
 * Main PokerOCR class - Handles OCR initialization and region-based reading
 */
class PokerOCR {
  constructor(clientProfile = null) {
    this.clientProfile = clientProfile || {};
    this.tesseract = null;
    this.isInitialized = false;
    this.isInitializing = false;
    this.cache = new Map();
    this.debounceTimers = new Map();
    this.lastChecksums = new Map();
    // Persistent worker pool — avoids creating+terminating a worker per OCR call.
    // Tesseract worker init takes 200-400ms, so reusing them is critical for perf.
    this._worker = null;
    this._workerReady = false;
    this._workerBusy = false;
  }
  
  /**
   * Initialize Tesseract.js from CDN with fallbacks
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.isInitialized) return;
    if (this.isInitializing) {
      // Wait for ongoing initialization
      return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (this.isInitialized) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);
      });
    }
    
    this.isInitializing = true;
    
    try {
      // Try to load Tesseract from global scope
      if (typeof Tesseract === 'undefined') {
        // Load from CDN
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
        script.async = true;
        
        await new Promise((resolve, reject) => {
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('Failed to load Tesseract.js from CDN'));
          document.head.appendChild(script);
        });
      }
      
      if (typeof Tesseract === 'undefined') {
        throw new Error('Tesseract.js not available after loading');
      }
      
      this.tesseract = Tesseract;
      this.isInitialized = true;
    } catch (error) {
      console.warn('Tesseract.js initialization failed:', error);
      this.tesseract = null;
      this.isInitialized = false;
      throw error;
    } finally {
      this.isInitializing = false;
    }
  }
  
  /**
   * Read OCR text from a canvas region with preprocessing
   * @param {Canvas} canvas - Canvas element containing the region image
   * @param {object} options - {language: 'eng', minConfidence: 0.7, debounce: 300}
   * @returns {Promise<object>} {text, confidence, raw}
   */
  async readRegion(canvas, options = {}) {
    if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
      throw new Error('Invalid canvas element provided');
    }

    const { language = 'eng', minConfidence = 0.7, debounce = 300 } = options;
    // CRITICAL: the cache key must be unique per logical region, otherwise
    // every region in the HUD clobbers the others' debounce timer and
    // checksum cache. Callers should pass `options.cacheKey` (e.g. 'pot',
    // 'heroStack'); fall back to a size-based key only for ad-hoc usage.
    const cacheKey = options.cacheKey
      || canvas.dataset?.regionKey
      || canvas.id
      || `anon_${canvas.width}x${canvas.height}`;
    
    // Debounce repeated calls
    if (this.debounceTimers.has(cacheKey)) {
      clearTimeout(this.debounceTimers.get(cacheKey));
    }
    
    return new Promise((resolve) => {
      const timer = setTimeout(async () => {
        try {
          // Check if region has changed
          const imageData = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
          const checksum = regionChecksum(imageData);
          
          if (this.lastChecksums.has(cacheKey) && this.lastChecksums.get(cacheKey) === checksum) {
            if (this.cache.has(cacheKey)) {
              resolve(this.cache.get(cacheKey));
              return;
            }
          }
          
          this.lastChecksums.set(cacheKey, checksum);
          
          // Preprocess image — reuse a cached canvas to avoid allocs
          if (!this._prepCanvas) {
            this._prepCanvas = document.createElement('canvas');
          }
          const tempCanvas = this._prepCanvas;
          if (tempCanvas.width !== canvas.width || tempCanvas.height !== canvas.height) {
            tempCanvas.width = canvas.width;
            tempCanvas.height = canvas.height;
          }
          const tempCtx = tempCanvas.getContext('2d');
          tempCtx.clearRect(0, 0, canvas.width, canvas.height);
          tempCtx.drawImage(canvas, 0, 0);
          
          const processed = preprocessForOCR(tempCanvas);
          tempCtx.putImageData(processed, 0, 0);
          
          // Ensure Tesseract is initialized
          if (!this.isInitialized) {
            await this.initialize();
          }

          if (!this.tesseract) {
            throw new Error('Tesseract.js is not available');
          }

          // Reuse persistent worker — creating one per call is ~300ms overhead
          if (!this._worker || !this._workerReady) {
            try {
              this._worker = await this.tesseract.createWorker(language);
              this._workerReady = true;
            } catch (workerErr) {
              this._worker = null;
              this._workerReady = false;
              throw workerErr;
            }
          }

          // Run OCR on persistent worker
          const result = await this._worker.recognize(tempCanvas);
          
          const text = (result.data.text || '').trim();
          const confidence = result.data.confidence || 0;
          
          const output = {
            text,
            confidence,
            raw: result.data,
            meetsThreshold: confidence >= (minConfidence * 100)
          };
          
          this.cache.set(cacheKey, output);
          resolve(output);
        } catch (error) {
          resolve({
            text: '',
            confidence: 0,
            raw: null,
            meetsThreshold: false,
            error: error.message
          });
        } finally {
          this.debounceTimers.delete(cacheKey);
        }
      }, debounce);
      
      this.debounceTimers.set(cacheKey, timer);
    });
  }
  
  /**
   * Read pot size from a region
   * @param {Canvas} canvas - Canvas with pot size region
   * @returns {Promise<object>} {value, text, confidence}
   */
  async readPotSize(canvas, options = {}) {
    const result = await this.readRegion(canvas, { cacheKey: 'pot', ...options });
    const value = parsePokerNumber(result.text);
    
    return {
      value,
      text: result.text,
      confidence: result.confidence,
      meetsThreshold: result.meetsThreshold,
      raw: result.raw
    };
  }
  
  /**
   * Read bet amounts from a region
   * @param {Canvas} canvas - Canvas with bet amounts region
   * @returns {Promise<object>} {value, text, confidence}
   */
  async readBetAmounts(canvas, options = {}) {
    const result = await this.readRegion(canvas, { cacheKey: 'betAmount', ...options });
    const value = parsePokerNumber(result.text);
    
    return {
      value,
      text: result.text,
      confidence: result.confidence,
      meetsThreshold: result.meetsThreshold,
      raw: result.raw
    };
  }
  
  /**
   * Read stack sizes from a region
   * @param {Canvas} canvas - Canvas with stack sizes region
   * @returns {Promise<object>} {value, text, confidence}
   */
  async readStackSizes(canvas, options = {}) {
    const result = await this.readRegion(canvas, { cacheKey: 'stack', ...options });
    const value = parsePokerNumber(result.text);
    
    return {
      value,
      text: result.text,
      confidence: result.confidence,
      meetsThreshold: result.meetsThreshold,
      raw: result.raw
    };
  }
  
  /**
   * Read blind level from a region
   * @param {Canvas} canvas - Canvas with blind level region
   * @returns {Promise<object>} {smallBlind, bigBlind, text, confidence}
   */
  async readBlindLevel(canvas, options = {}) {
    const result = await this.readRegion(canvas, { cacheKey: 'blindLevel', ...options });
    const blinds = parseBlindLevel(result.text);
    
    return {
      smallBlind: blinds?.smallBlind || null,
      bigBlind: blinds?.bigBlind || null,
      text: result.text,
      confidence: result.confidence,
      meetsThreshold: result.meetsThreshold,
      raw: result.raw
    };
  }
  
  /**
   * Clean up resources and clear caches
   */
  destroy() {
    this.cache.clear();
    this.lastChecksums.clear();

    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    // Terminate the persistent worker to free WASM memory
    if (this._worker) {
      try { this._worker.terminate(); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
      this._worker = null;
      this._workerReady = false;
    }

    this.tesseract = null;
    this.isInitialized = false;
    this.isInitializing = false;
  }
}

// Export as ES module
export default PokerOCR;
export { parsePokerNumber, parseBlindLevel };
