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
        print(f"File not found: {filepath}")
        return
        
    with open(filepath, 'r') as f:
        content = f.read()
        
    # Replace the destructuring and call
    # From:
    # const {
    #     data: { user },
    #     error: authError,
    # } = await supabase.auth.getUser(token);
    # To:
    # const { user, error: authError } = await getServerUserWithFallback(req, supabase);
    
    # regex for multiline matching
    pattern = re.compile(r"const\s*\{\s*data\:\s*\{\s*user\s*\}\s*,\s*error\:\s*([a-zA-Z0-9_]+),?\s*\}\s*=\s*await\s+([a-zA-Z0-9_]+)\.auth\.getUser\([^)]*\);", re.MULTILINE | re.DOTALL)
    
    if not pattern.search(content):
        # try single line
        pattern2 = re.compile(r"const\s*\{\s*data\:\s*\{\s*user\s*\}\s*,\s*error\:\s*([a-zA-Z0-9_]+)\s*\}\s*=\s*await\s+([a-zA-Z0-9_]+)\.auth\.getUser\([^)]*\);", re.MULTILINE | re.DOTALL)
        if not pattern2.search(content):
            print(f"No match found in {filepath}")
            # print it just in case
            print(content)
            return

    new_content = pattern.sub(r"const { user, error: \1 } = await getServerUserWithFallback(req, \2);", content)
    
    # Now we need to add the import if it's not there.
    if "getServerUserWithFallback" not in content:
        # Determine the relative path to src/lib/serverAuth
        depth = filepath.count('/') - 1
        prefix = "../" * depth if depth > 0 else "./"
        import_stmt = f"import {{ getServerUserWithFallback }} from '{prefix}src/lib/serverAuth';\n"
        
        # Add after the first import or at the top
        if "import " in new_content:
            new_content = re.sub(r"^(import [^\n]+)", r"\1\n" + import_stmt, new_content, count=1, flags=re.MULTILINE)
        else:
            new_content = import_stmt + "\n" + new_content

    with open(filepath, 'w') as f:
        f.write(new_content)
    print(f"Fixed {filepath}")

for f in files_to_fix:
    fix_file(f)

# For the venues comment
venues_file = "pages/api/venues/[...slug].js"
if os.path.exists(venues_file):
    with open(venues_file, 'r') as f:
        content = f.read()
    content = content.replace("supabase.auth.getUser(token)", "getServerUserWithFallback(req, supabase)")
    with open(venues_file, 'w') as f:
        f.write(content)
    print(f"Fixed comment in {venues_file}")

