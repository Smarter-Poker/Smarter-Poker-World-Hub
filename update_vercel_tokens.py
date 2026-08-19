import re

token = "vca_1y5vQsYRTu7TpJSIWd6GY2IlHXfuPt4MyVG1SRBBLq9W3Hydw92zZpWK"

files = [
    "/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/.env.local",
    "/Users/smarter.poker/Documents/club-arena/.env"
]

for file_path in files:
    try:
        with open(file_path, "r") as f:
            content = f.read()
        
        # Replace the token
        content = re.sub(r'VERCEL_TOKEN="[^"]+"', f'VERCEL_TOKEN="{token}"', content)
        content = re.sub(r"VERCEL_TOKEN='[^']+'", f'VERCEL_TOKEN="{token}"', content)
        content = re.sub(r"VERCEL_TOKEN=.*", f'VERCEL_TOKEN="{token}"', content)
        
        with open(file_path, "w") as f:
            f.write(content)
        print(f"Updated {file_path}")
    except Exception as e:
        print(f"Failed to update {file_path}: {e}")

