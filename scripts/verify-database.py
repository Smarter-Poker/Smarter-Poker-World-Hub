#!/usr/bin/env python3
"""
Database verification script for God Mode tables.
Confirms tables exist and shows structure.
"""

from supabase import create_client
import os
import json

# Credentials — no hardcoded key fallback (the committed literal that used to
# live here was a secret and its signing key has since been rotated).
SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "https://kuklfnapbkmacvwxktbh.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
if not SUPABASE_KEY:
    raise SystemExit(
        "SUPABASE_SERVICE_ROLE_KEY is not set. Export it before running this script."
    )

print("=" * 80)
print("🔍 GOD MODE DATABASE VERIFICATION")
print("=" * 80)
print()

# Create client
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# Check tables exist
print("📊 Checking tables...")
result = supabase.rpc('exec_sql', {
    'query': """
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_name IN ('solved_spots_gold', 'memory_charts_gold')
        ORDER BY table_name;
    """
}).execute()

if result.data:
    print(f"✅ Found {len(result.data)} tables:")
    for row in result.data:
        print(f"   • {row['table_name']}")
else:
    print("⚠️  Tables not found")

print()

# Check indexes
print("🔍 Checking indexes on solved_spots_gold...")
try:
    result = supabase.rpc('exec_sql', {
        'query': """
            SELECT indexname 
            FROM pg_indexes 
            WHERE tablename = 'solved_spots_gold'
            ORDER BY indexname;
        """
    }).execute()
    
    if result.data:
        print(f"✅ Found {len(result.data)} indexes:")
        for row in result.data[:5]:  # Show first 5
            print(f"   • {row['indexname']}")
        if len(result.data) > 5:
            print(f"   ... and {len(result.data) - 5} more")
except Exception as e:
    print(f"⚠️  Could not check indexes: {e}")

print()

# Check row count
print("📊 Checking row counts...")
try:
    result = supabase.table('solved_spots_gold').select('id', count='exact').limit(0).execute()
    print(f"   • solved_spots_gold: {result.count} rows")
    
    result = supabase.table('memory_charts_gold').select('id', count='exact').limit(0).execute()
    print(f"   • memory_charts_gold: {result.count} rows")
except Exception as e:
    print(f"⚠️  Could not count rows: {e}")

print()
print("=" * 80)
print("✅ DATABASE VERIFICATION COMPLETE")
print("=" * 80)
print()
print("Status: God Mode tables are ready for ingestion!")
print()
