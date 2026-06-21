import re

with open('pages/api/mlb/status.ts', 'r') as f:
    code = f.read()

# 1. Remove unused imports
code = code.replace("import { NextApiRequest, NextApiResponse } from 'next';\n", "")

# 2. Add CORS Max-Age
code = code.replace(
    "'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS'",
    "'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',\n                'Access-Control-Max-Age': '86400'"
)
# Wait, there are two of these. Let's do it for the OPTIONS block specifically:
# Actually the JSON_HEADERS is defined globally:
code = code.replace(
    """const JSON_HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': CORS_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS'
};""",
    """const JSON_HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': CORS_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS'
};"""
)

old_options = """    if (req.method === 'OPTIONS') {
        return new Response(null, {
            status: 200,
            headers: {
                'Access-Control-Allow-Origin': CORS_ORIGIN,
                'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS'
            }
        });
    }"""
new_options = """    if (req.method === 'OPTIONS') {
        return new Response(null, {
            status: 200,
            headers: {
                'Access-Control-Allow-Origin': CORS_ORIGIN,
                'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
                'Access-Control-Max-Age': '86400'
            }
        });
    }"""
code = code.replace(old_options, new_options)

# 3. Fix NaN coercion
old_num_sec = 'duration_sec: run?.duration_sec != null ? Number(run.duration_sec) : null,'
new_num_sec = 'duration_sec: run?.duration_sec != null && !isNaN(Number(run.duration_sec)) ? Number(run.duration_sec) : null,'
code = code.replace(old_num_sec, new_num_sec)

old_num_row = 'rows_written: run?.rows_written != null ? Number(run.rows_written) : null,'
new_num_row = 'rows_written: run?.rows_written != null && !isNaN(Number(run.rows_written)) ? Number(run.rows_written) : null,'
code = code.replace(old_num_row, new_num_row)

# 4. array type checks -> We will leave typeof === 'object' alone as the backend won't return an array for those JSON objects, but we can fix it if we want by replacing `typeof d.health === 'object'` with `typeof d.health === 'object' && !Array.isArray(d.health)`.
code = code.replace("typeof d.health === 'object'", "typeof d.health === 'object' && d.health !== null && !Array.isArray(d.health)")
code = code.replace("typeof d.tier_dist === 'object'", "typeof d.tier_dist === 'object' && d.tier_dist !== null && !Array.isArray(d.tier_dist)")
code = code.replace("typeof d.slate === 'object'", "typeof d.slate === 'object' && d.slate !== null && !Array.isArray(d.slate)")
code = code.replace("typeof d.accuracy === 'object'", "typeof d.accuracy === 'object' && d.accuracy !== null && !Array.isArray(d.accuracy)")
code = code.replace("typeof d.table_counts === 'object'", "typeof d.table_counts === 'object' && d.table_counts !== null && !Array.isArray(d.table_counts)")

with open('pages/api/mlb/status.ts', 'w') as f:
    f.write(code)

