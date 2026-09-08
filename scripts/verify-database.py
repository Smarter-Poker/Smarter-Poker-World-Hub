#!/usr/bin/env python3
"""Read-only operator verification for the solver warehouse tables.

Phase 6 forbids operator tooling from using the service role for warehouse
inspection. A temporary service-role SELECT grant remains only so a protected
migration-first rollout can be rolled back without an outage; direct DML is
revoked. This diagnostic therefore uses the database-owner credential and
opens a transaction in PostgreSQL's read-only mode. It never uses the
service-role JWT and cannot be used as an ingestion path.
"""

import os
import re
from urllib.parse import urlparse

import psycopg2


def db_config():
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    password = os.environ.get("SUPABASE_DB_PASSWORD")
    if not url or not password:
        raise SystemExit(
            "Solver warehouse verification requires NEXT_PUBLIC_SUPABASE_URL and "
            "SUPABASE_DB_PASSWORD. Operator diagnostics must not use "
            "SUPABASE_SERVICE_ROLE_KEY for solved_spots_gold."
        )
    parsed_url = urlparse(url)
    if parsed_url.scheme != "https" or not re.fullmatch(
        r"[a-z0-9]+\.supabase\.co", parsed_url.hostname or "", re.IGNORECASE
    ):
        raise SystemExit(
            "NEXT_PUBLIC_SUPABASE_URL is invalid; expected an "
            "https://<project-ref>.supabase.co URL."
        )

    host = os.environ.get("SUPABASE_DB_HOST")
    if not host:
        project_ref = parsed_url.hostname.split(".")[0]
        if not project_ref:
            raise SystemExit("NEXT_PUBLIC_SUPABASE_URL has no project reference.")
        host = f"db.{project_ref}.supabase.co"
    return {
        "host": host,
        "port": int(os.environ.get("SUPABASE_DB_PORT", "5432")),
        "user": os.environ.get("SUPABASE_DB_USER", "postgres"),
        "password": password,
        "dbname": os.environ.get("SUPABASE_DB_NAME", "postgres"),
        # The DB password is an operator credential; encryption without
        # certificate verification leaves the connection open to MITM.
        "sslmode": "verify-full",
        "connect_timeout": 15,
        "options": "-c default_transaction_read_only=on -c statement_timeout=120000",
    }


def main():
    print("=" * 80)
    print("🔍 GOD MODE DATABASE VERIFICATION (read-only operator connection)")
    print("=" * 80)
    print()

    connection = psycopg2.connect(**db_config())
    try:
        with connection:
            with connection.cursor() as cursor:
                print("📊 Checking tables...")
                cursor.execute(
                    """
                    SELECT table_name
                    FROM information_schema.tables
                    WHERE table_schema = 'public'
                      AND table_name IN ('solved_spots_gold', 'memory_charts_gold')
                    ORDER BY table_name
                    """
                )
                tables = cursor.fetchall()
                table_names = {table_name for (table_name,) in tables}
                expected_tables = {"solved_spots_gold", "memory_charts_gold"}
                if table_names != expected_tables:
                    missing = ", ".join(sorted(expected_tables - table_names)) or "none"
                    raise SystemExit(
                        f"Required solver warehouse tables are missing: {missing}."
                    )
                print(f"✅ Found {len(tables)} required tables:")
                for table_name in sorted(table_names):
                    print(f"   • {table_name}")

                print()
                print("🔍 Checking indexes on solved_spots_gold...")
                cursor.execute(
                    """
                    SELECT indexname
                    FROM pg_indexes
                    WHERE schemaname = 'public' AND tablename = 'solved_spots_gold'
                    ORDER BY indexname
                    """
                )
                indexes = cursor.fetchall()
                if not indexes:
                    raise SystemExit("solved_spots_gold has no indexes; verification failed.")
                print(f"✅ Found {len(indexes)} indexes:")
                for (index_name,) in indexes[:5]:
                    print(f"   • {index_name}")
                if len(indexes) > 5:
                    print(f"   ... and {len(indexes) - 5} more")

                print()
                print("📊 Checking row counts...")
                empty_tables = []
                for table in ("solved_spots_gold", "memory_charts_gold"):
                    cursor.execute(f"SELECT count(*) FROM public.{table}")
                    count = cursor.fetchone()[0]
                    print(f"   • {table}: {count} rows")
                    if count <= 0:
                        empty_tables.append(table)
                if empty_tables:
                    raise SystemExit(
                        "Required solver warehouse tables are empty: "
                        + ", ".join(empty_tables)
                    )
    finally:
        connection.close()

    print()
    print("=" * 80)
    print("✅ DATABASE VERIFICATION COMPLETE")
    print("=" * 80)


if __name__ == "__main__":
    main()
