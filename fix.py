import os

directory = 'pages/api/mlb'

adapter_code = """

import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers.host || 'localhost';
    const url = `${protocol}://${host}${req.url}`;
    
    const requestOptions: RequestInit = {
        method: req.method,
        headers: req.headers as unknown as HeadersInit,
    };
    
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        requestOptions.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    }
    
    const request = new Request(url, requestOptions);
    const response = await edgeHandler(request);
    
    res.status(response.status);
    response.headers.forEach((value, key) => {
        res.setHeader(key, value);
    });
    
    const text = await response.text();
    if (text) {
        try {
            res.json(JSON.parse(text));
        } catch {
            res.send(text);
        }
    } else {
        res.end();
    }
}
"""

for root, _, files in os.walk(directory):
    for filename in files:
        if not filename.endswith('.ts'):
            continue
        filepath = os.path.join(root, filename)
        with open(filepath, 'r') as f:
            content = f.read()
            
        if 'export default async function handler(req: Request)' not in content:
            print(f"Skipping {filepath} - no match")
            continue
        
        if 'async function edgeHandler' in content:
            print(f"Skipping {filepath} - already has adapter")
            continue
            
        content = content.replace('export default async function handler(req: Request)', 'async function edgeHandler(req: Request)')
        
        if 'NextApiRequest' not in content:
            content += adapter_code
        else:
            # If imports exist but not the adapter code itself
            content += adapter_code.replace("import { NextApiRequest, NextApiResponse } from 'next';", "")
            
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"Modified {filepath}")

print("Adapter applied successfully.")
