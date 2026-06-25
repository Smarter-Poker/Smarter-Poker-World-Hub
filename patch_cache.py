import os
import re

api_dir = 'pages/api/mlb'

for root, dirs, files in os.walk(api_dir):
    for file in files:
        if file.endswith('.ts') and file != 'best-bets.ts':
            path = os.path.join(root, file)
            with open(path, 'r') as f:
                content = f.read()

            # Fix cache headers
            content = re.sub(r's-maxage=[0-9]+', 's-maxage=60', content)
            content = re.sub(r'stale-while-revalidate=[0-9]+', 'stale-while-revalidate=300', content)
            
            with open(path, 'w') as f:
                f.write(content)

