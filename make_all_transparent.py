import os
import glob
from PIL import Image

def remove_black_background(img_path, out_path=None):
    if out_path is None:
        out_path = img_path
    img = Image.open(img_path).convert("RGBA")
    
    width, height = img.size
    pixels = img.load()
    
    visited = [[False for _ in range(height)] for _ in range(width)]
    stack = []
    
    for x in range(width):
        stack.append((x, 0))
        stack.append((x, height - 1))
    for y in range(height):
        stack.append((0, y))
        stack.append((width - 1, y))
        
    def is_black(p):
        return p[0] < 20 and p[1] < 20 and p[2] < 20
        
    transparent_count = 0
    while stack:
        x, y = stack.pop()
        if x < 0 or x >= width or y < 0 or y >= height:
            continue
        if visited[x][y]:
            continue
            
        p = pixels[x, y]
        if is_black(p) or p[3] == 0: # Black or already transparent
            visited[x][y] = True
            if p[3] != 0:
                pixels[x, y] = (0, 0, 0, 0)
                transparent_count += 1
            stack.append((x + 1, y))
            stack.append((x - 1, y))
            stack.append((x, y + 1))
            stack.append((x, y - 1))
            
    if transparent_count > 0 or img_path.endswith('.jpg'):
        out_path_png = out_path.replace('.jpg', '.png')
        img.save(out_path_png, format="PNG")
        print(f"Processed {img_path} -> {out_path_png} (made {transparent_count} pixels transparent)")
        if img_path.endswith('.jpg') and os.path.exists(img_path):
            os.remove(img_path)
    else:
        print(f"Skipped {img_path} (no changes)")

if __name__ == "__main__":
    cards = glob.glob("/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/public/cards/*.jpg") + \
            glob.glob("/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/public/cards/*.png")
    for c in cards:
        remove_black_background(c)
