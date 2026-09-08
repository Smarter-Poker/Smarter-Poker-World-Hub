/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  avatarMatte — finding, and telling apart, the two kinds of hole in a cut-out
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * A background remover cut these avatars out of their renders, and wherever the
 * subject was close to the backdrop in colour it took the subject too: the
 * geisha's white face makeup, the knight's armour, the penguin's belly, the
 * unicorn's muzzle. Composited on the felt those are not soft edges, they are
 * holes you can see the table through.
 *
 * THE HARD PART IS NOT FINDING THE HOLES. It is telling a hole from a gap.
 *
 * An enclosed transparent region is not automatically a defect. The space
 * between a panther's whiskers is enclosed, and so is the space between two
 * spikes of a badger's fur, and both are meant to show the felt. Fill them and
 * the whiskers become a web.
 *
 * What separates them is HOW THICK THE WALL IS. A hole eaten out of a face sits
 * deep inside solid subject — 20 to 40px of opaque material between it and the
 * outside world. A gap between whiskers is behind a strand two or three pixels
 * wide. So the measurement is a breadth-first distance from the OUTSIDE
 * transparent region inward, and the cut is at five pixels on a 340px-tall bust,
 * scaled with the image.
 *
 * Measured on the shipped busts, which is where the threshold comes from:
 *
 *     avatar             deep (fill)   thin (leave)   what the thin ones are
 *     vip_geisha_master        4325              5    nothing
 *     vip_unicorn              4007             82    mane strands
 *     vip_liberty              3330             45    crown spikes
 *     free_knight              1603             45    helmet grille
 *     free_penguin              834             35    feather tips
 *     vip_badger                715             76    fur spikes
 *     vip_phoenix               180             98    flame wisps
 *     vip_panther                27             94    whiskers
 *
 * panther and phoenix are the proof the rule works: they are almost entirely
 * thin, and a rule that filled every enclosed region would have webbed them.
 */

/**
 * sharp is optional. It is a declared dependency, but a production install
 * prunes devDependencies and a runner that has not installed it should skip the
 * check rather than fail a build over a missing image codec — so this returns
 * null instead of throwing, and every caller copes.
 */
let sharpPromise = null;
export function getSharp() {
  if (!sharpPromise) {
    sharpPromise = import('sharp')
      .then((m) => m.default)
      .catch(() => null);
  }
  return sharpPromise;
}

/** Alpha at or above this is the subject. Below it is matte, of some kind. */
export const OPAQUE = 250;

/** Wall thickness, in px, that separates a punched hole from a strand gap. */
export const MIN_WALL_AT_340 = 5;

export function minWallFor(height) {
  return Math.max(3, Math.round((MIN_WALL_AT_340 * height) / 340));
}

/**
 * Splits every not-fully-opaque pixel into exterior matte, thin gap and deep
 * hole, and hands back the wall thickness it measured for each.
 */
export function classifyMatte(alpha, width, height, minWall) {
  const n = width * height;
  const soft = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) soft[i] = alpha[i] < OPAQUE ? 1 : 0;

  // 1. the matte that reaches the edge of the canvas
  const exterior = new Uint8Array(n);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  const push = (i) => {
    if (!soft[i] || exterior[i]) return;
    exterior[i] = 1;
    queue[tail] = i;
    tail += 1;
  };
  for (let x = 0; x < width; x += 1) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    push(y * width);
    push(y * width + width - 1);
  }
  while (head < tail) {
    const i = queue[head];
    head += 1;
    const x = i % width;
    const y = (i - x) / width;
    if (x > 0) push(i - 1);
    if (x < width - 1) push(i + 1);
    if (y > 0) push(i - width);
    if (y < height - 1) push(i + width);
  }

  // 2. how far inward each pixel is from that matte, through anything
  const wall = new Int32Array(n).fill(-1);
  head = 0;
  tail = 0;
  for (let i = 0; i < n; i += 1) {
    if (exterior[i]) {
      wall[i] = 0;
      queue[tail] = i;
      tail += 1;
    }
  }
  while (head < tail) {
    const i = queue[head];
    head += 1;
    const d = wall[i] + 1;
    const x = i % width;
    const y = (i - x) / width;
    const step = (j) => {
      if (wall[j] < 0) {
        wall[j] = d;
        queue[tail] = j;
        tail += 1;
      }
    };
    if (x > 0) step(i - 1);
    if (x < width - 1) step(i + 1);
    if (y > 0) step(i - width);
    if (y < height - 1) step(i + width);
  }

  // 3. enclosed matte, split by wall thickness
  const deep = new Uint8Array(n);
  const thin = new Uint8Array(n);
  let deepCount = 0;
  let thinCount = 0;
  for (let i = 0; i < n; i += 1) {
    if (!soft[i] || exterior[i]) continue;
    if (wall[i] >= minWall) {
      deep[i] = 1;
      deepCount += 1;
    } else {
      thin[i] = 1;
      thinCount += 1;
    }
  }
  return { exterior, deep, thin, wall, deepCount, thinCount };
}

