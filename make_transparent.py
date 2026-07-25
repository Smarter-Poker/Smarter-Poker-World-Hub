import os
import sys
from PIL import Image, ImageDraw

def remove_black_background(img_path, out_path):
    print(f"Processing {img_path} -> {out_path}")
    img = Image.open(img_path).convert("RGBA")
    
    # We will do a flood fill from the edges to make black pixels transparent.
    # PIL's floodfill doesn't support tolerance with RGBA directly easily,
    # so we'll do it manually or using a mask.
    
    # Create a mask of "black" pixels
    # Black here is defined as R<15, G<15, B<15 due to jpeg artifacts
    width, height = img.size
    pixels = img.load()
    
    # Create a boolean mask of visited pixels
    visited = [[False for _ in range(height)] for _ in range(width)]
    
    # Stack for flood fill
    stack = []
    
    # Add border pixels to stack if they are black
    for x in range(width):
        stack.append((x, 0))
        stack.append((x, height - 1))
    for y in range(height):
        stack.append((0, y))
        stack.append((width - 1, y))
        
    def is_black(p):
        return p[0] < 20 and p[1] < 20 and p[2] < 20
        
    while stack:
        x, y = stack.pop()
        if x < 0 or x >= width or y < 0 or y >= height:
            continue
        if visited[x][y]:
            continue
            
        p = pixels[x, y]
        if is_black(p):
            visited[x][y] = True
            pixels[x, y] = (0, 0, 0, 0) # Make transparent
            stack.append((x + 1, y))
            stack.append((x - 1, y))
            stack.append((x, y + 1))
            stack.append((x, y - 1))
            
    img.save(out_path, format="PNG")
    print(f"  Saved {out_path} with size {img.size}")

if __name__ == "__main__":
    import sys
    remove_black_background(sys.argv[1], sys.argv[2])
