import os
from PIL import Image

paths = [
    "public/images/news-icons/card-frame-transparent.png",
    "public/images/metal-frame.png",
    "public/hub/club-arena/images/modals/create-club-modal-frame.png",
    "public/images/poker-near-me-hud-frame-clean.png",
    "public/cards/video-library.jpg"
]

for p in paths:
    if os.path.exists(p):
        img = Image.open(p)
        print(f"{p}: {img.size}, mode: {img.mode}")
    else:
        print(f"{p}: Not found")
