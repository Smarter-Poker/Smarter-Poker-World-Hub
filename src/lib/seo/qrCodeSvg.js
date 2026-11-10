/**
 * qrCodeSvg.js
 * ============================================================================
 * Deterministic Zero-Dependency ISO/IEC 18004 QR Code SVG Generator (Versions 1-6,
 * Error Correction Level L, Byte Mode, Mask Pattern 0) for canonical
 * https://smarter.poker/... rulebook & tool URLs.
 *
 * Produces a genuinely scannable ISO/IEC 18004 QR matrix with finder patterns,
 * timing patterns, alignment patterns, format information bits (BCH(15,5)),
 * and GF(256) Reed-Solomon error correction codewords.
 */

// Version 1-6 parameters for Error Correction Level L (single block):
// totalCodewords, dataCodewords, ecCodewords, size, alignmentCenters
const QR_VERSIONS_L = [
  null,
  { version: 1, size: 21, total: 26, data: 19, ec: 7, align: [] },
  { version: 2, size: 25, total: 44, data: 34, ec: 10, align: [6, 18] },
  { version: 3, size: 29, total: 70, data: 55, ec: 15, align: [6, 22] },
  { version: 4, size: 33, total: 100, data: 80, ec: 20, align: [6, 26] },
  { version: 5, size: 37, total: 134, data: 108, ec: 26, align: [6, 30] },
  { version: 6, size: 41, total: 172, data: 136, ec: 18, blocks: 2, align: [6, 34] },
];

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
})();

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsGeneratorPoly(degree) {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i += 1) {
    const next = new Uint8Array(poly.length + 1);
    const root = GF_EXP[i];
    for (let j = 0; j < poly.length; j += 1) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], root);
    }
    poly = next;
  }
  return poly;
}

function rsEncode(dataBytes, ecDegree) {
  const gen = rsGeneratorPoly(ecDegree);
  const msg = new Uint8Array(dataBytes.length + ecDegree);
  msg.set(dataBytes, 0);
  for (let i = 0; i < dataBytes.length; i += 1) {
    const coef = msg[i];
    if (coef !== 0) {
      for (let j = 0; j < gen.length; j += 1) {
        msg[i + j] ^= gfMul(gen[j], coef);
      }
    }
  }
  return msg.slice(dataBytes.length);
}

function selectVersion(byteLen) {
  // Byte mode overhead: 4 bits mode (0100) + 8 bits length + 4 bits terminator = 2 bytes
  for (let v = 1; v <= 5; v += 1) {
    const info = QR_VERSIONS_L[v];
    if (byteLen + 2 <= info.data) return info;
  }
  return QR_VERSIONS_L[5];
}

function encodeDataCodewords(text, versionInfo) {
  const rawBytes = Buffer.from(String(text || ''), 'utf8');
  const maxPayload = versionInfo.data - 2;
  const bytes = rawBytes.length > maxPayload ? rawBytes.subarray(0, maxPayload) : rawBytes;

  const bits = [];
  const pushBits = (val, len) => {
    for (let i = len - 1; i >= 0; i -= 1) {
      bits.push((val >> i) & 1);
    }
  };

  // Mode indicator: Byte mode = 0100
  pushBits(0b0100, 4);
  // Character count indicator (8 bits for versions 1-9 in byte mode)
  pushBits(bytes.length, 8);
  for (let i = 0; i < bytes.length; i += 1) {
    pushBits(bytes[i], 8);
  }
  // Terminator up to 4 bits
  const maxBits = versionInfo.data * 8;
  const termLen = Math.min(4, maxBits - bits.length);
  pushBits(0, termLen);
  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  const codewords = new Uint8Array(versionInfo.data);
  for (let i = 0; i < bits.length / 8; i += 1) {
    let b = 0;
    for (let j = 0; j < 8; j += 1) {
      b = (b << 1) | bits[i * 8 + j];
    }
    codewords[i] = b;
  }

  let padIndex = bits.length / 8;
  const pads = [0xec, 0x11];
  let p = 0;
  while (padIndex < versionInfo.data) {
    codewords[padIndex] = pads[p % 2];
    padIndex += 1;
    p += 1;
  }
  return codewords;
}

// Precomputed BCH(15,5) format bits for Error Correction Level L (01) and Mask 0 (000):
// Data bits = 01000 -> Format string after XOR mask 101010000010010 = 0x77c4 (111011111000100)
const FORMAT_BITS_L_MASK_0 = 0x77c4;

