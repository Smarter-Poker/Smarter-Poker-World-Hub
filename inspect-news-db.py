import os
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client

def test():
    env_path = Path('/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/.env.local')
    load_dotenv(dotenv_path=env_path)
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    supabase = create_client(url, key)
    
    # Fetch 1 row and print keys
    res = supabase.table("poker_news").select("*").limit(1).execute()
    if res.data:
        print("Columns in poker_news:")
        for k, v in res.data[0].items():
            print(f" - {k}: {type(v)} (value: {v})")
    else:
        print("No data in poker_news table!")

if __name__ == "__main__":
    test()
