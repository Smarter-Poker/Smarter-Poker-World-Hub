import re

with open("scratch/engine_page.tsx", "r") as f:
    engine_jsx = f.read()

# The engine JSX starts with `export default async function Home`
# I'll extract everything inside the return (...) block
return_match = re.search(r'return \((.*)\);[ \n]*}', engine_jsx, re.DOTALL)
if not return_match:
    print("Could not find return block")
    exit(1)

jsx_content = return_match.group(1)

# I need to pull out the EdgeBadge and getTeamName functions from engine_page.tsx
# Actually they are above export default async function Home.
# Let me just grab them from mlb-analytics-engine/web/src/app/page.tsx directly.

with open("/Users/smarter.poker/mlb-analytics-engine/web/src/app/page.tsx", "r") as f:
    full_engine = f.read()

helpers_match = re.search(r'function EdgeBadge.*?return fullName\.split\(" "\)\.pop\(\) \?\? fullName;\n}', full_engine, re.DOTALL)
if not helpers_match:
    print("Could not find helpers")
    exit(1)

helpers = helpers_match.group(0)

# Replace <main className="..."> with the layout wrappers
jsx_content = jsx_content.replace('<main className="min-h-screen bg-[#0a0a15] pb-20 font-sans w-full max-w-[100vw] overflow-x-hidden box-border">', '')
# At the end, remove the closing </main>
jsx_content = jsx_content.rsplit('</main>', 1)[0]

new_file = f"""import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import useSWR from 'swr';
import {{ Loader2 }} from 'lucide-react';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import MlbSubNav from '../../../src/components/ui/MlbSubNav';
import SEOHead from '../../../src/components/seo/SEOHead';
import {{ BetScoreBadge }} from '../../../src/components/mlb/BetScoreBadge';
import {{ teamLogo }} from '../../../src/lib/mlb_data';

{helpers}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function MlbSlateDashboard() {{
    const {{ data, error, isLoading }} = useSWR('/api/mlb/dashboard', fetcher, {{
        refreshInterval: 15000,
    }});

    const todayStr = data?.todayStr || new Date().toISOString().split('T')[0];
    const fullSlate = data?.slateGames || [];
    const fetchError = error ? true : false;
    
    // Add these missing variables from the engine page:
    const actionable = false;
    const propsOnly = false;
    const minEdge = 0;

    const formattedDate = new Date(todayStr + 'T12:00:00Z').toLocaleDateString('en-US', {{
        weekday: 'long',
        month: 'short',
        day: 'numeric'
    }});

    return (
        <div className="min-h-screen bg-[#0a0a15] pb-20 font-sans w-full max-w-[100vw] overflow-x-hidden box-border text-slate-200">
            <SEOHead 
                title={{`MLB Slate - ${{formattedDate}}`}}
                description="Daily MLB Slate, predictive analytics, and top game insights."
            />
            
            <UniversalHeader pageDepth={{2}} />
            <MlbSubNav />

            <main className="min-h-screen bg-[#0a0a15] pb-20 font-sans w-full max-w-[100vw] overflow-x-hidden box-border">
                {{isLoading ? (
                    <div className="flex flex-col items-center justify-center mt-20">
                        <Loader2 className="w-8 h-8 animate-spin text-[#00D4FF] mb-4" />
                        <span className="text-[#5a6a7a] font-mono font-black tracking-widest text-[10px] uppercase">
                            INITIALIZING SLATE_DATA...
                        </span>
                    </div>
                ) : (
                    <>
                        {jsx_content}
                    </>
                )}}
            </main>
        </div>
    );
}}
"""

with open("pages/hub/MLB-ANALYTICS/index.tsx", "w") as f:
    f.write(new_file)

print("Generated pages/hub/MLB-ANALYTICS/index.tsx successfully.")
