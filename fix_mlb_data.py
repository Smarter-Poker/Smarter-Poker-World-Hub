import re

with open("src/lib/mlb_data.ts", "r") as f:
    code = f.read()

# Replace import "./cached_data" with "./mlb_cached_data"
code = code.replace('"./cached_data"', '"./mlb_cached_data"')

# Fix getSlate wrapper
code = re.sub(
    r'export const getSlate = \(date: string\) => \n\s*unstable_cache\(\n\s*async \(d: string\) => _getSlate\(d\),\n\s*\["slate", date\],\n\s*\{ revalidate: 120 \}\n\s*\)\(date\);',
    r'export const getSlate = async (date: string) => _getSlate(date);',
    code, flags=re.DOTALL
)

# Fix getGame wrapper
code = re.sub(
    r'export const getGame = \(gamePk: number\) => \n\s*unstable_cache\(\n\s*async \(id: number\) => _getGame\(id\),\n\s*\["game", String\(gamePk\)\],\n\s*\{ revalidate: 120 \}\n\s*\)\(gamePk\);',
    r'export const getGame = async (gamePk: number) => _getGame(gamePk);',
    code, flags=re.DOTALL
)

# Fix getPortfolio wrapper
code = re.sub(
    r'export const getPortfolio = \(date: string\) => \n\s*unstable_cache\(\n\s*async \(d: string\) => _getPortfolio\(d\),\n\s*\["portfolio", date\],\n\s*\{ revalidate: 120 \}\n\s*\)\(date\);',
    r'export const getPortfolio = async (date: string) => _getPortfolio(date);',
    code, flags=re.DOTALL
)

code = code.replace('import { unstable_cache } from "next/cache";\n', '')

with open("src/lib/mlb_data.ts", "w") as f:
    f.write(code)

