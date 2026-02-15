"""
Process Hub and Back button images:
- NO darkening of any pixels - preserve original silver/black tones exactly
- Hub: remove dark background (make transparent)
- Back: sharpen alpha channel (remove semi-transparent blur)
- Both: auto-crop to tight bounding box to eliminate edge distortion
"""
from PIL import Image
import numpy as np

# Background removal threshold for the HUB button
# Pixels with brightness below this AND in the outer region are treated as background
BG_BRIGHTNESS_THRESH = 25  # Very dark pixels near edges = background

# Alpha sharpening threshold for BACK button
ALPHA_THRESH = 128  # Below = transparent, above = opaque

def remove_dark_background(input_path, output_path):
    """For HUB button: fully opaque image with dark/black background.
    Make the dark background transparent while keeping the button untouched."""
    print(f"\n=== Processing HUB button: {input_path} ===")
    img = Image.open(input_path).convert('RGBA')
    data = np.array(img, dtype=np.float64)
    
    r, g, b, a = data[:,:,0], data[:,:,1], data[:,:,2], data[:,:,3]
    brightness = 0.299 * r + 0.587 * g + 0.114 * b
    
    h, w = data.shape[:2]
    print(f"  Size: {w}x{h}")
    
    # Strategy: flood-fill from corners/edges to identify background region
    # The background is the dark area OUTSIDE the button shape
    # We use a two-pass approach:
    # 1. Mark all very dark pixels as potential background
    # 2. Only make transparent those that are connected to the image border
    
    from scipy import ndimage
    
    # Step 1: Create mask of very dark pixels (potential background)
    dark_mask = brightness < BG_BRIGHTNESS_THRESH
    
    # Step 2: Label connected components of dark pixels
    labeled, num_features = ndimage.label(dark_mask)
    
    # Step 3: Find which labels touch the border (these are background)
    border_labels = set()
    border_labels.update(labeled[0, :].flatten())      # top row
    border_labels.update(labeled[-1, :].flatten())     # bottom row
    border_labels.update(labeled[:, 0].flatten())      # left col
    border_labels.update(labeled[:, -1].flatten())     # right col
    border_labels.discard(0)  # 0 = not dark
    
    # Step 4: Make background pixels transparent
    bg_mask = np.isin(labeled, list(border_labels))
    data[:,:,3][bg_mask] = 0
    
    bg_count = bg_mask.sum()
    print(f"  Removed {bg_count} background pixels (connected to border)")
    
    # Step 5: Also handle near-edge semi-dark pixels with smooth falloff  
    # For pixels very close to the BG threshold at edges, smooth the alpha
    edge_zone = (brightness >= BG_BRIGHTNESS_THRESH) & (brightness < BG_BRIGHTNESS_THRESH + 15)
    # Check if these edge pixels are adjacent to background
    bg_dilated = ndimage.binary_dilation(bg_mask, iterations=1)
    edge_at_border = edge_zone & bg_dilated
    if edge_at_border.any():
        # Smooth transition: alpha goes from 0 at threshold to 255 at threshold+15
        edge_alpha = np.clip((brightness[edge_at_border] - BG_BRIGHTNESS_THRESH) / 15.0 * 255, 0, 255)
        data[:,:,3][edge_at_border] = edge_alpha
        print(f"  Smoothed {edge_at_border.sum()} edge transition pixels")
    
    result = Image.fromarray(data.astype(np.uint8), 'RGBA')
    
    # Auto-crop to content bounding box
    result = autocrop(result)
    
    result.save(output_path)
    print(f"  Saved: {output_path} ({result.size[0]}x{result.size[1]})")
    return result

def fix_back_alpha(input_path, output_path):
    """For BACK button: fix semi-transparent alpha to crisp edges.
    NO darkening - preserve original tones exactly."""
    print(f"\n=== Processing BACK button: {input_path} ===")
    img = Image.open(input_path).convert('RGBA')
    data = np.array(img, dtype=np.float64)
    
    r, g, b, a = data[:,:,0], data[:,:,1], data[:,:,2], data[:,:,3]
    
    h, w = data.shape[:2]
    print(f"  Size: {w}x{h}")
    
    semi = ((a > 0) & (a < 255)).sum()
    print(f"  Semi-transparent pixels: {int(semi)}")
    
    # Sharpen alpha: above threshold -> 255, below -> 0
    a_new = np.where(a >= ALPHA_THRESH, 255.0, 0.0)
    
    # Un-premultiply RGB for pixels going from semi -> fully opaque
    semi_to_opaque = (a > 0) & (a < 255) & (a_new == 255)
    if semi_to_opaque.any():
        alpha_ratio = 255.0 / np.maximum(a[semi_to_opaque], 1)
        alpha_ratio = np.minimum(alpha_ratio, 3.0)  # cap correction
        r[semi_to_opaque] = np.minimum(r[semi_to_opaque] * alpha_ratio, 255)
        g[semi_to_opaque] = np.minimum(g[semi_to_opaque] * alpha_ratio, 255)
        b[semi_to_opaque] = np.minimum(b[semi_to_opaque] * alpha_ratio, 255)
    
    data[:,:,0] = r
    data[:,:,1] = g
    data[:,:,2] = b
    data[:,:,3] = a_new
    
    new_semi = ((a_new > 0) & (a_new < 255)).sum()
    print(f"  After fix: {int(new_semi)} semi-transparent pixels")
    
    result = Image.fromarray(data.astype(np.uint8), 'RGBA')
    
    # Auto-crop to content bounding box
    result = autocrop(result)
    
    result.save(output_path)
    print(f"  Saved: {output_path} ({result.size[0]}x{result.size[1]})")
    return result

def autocrop(img):
    """Trim transparent edges to tight bounding box."""
    data = np.array(img)
    alpha = data[:,:,3]
    
    # Find rows and cols with any visible pixels
    rows = np.any(alpha > 0, axis=1)
    cols = np.any(alpha > 0, axis=0)
    
    if not rows.any() or not cols.any():
        return img
    
    top = np.argmax(rows)
    bottom = len(rows) - np.argmax(rows[::-1])
    left = np.argmax(cols)
    right = len(cols) - np.argmax(cols[::-1])
    
    # Add 2px padding to avoid edge clipping
    top = max(0, top - 2)
    bottom = min(data.shape[0], bottom + 2)
    left = max(0, left - 2)
    right = min(data.shape[1], right + 2)
    
    cropped = img.crop((left, top, right, bottom))
    if cropped.size != img.size:
        print(f"  Auto-cropped: {img.size} -> {cropped.size}")
    return cropped

if __name__ == '__main__':
    hub = remove_dark_background('btn-hub-original.png', 'btn-hub.png')
    back = fix_back_alpha('btn-back-original.png', 'btn-back.png')
    
    # Generate 32px previews
    for name, img in [('btn-hub', hub), ('btn-back', back)]:
        aspect = img.width / img.height
        preview = img.resize((int(32 * aspect), 32), Image.LANCZOS)
        preview.save(f'{name}-preview-32px.png')
        print(f"  Preview: {name}-preview-32px.png ({preview.size[0]}x{preview.size[1]})")
    
    print("\nDone! No darkening applied - original silver/black tones preserved.")
