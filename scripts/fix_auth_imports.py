import os
import re

files_to_fix = [
    "pages/api/account/delete-gdpr.js",
    "pages/api/kyc/start.js",
    "pages/api/kyc/status.js",
    "pages/api/rg/self-exclude.js",
    "pages/api/rg/session/end.js",
    "pages/api/rg/session/reality-check.js",
    "pages/api/rg/session/start.js",
    "pages/api/social/referral.js"
]

def fix_file(filepath):
    if not os.path.exists(filepath):
        return
        
    with open(filepath, 'r') as f:
        content = f.read()
    
    # Calculate correct depth: number of directories
    depth = filepath.count('/')
    prefix = "../" * depth
    correct_import = f"'{prefix}src/lib/serverAuth'"
    
    # Replace wrong imports (from the previous script)
    # The previous script might have used incorrect prefix
    old_prefix = "../" * (depth - 1) if depth > 0 else "./"
    wrong_import = f"'{old_prefix}src/lib/serverAuth'"
    
    content = content.replace(wrong_import, correct_import)
    
    with open(filepath, 'w') as f:
        f.write(content)

for f in files_to_fix:
    fix_file(f)

# Also fix the BottomNavBar issue
nav_bar = "src/components/ui/BottomNavBar.jsx"
if os.path.exists(nav_bar):
    with open(nav_bar, 'r') as f:
        content = f.read()
    content = re.sub(r"import .* from ['\"]../../src/components/ui/BottomNavBar['\"];?", "", content)
    with open(nav_bar, 'w') as f:
        f.write(content)

