import os, re

FILE_PATH = "/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/scripts/tournament-schedule-daemon.py"

with open(FILE_PATH, "r") as f:
    content = f.read()

# Fix PA fetch and JSON-LD
pa_fetch = """
        try:
            html = getattr(session, 'fetch_page', lambda u: session.fetch(u).html_content)(pa_url)
            if not html: continue
"""
content = re.sub(r'        try:\n            # networkidle ensures Next\.js SPA fully renders tournament data.*?html=body\.decode\("utf-8","ignore"\)', lambda m: pa_fetch, content, flags=re.DOTALL)

pa_json_ld = """
            # JSON-LD canonical venue website discovery + STATE MATCH + EXPECT ADDRESS
            address_found = False
            for jld_raw in re.findall(r'<script[^>]*application/ld\+json[^>]*>(.*?)</script>',html,re.DOTALL|re.I):
                try:
                    jld=json.loads(jld_raw)
                    addr = jld.get("address", {})
                    if addr:
                        address_found = True
                        region = addr.get("addressRegion", "").strip().upper()
                        if state and region and state.upper() not in region and region not in state.upper():
                            log(f"      ❌ LAYER 2 REJECT: JSON-LD State '{region}' != Venue '{state}'")
                            return result # abort venue completely
                    canonical=jld.get("url") or jld.get("@id") or ""
                    if canonical and canonical.startswith("http") and "pokeratlas" not in canonical:
                        parts=canonical.split("//",1)
                        if len(parts)==2:
                            origin=parts[0]+"//"+parts[1].split("/")[0]
                            venue.setdefault("_extra_origins",[]).append(origin)
                except: pass
            
            if not address_found:
                log(f"      ❌ LAYER 2 REJECT: No address mapped in JSON-LD")
                return result
                
            # evidence drop
            save_evidence(name, "pokeratlas", {"url": pa_url, "records_found": len(recs), "html_hash": sha256h(html.encode('utf-8','ignore'))})
"""
content = re.sub(r'            # JSON-LD canonical venue website discovery.*?except: pass', lambda m: pa_json_ld, content, flags=re.DOTALL)


# Fix Bravo fetch
bravo_fetch = """
    try:
        html = getattr(session, 'fetch_page', lambda u: session.fetch(u).html_content)(bravo_url)
        if html:
            save_evidence(name, "bravo", {"url": bravo_url, "html_hash": sha256h(html.encode("utf-8","ignore"))})
"""
content = re.sub(r'    try:\n        resp=session\.fetch\(bravo_url,timeout=12000,wait_until="domcontentloaded"\)\n        if resp and resp\.status==200:\n            body=resp\.body if isinstance\(resp\.body,bytes\) else str\(resp\.body\)\.encode\("utf-8"\)\n            html=body\.decode\("utf-8","ignore"\)', lambda m: bravo_fetch, content)


# Fix HM fetch
hm_fetch = """
    try:
        html = getattr(session, 'fetch_page', lambda u: session.fetch(u).html_content)(url)
        if not html: return {}
        h = sha256h(html.encode('utf-8', 'ignore'))
"""
content = re.sub(r'    try:\n        resp = session\.fetch\(url, google_search=True, timeout=45000, wait_until="networkidle"\)\n        if not resp or resp\.status != 200:\n            log\(f"  \[HendonMob\] HTTP \{getattr\(resp,\'status\',0\)\} — skipped"\); return \{\}\n        body = resp\.body if isinstance\(resp\.body,bytes\) else str\(resp\.body\)\.encode\("utf-8"\)\n        html = body\.decode\("utf-8","ignore"\)\n        h    = sha256h\(body\)', lambda m: hm_fetch, content)


# Fix CP fetch
cp_fetch = """
    try:
        html = getattr(session, 'fetch_page', lambda u: session.fetch(u).html_content)(url)
        if not html: return {}
        h = sha256h(html.encode('utf-8', 'ignore'))
"""
content = re.sub(r'    try:\n        resp = session\.fetch\(url, google_search=False, timeout=45000, wait_until="networkidle"\)\n        if not resp or resp\.status != 200:\n            log\(f"  \[CardPlayer\] HTTP \{getattr\(resp,\'status\',0\)\} — skipped"\); return \{\}\n        body = resp\.body if isinstance\(resp\.body,bytes\) else str\(resp\.body\)\.encode\("utf-8"\)\n        html = body\.decode\("utf-8","ignore"\)\n        h    = sha256h\(body\)', lambda m: cp_fetch, content)

with open(FILE_PATH, "w") as f:
    f.write(content)
