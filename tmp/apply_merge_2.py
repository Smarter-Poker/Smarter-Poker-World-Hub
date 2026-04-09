import os, re

FILE_PATH = "/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/scripts/tournament-schedule-daemon.py"

with open(FILE_PATH, "r") as f:
    content = f.read()

enrich_code = """
def run_enrichment_pass(dry_run: bool):
    log("🔍 ENRICHMENT PASS — targeting scrape_completeness_score < 60")
    venues = sb_get("venue_daily_tournaments","?select=venue_id,venue_name,scrape_completeness_score,flags,best_scrape_url&scrape_completeness_score=lt.60&human_verified=is.false&limit=500")
    seen_venues = {}
    for row in venues:
        vid = row.get("venue_id")
        if vid and vid not in seen_venues:
            flags = row.get("flags") or []
            if "permanently_ungettable" not in flags:
                seen_venues[vid] = row
    targets = list(seen_venues.values())
    log(f"  {len(targets)} venues need enrichment")
    if not targets: return
    
    venue_reg = sb_get("poker_venues", "?select=id,name,state,website,pokeratlas_slug,pokeratlas_id,bravopokerlive_slug,schedule_scrape_url")
    v_map = {v["id"]: v for v in venue_reg}
    
    session = new_session()
    batch_id = str(uuid.uuid4())
    ok = 0
    for i, vrow in enumerate(targets):
        vid = vrow.get("venue_id")
        vname = vrow.get("venue_name")
        info = v_map.get(vid, {})
        # build venue dict equivalent to load_venues()
        v_dict = {
            "id": vid, "name": vname, "state": info.get("state", ""),
            "website": info.get("website", ""),
            "pokeratlas_slug": info.get("pokeratlas_slug", "") or info.get("pokeratlas_id", ""),
            "bravopokerlive_slug": info.get("bravopokerlive_slug", ""),
            "schedule_scrape_url": info.get("schedule_scrape_url", "")
        }
        log(f"    [{i+1}/{len(targets)}] Enriching {vname}")
        try:
            res = scrape_venue(v_dict, session, batch_id, hm_map={}, cp_map={})
            if res.get("found") and res.get("records"):
                recs = []
                for r in res["records"]:
                    if r.get("is_recurring"): recs.extend(expand_to_dated_rows(r))
                    else: recs.append(r)
                if not dry_run:
                    sb_upsert("venue_daily_tournaments", recs)
                ok += 1
        except Exception as e:
            log(f"    ❌ {e}")
    try: session.close()
    except: pass
    log(f"✅ Enrichment pass complete — {ok} enriched")
"""

content = re.sub(r'def run_enrichment_pass\(\):\n    pass\n', lambda m: enrich_code, content)

# Inject expand_to_dated_rows inside scrape_venue
scrape_ven = """
        if results:
            log(f"      ✅ +{len(results)} [{source_name}]")
            expanded = []
            for r in results:
                if r.get("is_recurring"): expanded.extend(expand_to_dated_rows(r))
                else: expanded.append(r)
            return {"name": venue["name"], "vid": vid, "found": True, "records": expanded}
"""
content = re.sub(r'        if results:\n            log.*?return \{.*?\}', lambda m: scrape_ven, content, flags=re.DOTALL)

# Add --enrich argument to argparse and main execution
arg_code = """
    p.add_argument("--enrich", action="store_true", help="Run enrichment pass on incomplete records")
    args=p.parse_args()

    if args.enrich:
        run_enrichment_pass(args.dry_run)
        sys.exit(0)
"""
content = re.sub(r'    args=p\.parse_args\(\)', lambda m: arg_code, content)

with open(FILE_PATH, "w") as f:
    f.write(content)
