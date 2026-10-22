from __future__ import annotations
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from training_input import _AllowlistedRedirectHandler, validate_download_url, validate_training_csv, validate_training_identity

VALID = (
    "timestamp,open,high,low,close,volume\n"
    "2026-10-20T09:15:00Z,100,102,99,101,1000\n"
    "2026-10-20T09:20:00Z,101,104,100,103,1200\n"
    "2026-10-20T09:25:00Z,103,105,102,104,900\n"
)

class TrainingInputSecurityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "candles.csv"

    def write(self, value):
        self.path.write_text(value, encoding="utf-8")

    def test_default_allowlisted_https_host(self):
        with patch.dict(os.environ, {"ML_TRAINING_ALLOWED_HOSTS": ""}, clear=False):
            self.assertEqual(validate_download_url("https://raw.githubusercontent.com/acme/data/candles.csv"),
                             "https://raw.githubusercontent.com/acme/data/candles.csv")

    def test_rejects_bad_scheme_host_credentials_and_port(self):
        bad = ("http://raw.githubusercontent.com/data.csv", "file:///etc/passwd",
               "https://evil.example/data.csv", "https://u:p@raw.githubusercontent.com/data.csv",
               "https://raw.githubusercontent.com:8443/data.csv", "https://127.0.0.1/private.csv")
        for url in bad:
            with self.subTest(url=url), self.assertRaises(ValueError):
                validate_download_url(url)

    def test_redirect_cannot_escape_allowlist(self):
        with self.assertRaises(ValueError):
            _AllowlistedRedirectHandler().redirect_request(
                None, None, 302, "Found", {}, "https://evil.example/data.csv"
            )

    def test_identity_sanitization_and_bounds(self):
        self.assertEqual(validate_training_identity("NIFTY50", "1D", "1"), ("NIFTY50", "1D", 1))
        bad = (("../ml", "1D", 1), ("NIFTY;touch", "1D", 1), ("NIFTY50", "../5m", 1),
               ("NIFTY50", "5m", 0), ("NIFTY50", "5m", 501), ("NIFTY50", "5m", "1;echo unsafe"))
        for row in bad:
            with self.subTest(row=row), self.assertRaises(ValueError):
                validate_training_identity(*row)

    def test_valid_csv_and_header_aliases(self):
        self.write(VALID)
        self.assertEqual(validate_training_csv(self.path), 3)
        for old, new in (("timestamp", "datetime"), ("timestamp", "date")):
            self.write(VALID.replace(old + ",open", new + ",open"))
            self.assertEqual(validate_training_csv(self.path), 3)

    def test_duplicate_timestamp_is_rejected(self):
        self.write(VALID.replace("2026-10-20T09:20:00Z,101", "2026-10-20T09:15:00Z,101"))
        with self.assertRaisesRegex(ValueError, "strictly increasing"):
            validate_training_csv(self.path)

    def test_missing_non_numeric_nonfinite_and_bad_ohlc_are_rejected(self):
        cases = (
            VALID.replace("101,1000", ",1000", 1),
            VALID.replace("100,102,99,101,1000", "100,NaN,99,101,1000", 1),
            VALID.replace("100,102,99,101,1000", "100,98,99,101,1000", 1),
            VALID.replace("100,102,99,101,1000", "100,102,99,101,NaN", 1),
        )
        for item in cases:
            with self.subTest(case=item[:80]):
                self.write(item)
                with self.assertRaises(ValueError):
                    validate_training_csv(self.path)

    def test_duplicate_headers_and_html_are_rejected(self):
        self.write("timestamp,open,Open,low,close,volume\n")
        with self.assertRaisesRegex(ValueError, "duplicate"):
            validate_training_csv(self.path)
        self.write("<html><body>login</body></html>")
        with self.assertRaises(ValueError):
            validate_training_csv(self.path)

if __name__ == "__main__":
    unittest.main(verbosity=2)
