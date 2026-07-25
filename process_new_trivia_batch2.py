import os
from PIL import Image
from rembg import remove

UPLOADS = "/Users/smarter.poker/.gemini/antigravity/brain/308456c4-37f4-4840-b5d4-a53be1ae40c6/.user_uploaded"
TRIVIA = "/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/public/images/trivia"

files = [
    ("media__1785005186103.jpg", "pro-knowledge.png"),
    ("media__1785004899194.jpg", "tournaments.png"),
    ("media__1785004896755.jpg", "poker-history.png")
]

for src, dst in files:
    src_path = os.path.join(UPLOADS, src)
    dst_path = os.path.join(TRIVIA, dst)
    print(f"Processing {src} -> {dst}")
    
    with open(src_path, 'rb') as i:
        with open(dst_path, 'wb') as o:
            input_data = i.read()
            output_data = remove(input_data)
            o.write(output_data)
            
    print(f"Done processing {dst}")
