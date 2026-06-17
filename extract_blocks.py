import re
import os

with open('pages/hub/settings.js', 'r') as f:
    content = f.read()

def extract_modal(modal_var, component_name):
    start_str = f"{{show{modal_var}Modal && ("
    start_idx = content.find(start_str)
    if start_idx == -1:
        print(f"Could not find {start_str}")
        return content, ""
    
    # find matching parenthesis
    paren_count = 0
    in_modal = False
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
        return content, ""
        
    # include the closing `}`
    if end_idx < len(content) and content[end_idx] == '}':
        end_idx += 1
        
    extracted = content[start_idx:end_idx]
    
    # replace in content
    props_str = f"                    show{modal_var}Modal={{show{modal_var}Modal}}\n"
    new_content = content[:start_idx] + f"<{component_name}\n{props_str}                    {{...props}}\n                />" + content[end_idx:]
    
    return new_content, extracted

def save_component(component_name, extracted_content):
    # strip outer { ... } if exists
    extracted_content = extracted_content.strip()
    if extracted_content.startswith("{") and extracted_content.endswith("}"):
        extracted_content = extracted_content[1:-1].strip()
    
    # remove the condition `showXModal && (`
    extracted_content = re.sub(r'^show[a-zA-Z0-9_]+Modal\s*&&\s*\(', '', extracted_content).strip()
    if extracted_content.endswith(")"):
        extracted_content = extracted_content[:-1].strip()
        
    template = f"""import React from 'react';
import {{ QRCodeSVG }} from 'qrcode.react';

export default function {component_name}(props) {{
    const {{ show{component_name.replace('Modal', '')}Modal, setShow{component_name.replace('Modal', '')}Modal, ...rest }} = props;
    
    // We will just spread rest into local variables for now or pass them correctly
    // To make this robust without parsing every prop, we can destructure what we need
    // Or just use props.variable
    // Actually, in JS we can just use the props object, but the JSX expects variables.
    // Let's just create a generic wrapper
    return (
        {extracted_content}
    );
}}
"""
    os.makedirs('src/components/settings/modals', exist_ok=True)
    with open(f'src/components/settings/modals/{component_name}.js', 'w') as f:
        f.write(template)

# For now, let's just do it manually with Python instead of the script modifying all of them at once,
# because we need to explicitly list the props for React. 
# A lazy way in React is to define the component inline in the same file, then next/dynamic won't split it.
# To split it, it MUST be in a separate file.
# If it's in a separate file, ALL state variables used in the JSX must be passed as props.
