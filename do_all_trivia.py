import os
import glob
from PIL import Image

def remove_black_background(img_path, out_path):
    print(f"Processing {img_path} -> {out_path}")
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
        if is_black(p) or p[3] == 0:
            visited[x][y] = True
            if p[3] != 0:
                pixels[x, y] = (0, 0, 0, 0)
                transparent_count += 1
            stack.append((x + 1, y))
            stack.append((x - 1, y))
            stack.append((x, y + 1))
            stack.append((x, y - 1))
            
    img.save(out_path, format="PNG")
    print(f"Saved {out_path} (made {transparent_count} pixels transparent)")

if __name__ == "__main__":
    uploads_dir = "/Users/smarter.poker/.gemini/antigravity/brain/308456c4-37f4-4840-b5d4-a53be1ae40c6/.user_uploaded"
    trivia_dir = "/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/public/images/trivia"
    
    mappings = {
        # 13:35 uploads
        "media__1785004516366.png": "daily-trivia-header.png",
        "media__1785004523591.jpg": "mtt-scenarios.png",
        "media__1785004525428.jpg": "cash-game.png",
        "media__1785004528509.jpg": "icm-chip-ev.png",
        
        # 13:50 uploads
        "media__1785004896755.jpg": "poker-history.png",
        "media__1785004899194.jpg": "tournaments.png",
        "media__1785005186103.jpg": "pro-knowledge.png",
        
        # 14:11 uploads
        "media__1785006675778.png": "quick-stakes.png",
        "media__1785006641083.jpg": "gto-master.png",
        "media__1785006639372.jpg": "rules-quiz.png",
        "media__1785006636278.jpg": "pvp-battle.png",
        
        # We also need social media card
        "media__1785004123592.jpg": "social-media.png", # Wait, social media card goes to public/cards/
    }
    
    for upload_name, dest_name in mappings.items():
        upload_path = os.path.join(uploads_dir, upload_name)
        if dest_name == "social-media.png":
            dest_path = "/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/public/cards/social-media.png"
        else:
            dest_path = os.path.join(trivia_dir, dest_name)
            
        remove_black_background(upload_path, dest_path)
