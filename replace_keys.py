import os
import glob
import re

directory = '/Users/smarter.poker/Documents/Smarter-Poker-World-Hub'
keys = [
    r'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zY2RteGxkdHlzenl2Y3h4d2dyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTU2MTE5MywiZXhwIjoyMDk3MTM3MTkzfQ\.fu9rj-XG3DvjUVO-SteDCnaEbZlS9uxCX5aIOdRMsOI',
    r'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzczMDg0NCwiZXhwIjoyMDgzMzA2ODQ0fQ\.bbDqj-me78PID99npWCZ5qUuINSC1-eCBb1BVhgiSRs'
]

def replace_in_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original_content = content
    is_python = filepath.endswith('.py')
    
    for key in keys:
        if is_python:
            replacement = 'os.environ.get("SUPABASE_SERVICE_ROLE_KEY")'
        else:
            replacement = 'process.env.SUPABASE_SERVICE_ROLE_KEY'
            
        pattern = r'[\'"]' + key + r'[\'"]'
        
        # Clean up existing fallback logic
        content = re.sub(r'\|\|\s*[\'"]' + key + r'[\'"]', '', content)
        content = re.sub(r'\bor\s+[\'"]' + key + r'[\'"]', '', content)
        
        content = re.sub(pattern, replacement, content)

    if content != original_content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Updated {filepath}")

for root, dirs, files in os.walk(directory):
    if 'node_modules' in dirs:
        dirs.remove('node_modules')
    if '.git' in dirs:
        dirs.remove('.git')
    if '.next' in dirs:
        dirs.remove('.next')
    
    for file in files:
        if file.endswith(('.js', '.ts', '.jsx', '.tsx', '.py', '.json')):
            replace_in_file(os.path.join(root, file))
