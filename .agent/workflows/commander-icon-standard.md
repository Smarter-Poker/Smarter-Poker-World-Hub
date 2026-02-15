---
description: Commander Icon Standard - 640x640 brushed metal style for all Club Commander icons
---
# Club Commander Icon Standard

**MANDATORY**: All icons inside Club Commander MUST follow this standard.

## Dimensions
- **Size**: 640x640 pixels
- **Format**: PNG with RGBA (transparent background)
- **Resolution**: High-DPI ready

## Visual Style (Player Maintenance Reference)
Every icon MUST match this exact style:
1. **Frame**: Rounded square brushed steel metal plate with dark gunmetal gray beveled edges
2. **Rivets**: 4 dark metal bolt rivets, one in each corner
3. **Border**: Cyan/teal neon glow border inside the plate edge
4. **Background**: Circular radial brushed metal texture
5. **Icon**: Neon cyan glowing embossed icon centered on the plate
6. **Text**: Bold metallic silver embossed text at the bottom, ALL CAPS

## Processing Pipeline
1. Generate icon using AI image generation with Player Maintenance as reference
2. Run Python PIL flood-fill to remove white/gray edge artifacts
3. Crop to content bounds
4. Resize to 640x640 with LANCZOS resampling
5. Save as optimized PNG

## Reference File
`/public/images/commander/icons/wl-player-maintenance.png`

## Python Edge Cleanup Script
```python
from PIL import Image
from collections import deque

img = Image.open(source).convert("RGBA")
pixels = img.load()
w, h = img.size

visited = set()
queue = deque()

# Seed from all edge pixels
for x in range(w):
    queue.append((x, 0))
    queue.append((x, h - 1))
for y in range(h):
    queue.append((0, y))
    queue.append((w - 1, y))

while queue:
    x, y = queue.popleft()
    if (x, y) in visited or x < 0 or x >= w or y < 0 or y >= h:
        continue
    visited.add((x, y))
    r, g, b, a = pixels[x, y]
    brightness = (r + g + b) / 3
    
    is_background = (
        a < 30 or
        (brightness > 200 and abs(r-g) < 30 and abs(g-b) < 30) or
        (brightness > 190 and abs(r-g) < 25 and abs(g-b) < 25) or
        (brightness < 15 and a > 200)
    )
    
    if is_background:
        pixels[x, y] = (0, 0, 0, 0)
        for dx, dy in [(-1,0),(1,0),(0,-1),(0,1)]:
            nx, ny = x+dx, y+dy
            if 0 <= nx < w and 0 <= ny < h and (nx,ny) not in visited:
                queue.append((nx, ny))

bbox = img.getbbox()
if bbox:
    img = img.crop(bbox)
img = img.resize((640, 640), Image.LANCZOS)
img.save(destination, "PNG", optimize=True)
```
