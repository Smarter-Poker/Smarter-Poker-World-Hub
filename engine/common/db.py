"""engine/common/db.py — Supabase client factory for the Python engine.

Reads SUPABASE_URL + SUPABASE_SERVICE_KEY (or SUPABASE_MLB_URL /
SUPABASE_MLB_SERVICE_KEY for the isolated MLB database).

Usage
-----
    from common import db
    client = db.get_client()           # default (hub) DB
    mlb    = db.get_client("mlb")      # MLB-specific DB (mlb_supabase_*)

    rows = db.fetch_all(client.table("fact_games").select("*").eq("final", True))
"""
from __future__ import annotations

import os
from typing import Any

try:
    from supabase import create_client, Client  # type: ignore[import-not-found]
    _SUPABASE_AVAILABLE = True
except ImportError:
    _SUPABASE_AVAILABLE = False
    Client = Any  # type: ignore[assignment]

# Environment key lookup per database target
_DB_ENV_KEYS: dict[str, tuple[str, str]] = {
    "default": ("SUPABASE_URL", "SUPABASE_SERVICE_KEY"),
    "mlb":     ("SUPABASE_MLB_URL", "SUPABASE_MLB_SERVICE_KEY"),
}

_clients: dict[str, Any] = {}


def get_client(target: str = "mlb") -> Any:
    """Return (and cache) a Supabase client for the given target.

    Parameters
    ----------
    target : str
        "mlb" (default) → MLB analytics database.
        "default"        → main Smarter.Poker hub database.
    """
    if not _SUPABASE_AVAILABLE:
        raise RuntimeError(
            "supabase-py not installed. Run: pip install supabase"
        )

    if target in _clients:
        return _clients[target]

    url_key, key_key = _DB_ENV_KEYS.get(target, _DB_ENV_KEYS["default"])
    url = os.environ.get(url_key)
    key = os.environ.get(key_key)

    if not url or not key:
        # Try .env.local fallback (dev environment)
        _load_dotenv()
        url = os.environ.get(url_key)
        key = os.environ.get(key_key)

    if not url or not key:
        raise EnvironmentError(
            f"Missing environment variables: {url_key} and/or {key_key}. "
            "Ensure they are set in .env.local or the calling shell."
        )

    client = create_client(url, key)
    _clients[target] = client
    return client


def fetch_all(query) -> list[dict]:
    """Execute a Supabase query and return all rows (handles pagination).

    Parameters
    ----------
    query
        A Supabase query builder instance (not yet awaited).

    Returns
    -------
    list[dict]
        All matching rows.
    """
    result = query.execute()
    if hasattr(result, "error") and result.error:
        raise RuntimeError(f"Supabase query error: {result.error}")
    return result.data or []


def _load_dotenv(path: str | None = None) -> None:
    """Minimal .env file loader (no python-dotenv required)."""
    import pathlib
    candidates = [path] if path else [
        pathlib.Path(__file__).parents[2] / ".env.local",
        pathlib.Path(__file__).parents[2] / ".env",
    ]
    for p in candidates:
        if p and pathlib.Path(p).is_file():
            with open(p) as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    k, _, v = line.partition("=")
                    k = k.strip()
                    v = v.strip().strip('"').strip("'")
                    if k and k not in os.environ:
                        os.environ[k] = v
            break
