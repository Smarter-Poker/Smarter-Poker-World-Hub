import re
import os

def process_modal(content, modal_var, component_name, props_list):
    start_str = f"{{show{modal_var} && ("
    start_idx = content.find(start_str)
    if start_idx == -1:
        # Some modals might be conditionally wrapped or have different casing
        start_str2 = f"{{show{modal_var} &&"
        start_idx = content.find(start_str2)
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
    replacement = f"            {{show{modal_var} && (\n                <{component_name}\n{props_str}                />\n            )}}"
    
    new_content = content[:start_idx] + replacement + content[end_idx:]
    
    modal_content = extracted.strip()
    if modal_content.startswith(f"{{show{modal_var} && ("):
        modal_content = modal_content[len(f"{{show{modal_var} && ("):].strip()
    elif modal_content.startswith(f"{{show{modal_var} &&"):
        # Could be an element right away without parentheses
        match = re.match(r'^\{show[a-zA-Z0-9_]+\s*&&\s*(<.*)$', modal_content, re.DOTALL)
        if match:
            modal_content = match.group(1).strip()
            if modal_content.endswith('}'):
                modal_content = modal_content[:-1].strip()
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
    os.makedirs('src/components/poker-near-me/modals', exist_ok=True)
    with open(f'src/components/poker-near-me/modals/{component_name}.js', 'w') as f:
        f.write(new_component.strip() + "\n")
        
    print(f"Successfully extracted {component_name}.")
    
    # Add dynamic import
    import_stmt = f"const {component_name} = dynamic(() => import('../../../src/components/poker-near-me/modals/{component_name}'), {{ ssr: false }});\n"
    if import_stmt not in new_content:
        # insert near dynamic imports
        dyn_idx = new_content.find("const VenueCard = dynamic")
        if dyn_idx != -1:
            new_content = new_content[:dyn_idx] + import_stmt + new_content[dyn_idx:]
        else:
            export_idx = new_content.find("export default function")
            new_content = new_content[:export_idx] + import_stmt + new_content[export_idx:]
            
    return new_content, True

with open('pages/hub/poker-near-me/lobby.js', 'r') as f:
    content = f.read()

# Let's extract the easiest ones first:
# showManualLocation, showEnablePopup, showLoginPrompt, showTutorial
content, ok1 = process_modal(content, 'ManualLocation', 'ManualLocationModal', [
    'showManualLocation', 'setShowManualLocation', 'manualAddress', 'setManualAddress',
    'handleGeocodeAddress', 'isSearching'
])

content, ok2 = process_modal(content, 'EnablePopup', 'LocationEnablePopup', [
    'showEnablePopup', 'setShowEnablePopup', 'handleRefreshLocation'
])

content, ok3 = process_modal(content, 'LoginPrompt', 'LoginPromptModal', [
    'showLoginPrompt', 'setShowLoginPrompt'
])

content, ok4 = process_modal(content, 'Tutorial', 'PNMTutorialModal', [
    'showTutorial', 'setShowTutorial'
])

if ok1 or ok2 or ok3 or ok4:
    with open('pages/hub/poker-near-me/lobby.js', 'w') as f:
        f.write(content)