/** Largest connected run in a mask, so one big tear is not hidden by arithmetic. */
export function largestBlob(mask, width, height) {
  const n = width * height;
  const seen = new Uint8Array(n);
  const stack = new Int32Array(n);
  let best = 0;
  for (let s = 0; s < n; s += 1) {
    if (!mask[s] || seen[s]) continue;
    let top = 0;
    stack[top] = s;
    top += 1;
    seen[s] = 1;
    let size = 0;
    while (top > 0) {
      top -= 1;
      const i = stack[top];
      size += 1;
      const x = i % width;
      const y = (i - x) / width;
      const step = (j) => {
        if (mask[j] && !seen[j]) {
          seen[j] = 1;
          stack[top] = j;
          top += 1;
        }
      };
      if (x > 0) step(i - 1);
      if (x < width - 1) step(i + 1);
      if (y > 0) step(i - width);
      if (y < height - 1) step(i + width);
    }
    if (size > best) best = size;
  }
  return best;
}

/**
 * Fills `domain` from `known` by solving Laplace's equation on it — every filled
 * pixel becomes the average of its neighbours, with the surrounding subject held
 * fixed as the boundary.
 *
 * Plain Jacobi needs iterations proportional to the SQUARE of a hole's width, so
 * the geisha's 70px tear would want thousands. This does it on a pyramid: solve
 * a heavily shrunk copy where the hole is a few pixels across, expand that as
 * the starting guess for the next level up, and let a few dozen sweeps settle
 * the detail. Seconds instead of minutes, and the same answer.
 *
 * The result is smooth rather than textured, which is exactly right for what
 * these holes are eaten out of: flat face makeup, armour, robes, a chest.
 */
export function inpaint(value, known, domain, width, height, channels) {
  if (width < 3 || height < 3) return;

  const n = width * height;
  let anyDomain = false;
  for (let i = 0; i < n; i += 1)
    if (domain[i]) {
      anyDomain = true;
      break;
    }
  if (!anyDomain) return;

  if (width > 16 && height > 16) {
    const cw = width >> 1;
    const ch = height >> 1;
    const cValue = new Float32Array(cw * ch * channels);
    const cKnown = new Uint8Array(cw * ch);
    const cDomain = new Uint8Array(cw * ch);
    for (let y = 0; y < ch; y += 1) {
      for (let x = 0; x < cw; x += 1) {
        const ci = y * cw + x;
        let w = 0;
        const acc = new Float32Array(channels);
        let dom = 0;
        for (let dy = 0; dy < 2; dy += 1) {
          for (let dx = 0; dx < 2; dx += 1) {
            const fy = Math.min(height - 1, y * 2 + dy);
            const fx = Math.min(width - 1, x * 2 + dx);
            const fi = fy * width + fx;
            if (known[fi]) {
              w += 1;
              for (let c = 0; c < channels; c += 1) acc[c] += value[fi * channels + c];
            }
            if (domain[fi]) dom = 1;
          }
        }
        if (w > 0) {
          cKnown[ci] = 1;
          for (let c = 0; c < channels; c += 1) cValue[ci * channels + c] = acc[c] / w;
        } else if (dom) {
          cDomain[ci] = 1;
        }
      }
    }
    inpaint(cValue, cKnown, cDomain, cw, ch, channels);

    // expand the coarse answer as this level's starting guess
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = y * width + x;
        if (!domain[i]) continue;
        const ci = Math.min(ch - 1, y >> 1) * cw + Math.min(cw - 1, x >> 1);
        for (let c = 0; c < channels; c += 1) value[i * channels + c] = cValue[ci * channels + c];
      }
    }
  } else {
    // coarsest level: start from the mean of whatever is known
    const acc = new Float32Array(channels);
    let w = 0;
    for (let i = 0; i < n; i += 1)
      if (known[i]) {
        w += 1;
        for (let c = 0; c < channels; c += 1) acc[c] += value[i * channels + c];
      }
    if (w === 0) return;
    for (let i = 0; i < n; i += 1)
      if (domain[i])
        for (let c = 0; c < channels; c += 1) value[i * channels + c] = acc[c] / w;
  }

  const sweeps = width > 16 && height > 16 ? 48 : 200;
  const next = new Float32Array(channels);
  for (let s = 0; s < sweeps; s += 1) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = y * width + x;
        if (!domain[i]) continue;
        next.fill(0);
        let count = 0;
        const take = (j) => {
          count += 1;
          for (let c = 0; c < channels; c += 1) next[c] += value[j * channels + c];
        };
        if (x > 0) take(i - 1);
        if (x < width - 1) take(i + 1);
        if (y > 0) take(i - width);
        if (y < height - 1) take(i + width);
        if (!count) continue;
        for (let c = 0; c < channels; c += 1) value[i * channels + c] = next[c] / count;
      }
    }
  }
}

