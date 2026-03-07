/**
 * /api/poker/gen-lobby-img
 * Generates a single photorealistic lobby image via Grok API.
 * Returns base64 PNG with black background removed.
 * 
 * GET /api/poker/gen-lobby-img?key=smarterpoker2026&name=search&type=pods
 */

export default async function handler(req, res) {
  if (req.query.key !== 'smarterpoker2026') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { name, type = 'pods' } = req.query;
  if (!name) return res.status(400).json({ error: 'name required' });

  const POD_PROMPTS = {
    search: "Photorealistic 3D render of a glowing holographic magnifying glass scanning over a neon-lit poker table map with floating venue location pins, cyberpunk style, completely black background with cyan and blue volumetric light rays, ultra-high detail cinematic 4K quality, glass material with light refraction effects, isolated object on pure black",
    nearme: "Photorealistic 3D render of a large glowing GPS navigation pin hovering over a miniature neon cityscape at night, holographic blue and cyan pulsing lighting, completely black background, poker chips scattered at base, volumetric god rays, ultra-high detail cinematic 4K",
    livegames: "Photorealistic 3D render of a premium high-stakes poker table mid-deal with holographic playing cards floating, dramatic red and orange cinematic spotlight from above, gleaming chip stacks, completely black background, motion blur on flying cards, 4K casino atmosphere",
    mapview: "Photorealistic 3D render of a floating translucent holographic world globe with bright glowing blue pin markers for poker venues, neon latitude grid lines, completely black background with subtle blue ambient light, 4K futuristic interface",
    tours: "Photorealistic 3D render of a magnificent golden championship poker trophy with stacked premium chips and a royal flush hand arranged ceremonially, dramatic golden spotlight with lens flare, completely black background, 4K tournament atmosphere",
    calendar: "Photorealistic 3D render of a floating holographic weekly calendar interface with glowing purple and violet date markers, small poker chip icons on tournament dates, completely black background with purple volumetric light, futuristic UI, 4K",
    daily: "Photorealistic 3D render of a sleek neon green digital countdown timer showing tournament start time, poker card suit symbols as hour markers, emerald green volumetric light glow, completely black background, 4K cinematic",
    series: "Photorealistic 3D render of three magnificent golden poker championship trophies arranged in ascending height, warm orange-amber cinematic spotlight, championship banner softly lit behind, scattered premium chips, completely black background, 4K",
    wallet: "Photorealistic 3D render of an ornate treasure chest bursting open overflowing with glowing golden poker chips, cut diamonds, and gem-encrusted playing cards, golden volumetric light rays emanating from within, completely black background, 4K cinematic",
  };

  const DOCK_PROMPTS = {
    'trip-planner': "Photorealistic 3D icon of a glowing holographic road map with a winding neon cyan route connecting poker venue pins, miniature sports car on the path, completely black background, 4K quality",
    calculator: "Photorealistic 3D icon of a futuristic holographic calculator with poker chip denomination buttons, cyan glowing display showing poker odds, completely black background, 4K",
    saved: "Photorealistic 3D icon of a glowing heart-shaped crystal container filled with miniature golden poker venue cards, cyan and magenta ambient light, completely black background, 4K",
    friends: "Photorealistic 3D icon of holographic player avatars standing in a circle around a floating miniature poker table, cyan network connection lines between them, completely black background, 4K",
    alerts: "Photorealistic 3D icon of a glowing holographic notification bell with poker card symbols and alert badges floating out, pulsing amber and cyan light rings, completely black background, 4K",
  };

  const prompts = type === 'dock' ? DOCK_PROMPTS : POD_PROMPTS;
  const prompt = prompts[name];
  if (!prompt) return res.status(400).json({ error: `Unknown ${type} name: ${name}` });

  try {
    const { OpenAI } = await import('openai');
    const client = new OpenAI({
      apiKey: process.env.XAI_API_KEY,
      baseURL: 'https://api.x.ai/v1',
    });

    const response = await client.images.generate({
      model: 'grok-imagine-image',
      prompt,
      n: 1,
      response_format: 'b64_json',
    });

    const b64Raw = response.data[0].b64_json;

    // Remove black background using Sharp
    let b64Final = b64Raw;
    try {
      const sharp = (await import('sharp')).default;
      const buf = Buffer.from(b64Raw, 'base64');
      const { width, height } = await sharp(buf).metadata();
      const rawData = await sharp(buf).ensureAlpha().raw().toBuffer();
      
      const threshold = 40;
      for (let i = 0; i < rawData.length; i += 4) {
        const r = rawData[i], g = rawData[i+1], b = rawData[i+2];
        if (r < threshold && g < threshold && b < threshold) {
          rawData[i+3] = 0;
        }
      }

      // Edge cleanup - fade dark pixels adjacent to transparent
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          if (rawData[idx + 3] === 0) continue;
          const r = rawData[idx], g = rawData[idx+1], b2 = rawData[idx+2];
          if (r < 60 && g < 60 && b2 < 60) {
            let transparentNeighbors = 0;
            for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
              const nx = x + dx, ny = y + dy;
              if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                const nIdx = (ny * width + nx) * 4;
                if (rawData[nIdx + 3] === 0) transparentNeighbors++;
              }
            }
            if (transparentNeighbors >= 1) {
              const brightness = Math.max(r, g, b2);
              rawData[idx + 3] = Math.min(rawData[idx + 3], Math.max(0, Math.floor(rawData[idx + 3] * brightness / 60)));
            }
          }
        }
      }

      const processed = await sharp(rawData, { raw: { width, height, channels: 4 } }).png().toBuffer();
      b64Final = processed.toString('base64');
    } catch (sharpErr) {
      console.warn('Sharp unavailable:', sharpErr.message);
    }

    return res.status(200).json({
      success: true,
      name,
      type,
      b64: b64Final,
      size: b64Final.length,
    });
  } catch (err) {
    console.error(`[gen-lobby-img] Error:`, err);
    return res.status(500).json({ error: err.message });
  }
}

export const config = { maxDuration: 120 };
