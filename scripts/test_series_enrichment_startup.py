"""Execute enrichment entry points against an empty, read-only fixture.

SERIES_TEST_REAL_IMPORTS=1 uses the scraper environment's actual dependencies.
The required general CI job isolates optional parser/browser imports; this is
a startup/configuration contract, not browser or extraction qualification.
"""
import contextlib
import io
import os
from pathlib import Path
import runpy
import subprocess
import sys
import tempfile
import types
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parent
SCRIPTS = ("enrich_series_dates.py", "fix_enrichment.py", "enrich_pdf_sources.py")


def optional_dependencies():
    if os.environ.get("SERIES_TEST_REAL_IMPORTS") == "1":
        return contextlib.nullcontext()
    modules = {name: types.ModuleType(name) for name in (
        "scrapling", "scrapling.fetchers", "dateutil", "dateutil.parser", "bs4", "pdfplumber",
    )}
    def forbidden(*args, **kwargs):
        raise AssertionError("Empty cohort must not parse or start a browser")
    modules["scrapling"].StealthyFetcher = lambda **kwargs: object()
    modules["scrapling.fetchers"].StealthySession = forbidden
    modules["dateutil.parser"].parse = forbidden
    modules["bs4"].BeautifulSoup = forbidden
    modules["pdfplumber"].open = forbidden
    return mock.patch.dict(sys.modules, modules)


class EnrichmentStartupTests(unittest.TestCase):
    def execute(self, script, credential):
        reads = []
        def empty_database(request, *args, **kwargs):
            self.assertEqual(request.get_method(), "GET")
            self.assertIsNone(request.data)
            self.assertEqual(request.headers["Apikey"], "startup-fixture-key")
            reads.append(request.full_url)
            return io.BytesIO(b"[]")
        with tempfile.TemporaryDirectory(prefix="series-startup-") as directory:
            with contextlib.chdir(directory), optional_dependencies(), \
                    mock.patch.dict(os.environ, {"SUPABASE_SERVICE_ROLE_KEY": credential}), \
                    mock.patch("urllib.request.urlopen", side_effect=empty_database), \
                    mock.patch.object(subprocess, "check_call", side_effect=AssertionError("No runtime installs")), \
                    mock.patch.object(subprocess, "Popen", side_effect=AssertionError("No browser for empty work")), \
                    contextlib.redirect_stdout(io.StringIO()):
                runpy.run_path(str(ROOT / script), run_name="__main__")
        return reads

    def test_dates_empty_cohort_starts_and_reads_once(self):
        self.assertEqual(len(self.execute(SCRIPTS[0], "startup-fixture-key")), 1)

    def test_venue_empty_cohort_starts_and_reads_once(self):
        self.assertEqual(len(self.execute(SCRIPTS[1], "startup-fixture-key")), 1)

    def test_pdf_empty_cohort_starts_and_reads_once(self):
        self.assertEqual(len(self.execute(SCRIPTS[2], "startup-fixture-key")), 1)

    def test_dates_missing_credential_stops_before_network(self):
        with self.assertRaisesRegex(SystemExit, "SUPABASE_SERVICE_ROLE_KEY is required"):
            self.execute(SCRIPTS[0], "")

    def test_venue_missing_credential_stops_before_network(self):
        with self.assertRaisesRegex(SystemExit, "SUPABASE_SERVICE_ROLE_KEY is required"):
            self.execute(SCRIPTS[1], "")

    def test_pdf_missing_credential_stops_before_network(self):
        with self.assertRaisesRegex(SystemExit, "SUPABASE_SERVICE_ROLE_KEY is required"):
            self.execute(SCRIPTS[2], "")


if __name__ == "__main__":
    unittest.main()
