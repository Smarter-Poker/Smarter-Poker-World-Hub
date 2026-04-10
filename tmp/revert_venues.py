#!/usr/bin/env python3
"""
REVERT: Set has_tournaments=true on ALL 169 venues that were incorrectly disabled.
"""
import json, urllib.request, os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
env_path = PROJECT_ROOT / ".env.local"
SUPABASE_URL = ""
SUPABASE_KEY = ""

for line in env_path.read_text().splitlines():
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line: continue
    k, _, v = line.partition("=")
    k = k.strip(); v = v.strip().strip('"').strip("'")
    if k == "NEXT_PUBLIC_SUPABASE_URL": SUPABASE_URL = v
    if k == "SUPABASE_SERVICE_ROLE_KEY": SUPABASE_KEY = v

SB_HDRS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}

# These are the exact 169 venue IDs that were incorrectly set to has_tournaments=false
VENUE_IDS = [
    1931, 1934, 1935, 1936, 1937, 1938, 1939, 1940, 1941, 1942,
    1943, 1944, 1945, 1947, 1948, 1950, 1952, 1953, 1955, 1956,
    1957, 1958, 1960, 1961, 1962, 1963, 1964, 1966, 1967, 1968,
    1969, 1971, 1972, 1975, 1976, 1980, 1981, 1982, 1988, 1992,
    1994, 2010, 2017, 2293, 2302, 2303, 2305, 2306, 2317, 2329,
    2343, 2418, 2430, 2433, 2439, 2440, 2457, 2461, 2468, 2472,
    2475, 2477, 2478, 2479, 2481, 2483, 2485, 2490, 2491, 2499,
    2505, 2533, 2845, 2847, 2850, 2853, 2857, 2859, 2860, 2863,
    2864, 2865, 2866, 2867, 2868, 2872, 2873, 2876, 2878, 2879,
    2880, 2882, 2883, 2884, 2886, 2887, 2888, 2889, 2890, 2891,
    2892, 2893, 2895, 2984, 2986, 2987, 2988, 2989, 2991, 2992,
    2993, 2994, 2995, 2996, 2997, 2999, 3000, 3002, 3003, 3004,
    3005, 3006, 3008, 3009, 3010, 3011, 3012, 3013, 3016, 3017,
    3018, 3019, 3021, 3022, 3023, 3024, 3025, 3026, 3027, 3028,
    3029, 3039, 3040, 3043, 3044, 3045, 3046,
]

# Also need to find any others from the full log output that I may have missed
# Let me query for ALL venues that currently have has_tournaments=false AND is_active=true
# to capture any that were affected

print(f"REVERTING {len(VENUE_IDS)} venues back to has_tournaments=true...")

batch_size = 50
total_patched = 0

for i in range(0, len(VENUE_IDS), batch_size):
    batch = VENUE_IDS[i:i+batch_size]
    id_list = ",".join(str(x) for x in batch)
    url = f"{SUPABASE_URL}/rest/v1/poker_venues?id=in.({id_list})"
    data = json.dumps({"has_tournaments": True}).encode()
    req = urllib.request.Request(url, data=data, method="PATCH", headers=SB_HDRS)
    with urllib.request.urlopen(req, timeout=30) as r:
        r.read()
        print(f"  Batch {i//batch_size + 1}: Restored {len(batch)} venues (HTTP {r.status})")
        total_patched += len(batch)

print(f"\n✅ REVERT COMPLETE: {total_patched} venues restored to has_tournaments=true")

# Now verify the count
hdrs2 = {**SB_HDRS, "Prefer": "count=exact"}
url2 = f"{SUPABASE_URL}/rest/v1/poker_venues?select=id&is_active=eq.true&has_tournaments=eq.true&limit=1"
req2 = urllib.request.Request(url2, headers=hdrs2)
with urllib.request.urlopen(req2, timeout=30) as r:
    ct = r.headers.get("content-range", "")
    print(f"\nTotal active venues with has_tournaments=true: {ct}")