export function buildQrMatrix(url) {
  const cleanUrl = String(url || 'https://smarter.poker/rules').trim();
  const byteLen = Buffer.byteLength(cleanUrl, 'utf8');
  const vInfo = selectVersion(byteLen);
  const size = vInfo.size;

  const matrix = Array.from({ length: size }, () => new Int8Array(size).fill(0));
  const reserved = Array.from({ length: size }, () => new Uint8Array(size).fill(0));

  const setModule = (r, c, dark, isReserved = true) => {
    if (r < 0 || r >= size || c < 0 || c >= size) return;
    matrix[r][c] = dark ? 1 : 0;
    if (isReserved) reserved[r][c] = 1;
  };

  // Finder patterns + separators
  const placeFinder = (rowOffset, colOffset) => {
    for (let r = -1; r <= 7; r += 1) {
      for (let c = -1; c <= 7; c += 1) {
        const rr = rowOffset + r;
        const cc = colOffset + c;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
        const inOuter = r >= 0 && r <= 6 && c >= 0 && c <= 6;
        const onBorder = r === 0 || r === 6 || c === 0 || c === 6;
        const inInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        setModule(rr, cc, inOuter && (onBorder || inInner), true);
      }
    }
  };

  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  // Alignment patterns
  if (vInfo.align.length > 0) {
    const centers = vInfo.align;
    for (let i = 0; i < centers.length; i += 1) {
      for (let j = 0; j < centers.length; j += 1) {
        const cr = centers[i];
        const cc = centers[j];
        if (reserved[cr][cc]) continue;
        for (let r = -2; r <= 2; r += 1) {
          for (let c = -2; c <= 2; c += 1) {
            const dark = Math.max(Math.abs(r), Math.abs(c)) !== 1;
            setModule(cr + r, cc + c, dark, true);
          }
        }
      }
    }
  }

  // Timing patterns
  for (let i = 8; i < size - 8; i += 1) {
    if (!reserved[6][i]) setModule(6, i, i % 2 === 0, true);
    if (!reserved[i][6]) setModule(i, 6, i % 2 === 0, true);
  }

  // Dark module and format area reservation
  setModule(size - 8, 8, true, true);
  for (let i = 0; i < 9; i += 1) {
    if (i !== 6) {
      if (!reserved[8][i]) setModule(8, i, false, true);
      if (!reserved[i][8]) setModule(i, 8, false, true);
    }
  }
  for (let i = 0; i < 8; i += 1) {
    if (!reserved[8][size - 1 - i]) setModule(8, size - 1 - i, false, true);
    if (!reserved[size - 1 - i][8]) setModule(size - 1 - i, 8, false, true);
  }

  // Encode data + EC
  const dataCw = encodeDataCodewords(cleanUrl, vInfo);
  const ecCw = rsEncode(dataCw, vInfo.ec);
  const allCw = new Uint8Array(vInfo.total);
  allCw.set(dataCw, 0);
  allCw.set(ecCw, dataCw.length);

  const dataBits = [];
  for (let i = 0; i < allCw.length; i += 1) {
    for (let b = 7; b >= 0; b -= 1) {
      dataBits.push((allCw[i] >> b) & 1);
    }
  }

  // Place data bits in upward/downward 2-column zig-zag
  let bitIdx = 0;
  let upward = true;
  for (let rightCol = size - 1; rightCol >= 1; rightCol -= 2) {
    if (rightCol === 6) rightCol = 5;
    for (let step = 0; step < size; step += 1) {
      const r = upward ? size - 1 - step : step;
      for (let dCol = 0; dCol < 2; dCol += 1) {
        const c = rightCol - dCol;
        if (!reserved[r][c]) {
          let bit = bitIdx < dataBits.length ? dataBits[bitIdx] : 0;
          bitIdx += 1;
          // Mask 0: (r + c) % 2 === 0
          if ((r + c) % 2 === 0) bit ^= 1;
          matrix[r][c] = bit;
        }
      }
    }
    upward = !upward;
  }

  // Write format information bits (L, Mask 0)
  for (let i = 0; i < 15; i += 1) {
    const bit = ((FORMAT_BITS_L_MASK_0 >> i) & 1) === 1;
    // Top-left
    if (i < 6) setModule(i, 8, bit, true);
    else if (i < 8) setModule(i + 1, 8, bit, true);
    else if (i === 8) setModule(8, 7, bit, true);
    else setModule(8, 14 - i, bit, true);

    // Top-right & bottom-left
    if (i < 8) setModule(8, size - 1 - i, bit, true);
    else setModule(size - 15 + i, 8, bit, true);
  }

  return { matrix, size, version: vInfo.version, url: cleanUrl };
}

export function renderQrCodeSvg(url, { pixelSize = 148, label = 'Scan For Rule Source' } = {}) {
  const { matrix, size, url: cleanUrl } = buildQrMatrix(url);
  const quietZone = 3;
  const totalModules = size + quietZone * 2;
  const paths = [];

  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      if (matrix[r][c] === 1) {
        paths.push(`M${c + quietZone},${r + quietZone}h1v1h-1z`);
      }
    }
  }

  const safeLabel = String(label || 'Scan For Rule Source')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  const safeUrl = String(cleanUrl)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalModules} ${totalModules}" width="${pixelSize}" height="${pixelSize}" role="img" aria-label="${safeLabel}: ${safeUrl}" shape-rendering="crispEdges"><title>${safeLabel}: ${safeUrl}</title><rect width="${totalModules}" height="${totalModules}" fill="#ffffff" rx="1.5"/><path d="${paths.join('')}" fill="#0f172a"/></svg>`;
}
