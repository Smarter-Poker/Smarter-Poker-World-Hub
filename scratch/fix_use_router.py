import os
import glob
import re

directory = 'pages/hub/MLB-ANALYTICS'

# Find all tsx and js files
files = glob.glob(os.path.join(directory, '**/*.tsx'), recursive=True) + \
        glob.glob(os.path.join(directory, '*.tsx'))

for file_path in set(files):
    with open(file_path, 'r') as f:
        content = f.read()

    modified = False

    # 1. Inject import
    if "import { useRouter }" not in content and "import {useRouter}" not in content:
        # Find the first import statement and insert before it
        import_match = re.search(r'^import .*;', content, re.MULTILINE)
        if import_match:
            content = content[:import_match.start()] + "import { useRouter } from 'next/router';\n" + content[import_match.start():]
        else:
            content = "import { useRouter } from 'next/router';\n" + content
        modified = True

    # 2. Inject router definition
    if 'const router = useRouter();' not in content:
        # Find the main component function
        func_match = re.search(r'export default function\s+[a-zA-Z0-9_]+\s*\([^)]*\)\s*{', content)
        if func_match:
            insert_pos = func_match.end()
            content = content[:insert_pos] + "\n    const router = useRouter();" + content[insert_pos:]
            modified = True

    if modified:
        with open(file_path, 'w') as f:
            f.write(content)
        print(f"Fixed {file_path}")
    else:
        print(f"No missing useRouter in {file_path}")

print("Done.")
