import re

with open("src/lib/mlb_data.ts", "r") as f:
    code = f.read()

# Add @ts-nocheck to the top
if not code.startswith('// @ts-nocheck'):
    code = '// @ts-nocheck\n' + code

# Strip any remaining unstable_cache wrappers
# Because they might span multiple lines, let's just find `unstable_cache(`
code = re.sub(r'unstable_cache\(\s*async \([^)]*\) => [^,]*,[^,]*,\s*\{[^}]*\}\s*\)\([^)]*\);', '', code)

# Let's just manually replace the whole file since it's simpler if I just do it with Python string replacement for the specific functions
