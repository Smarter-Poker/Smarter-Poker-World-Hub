// Probe before mounting Three.js: unsupported graphics is a device capability,
// not a render failure. Release the probe so it consumes no carousel context.
export function hasHubGraphics(createCanvas = () => document.createElement('canvas')) {
    let context;
    try {
        const canvas = createCanvas();
        const attributes = { alpha: true, antialias: true, powerPreference: 'high-performance' };
        context = canvas.getContext('webgl2', attributes) || canvas.getContext('webgl', attributes);
        return Boolean(context);
    } catch {
        return false;
    } finally {
        try { context?.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* optional extension */ }
    }
}
