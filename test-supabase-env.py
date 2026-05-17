import os
from pathlib import Path
from dotenv import load_dotenv

def test():
    env_path = Path('/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/.env.local')
    if env_path.exists():
        load_dotenv(dotenv_path=env_path)
        print("✅ .env.local loaded!")
        print("NEXT_PUBLIC_SUPABASE_URL:", os.environ.get("NEXT_PUBLIC_SUPABASE_URL"))
        # Check if we can import supabase and initialize it
        try:
            from supabase import create_client
            url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
            key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
            supabase = create_client(url, key)
            print("✅ Supabase client initialized!")
            # Let's query one row from poker_news to verify
            res = supabase.table("poker_news").select("title,published_at").order("published_at", desc=True).limit(1).execute()
            print("Query successful! Latest article:")
            print(res.data)
        except Exception as e:
            print("❌ Supabase query failed:", e)
    else:
        print("❌ .env.local not found!")

if __name__ == "__main__":
    test()
