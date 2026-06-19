import os
import glob

api_dir = "/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/pages/api/mlb"

for filepath in glob.glob(os.path.join(api_dir, "*.ts")):
    with open(filepath, 'r') as f:
        content = f.read()
    
    if "new Response" in content and "export const config" not in content:
        # We need to inject the config. Let's put it right after the imports.
        lines = content.split('\n')
        last_import_idx = -1
        for i, line in enumerate(lines):
            if line.startswith('import '):
                last_import_idx = i
                
        insert_idx = last_import_idx + 1 if last_import_idx != -1 else 0
        
        config_block = [
            "",
            "export const config = {",
            "    runtime: 'edge',",
            "};",
            ""
        ]
        
        new_lines = lines[:insert_idx] + config_block + lines[insert_idx:]
        
        with open(filepath, 'w') as f:
            f.write('\n'.join(new_lines))
        
        print(f"Patched {os.path.basename(filepath)}")
