import os
import re

dir_path = 'pages/hub/MLB-ANALYTICS'

for root, dirs, files in os.walk(dir_path):
    for file in files:
        if file.endswith('.tsx') or file.endswith('.ts'):
            path = os.path.join(root, file)
            with open(path, 'r') as f:
                content = f.read()

            # Replace refreshIntervals > 300000 with 300000 (5 mins)
            # 3600000 = 1 hour, 7200000 = 2 hours, 1800000 = 30 mins
            content = re.sub(r'refreshInterval:\s*(1000\s*\*\s*60\s*\*\s*60|1800000|1_800_000|3600000|7200000)', 'refreshInterval: 300000', content)
            
            with open(path, 'w') as f:
                f.write(content)

