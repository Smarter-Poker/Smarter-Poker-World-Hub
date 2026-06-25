import re

with open('pages/api/mlb/model-intel.ts', 'r') as f:
    content = f.read()

# Replace the fallback block with an error return
old_block = """    } else {
      if (rpcError) {
        console.warn('[API/MLB/ModelIntel] RPC unavailable, using fallback:', rpcError.message);
      }
      payload = await fallbackAggregate(mlbDb);
    }"""
new_block = """    } else {
      console.error('[API/MLB/ModelIntel] RPC failed:', rpcError?.message);
      return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }"""

content = content.replace(old_block, new_block)

# Remove the fallbackAggregate function entirely
fallback_start = content.find('// FALLBACK: replicate the RPC aggregation in JS')
if fallback_start != -1:
    import builtins
    lines = content[fallback_start:].split('\n')
    fallback_end = -1
    brace_count = 0
    in_function = False
    
    for i, line in enumerate(lines):
        if 'async function fallbackAggregate' in line:
            in_function = True
            
        if in_function:
            brace_count += line.count('{')
            brace_count -= line.count('}')
            
            if brace_count == 0 and line.strip() == '}':
                fallback_end = fallback_start + sum(len(l) + 1 for l in lines[:i+1])
                break
                
    if fallback_end != -1:
        content = content[:fallback_start] + content[fallback_end:]

with open('pages/api/mlb/model-intel.ts', 'w') as f:
    f.write(content)