/**
 * Enclosed regions that are MEANT to show the felt, found by looking at all 171
 * candidates one at a time against black. There is no reliable automatic way to
 * tell these from a punched hole — I tried four and they all mix the two up:
 *
 *   wall thickness / sqrt(area)   knight 0.22 (fill) vs liberty 0.22 (keep)
 *   compactness (P^2/4piA)        geisha 2.4 (fill) vs liberty 2.4 (keep)
 *   soft rim fraction             every boundary in the library is a hard step;
 *                                 the whole set was cut with a thresholded matte
 *   colour under the matte        the encoders cleared it
 *
 * So the list is declared, not derived, and each entry says what it is. A region
 * is matched by its centroid as a fraction of the image, which survives
 * re-encoding; the area is a comment, not a key.
 */
export const KEEP_SEE_THROUGH = [
  // the halo is a RING. Filling it makes a solid gold disc over her head.
  ['vip/angel.webp', 0.5151, 0.1184], //  5678 px
  ['table/vip_angel@2x.webp', 0.5076, 0.3311], //   368 px

  // between the raised torch arm and her head, and between the arm and the
  // crown spikes. Filling either welds her arm to her face.
  ['vip/liberty.webp', 0.3262, 0.4611], // 23480 px
  ['vip/liberty.webp', 0.3135, 0.3008], //  6749 px
  ['table/vip_liberty@2x.webp', 0.2626, 0.4601], //  2654 px
  ['table/vip_liberty@2x.webp', 0.2454, 0.3001], //   773 px

  // between the saxophone bell and his chest
  ['vip/jazz.webp', 0.5446, 0.5547], //  5781 px
  ['table/vip_jazz@2x.webp', 0.7377, 0.6428], //  2097 px

  // between her braids. Filling these webs the hair
  ['vip/dancer.webp', 0.2492, 0.3302], //   987 px
  ['vip/dancer.webp', 0.2487, 0.3932], //  1047 px
  ['vip/dancer.webp', 0.2624, 0.4197], //  1241 px
  ['table/vip_dancer@2x.webp', 0.1574, 0.3245], //   186 px
  ['table/vip_dancer@2x.webp', 0.1749, 0.4213], //   146 px
  ['table/vip_dancer@2x.webp', 0.7903, 0.4529], //   195 px

  // between strands of hair
  ['vip/sorceress.webp', 0.7621, 0.3935], //  1176 px
  ['vip/sorceress.webp', 0.2241, 0.4385], //  1441 px

  // behind the chain, inside the shoulder armour
  ['vip/dragon.webp', 0.343, 0.9153], //  2215 px
];

/** How close a component's centroid has to be to a listed one, as a fraction. */
export const KEEP_TOLERANCE = 0.02;

/**
 * Clears from `mask` every connected region whose centroid matches one on the
 * keep list, and returns how many it cleared — so the report can say "left 3
 * alone" rather than silently doing nothing.
 */
export function dropKeepers(mask, width, height, keeps) {
  if (!keeps.length) return 0;
  const n = width * height;
  const seen = new Uint8Array(n);
  const stack = new Int32Array(n);
  let cleared = 0;
  for (let s0 = 0; s0 < n; s0 += 1) {
    if (!mask[s0] || seen[s0]) continue;
    let top = 0;
    stack[top] = s0;
    top += 1;
    seen[s0] = 1;
    const pixels = [];
    let sx = 0;
    let sy = 0;
    while (top > 0) {
      top -= 1;
      const i = stack[top];
      pixels.push(i);
      const x = i % width;
      const y = (i - x) / width;
      sx += x;
      sy += y;
      const step = (j) => {
        if (mask[j] && !seen[j]) {
          seen[j] = 1;
          stack[top] = j;
          top += 1;
        }
      };
      if (x > 0) step(i - 1);
      if (x < width - 1) step(i + 1);
      if (y > 0) step(i - width);
      if (y < height - 1) step(i + width);
    }
    const cx = sx / pixels.length / width;
    const cy = sy / pixels.length / height;
    const hit = keeps.some(
      ([kx, ky]) => Math.abs(kx - cx) <= KEEP_TOLERANCE && Math.abs(ky - cy) <= KEEP_TOLERANCE
    );
    if (!hit) continue;
    for (const i of pixels) mask[i] = 0;
    cleared += 1;
  }
  return cleared;
}
