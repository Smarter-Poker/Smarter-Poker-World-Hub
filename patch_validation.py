import re

with open('pages/api/mlb/validation.ts', 'r') as f:
    content = f.read()

old_block = """    if (error) {
      console.error('RPC get_mlb_validation_stats failed:', error.message);
      // Fallback for when RPC is not deployed yet or fails
      return new Response(JSON.stringify({ stats: null }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      });
    }"""
new_block = """    if (error) {
      console.error('RPC get_mlb_validation_stats failed:', error.message);
      return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }"""

content = content.replace(old_block, new_block)

with open('pages/api/mlb/validation.ts', 'w') as f:
    f.write(content)

