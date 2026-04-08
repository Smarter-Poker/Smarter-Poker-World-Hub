import re

with open("scripts/scrape_tour_schedules.py", "r") as f:
    text = f.read()

# Replace the TOUR_SOURCES hardcoded block with an import from tournament_sources
new_text = re.sub(
    r"TOUR_SOURCES = \{.*?\n\}", 
    "from scripts.tournament_sources import TOURNAMENT_SOURCES as TOUR_SOURCES", 
    text, 
    flags=re.DOTALL
)

with open("scripts/scrape_tour_schedules.py", "w") as f:
    f.write(new_text)

print("done")
