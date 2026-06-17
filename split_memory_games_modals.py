import re
import os

def process_modal(content, modal_var, component_name, props_list, start_str):
    start_idx = content.find(start_str)
    if start_idx == -1:
        print(f"Could not find {start_str}")
        return content, False
    
    paren_count = 0
    end_idx = -1
    for i in range(start_idx + len(start_str) - 1, len(content)):
        if content[i] == '(':
            paren_count += 1
        elif content[i] == ')':
            paren_count -= 1
            if paren_count == 0:
                end_idx = i + 1
                break
                
    if end_idx == -1:
        print(f"Could not find end of {start_str}")
        return content, False
        
    if end_idx < len(content) and content[end_idx] == '}':
        end_idx += 1
        
    extracted = content[start_idx:end_idx]
    
    props_str = "".join([f"                    {prop}={{{prop}}}\n" for prop in props_list])
    replacement = f"            {start_str}\n                <{component_name}\n{props_str}                />\n            )}}"
    
    new_content = content[:start_idx] + replacement + content[end_idx:]
    
    modal_content = extracted.strip()
    if modal_content.startswith(start_str):
        modal_content = modal_content[len(start_str):].strip()
    if modal_content.endswith(")}"):
        modal_content = modal_content[:-2].strip()
        
    new_component = f"""import React from 'react';

export default function {component_name}({{
{', '.join(props_list)}
}}) {{
    return (
        {modal_content}
    );
}}
"""
    os.makedirs('src/components/memory-games/modals', exist_ok=True)
    with open(f'src/components/memory-games/modals/{component_name}.js', 'w') as f:
        f.write(new_component.strip() + "\n")
        
    print(f"Successfully extracted {component_name}.")
    
    # Add dynamic import
    import_stmt = f"const {component_name} = dynamic(() => import('../../../src/components/memory-games/modals/{component_name}'), {{ ssr: false }});\n"
    if import_stmt not in new_content:
        export_idx = new_content.find("export default function")
        new_content = new_content[:export_idx] + import_stmt + new_content[export_idx:]
            
    return new_content, True

with open('pages/hub/memory-games.js', 'r') as f:
    content = f.read()

content, ok1 = process_modal(content, 'Filters', 'MemoryGamesFilters', [
    'filterPos', 'setFilterPos', 'filterAction', 'setFilterAction', 'filterStack', 'setFilterStack'
], "{showFilters && (")

content, ok2 = process_modal(content, 'ComboPopup', 'ComboPopup', [
    'comboName', 'C'
], "{showComboPopup && comboName && (")

if ok1 or ok2:
    with open('pages/hub/memory-games.js', 'w') as f:
        f.write(content)

