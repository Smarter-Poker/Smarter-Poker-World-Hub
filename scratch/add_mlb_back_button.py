import os
import re

dir_path = 'pages/hub/MLB-ANALYTICS'

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # Determine back path
    if filepath.endswith('index.tsx'):
        back_path = "'/hub'"
    elif 'teams/' in filepath:
        back_path = "'/hub/MLB-ANALYTICS/teams'"
    elif 'players/' in filepath:
        back_path = "'/hub/MLB-ANALYTICS/players'"
    else:
        back_path = "'/hub/MLB-ANALYTICS'"

    # Check if useRouter is imported
    if 'useRouter' not in content:
        # Add import after React or next/head
        import_stmt = "import { useRouter } from 'next/router';\n"
        content = re.sub(r"(import React.*?;\n)", r"\1" + import_stmt, content)

    # Inject const router = useRouter(); inside the main functional component
    if 'const router = useRouter()' not in content and 'const router = useRouter();' not in content:
        # Find the export default function line
        content = re.sub(r"(export default function.*?\{)\n", r"\1\n    const router = useRouter();\n", content)

    # Replace <UniversalHeader pageDepth={X} /> with onBackClick
    # Handle possible spaces and self closing tag
    pattern = r'<UniversalHeader\s+pageDepth=\{\d+\}\s*/>'
    replacement = f'<UniversalHeader pageDepth={{2}} onBackClick={{() => router.push({back_path})}} />'
    content = re.sub(pattern, replacement, content)

    with open(filepath, 'w') as f:
        f.write(content)

for root, _, files in os.walk(dir_path):
    for f in files:
        if f.endswith('.tsx') or f.endswith('.js'):
            process_file(os.path.join(root, f))
            print(f"Processed {f}")

