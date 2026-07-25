import os
import pytesseract
from PIL import Image

uploads = "/Users/smarter.poker/.gemini/antigravity/brain/308456c4-37f4-4840-b5d4-a53be1ae40c6/.user_uploaded"
for f in os.listdir(uploads):
    if f.endswith('.jpg') or f.endswith('.png'):
        try:
            text = pytesseract.image_to_string(Image.open(os.path.join(uploads, f)))
            if "SOCIAL MEDIA" in text.upper() or "SOCIAL" in text.upper():
                print(f"Found social in {f}")
        except:
            pass
