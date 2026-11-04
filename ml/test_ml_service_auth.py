import os
import unittest
from unittest.mock import patch

from fastapi import HTTPException

from ml.app.main import require_ml_service_auth


class MlServiceAuthenticationTests(unittest.TestCase):
    def test_missing_service_secret_fails_closed(self):
        with patch.dict(os.environ, {"ML_SERVICE_SECRET": ""}):
            with self.assertRaises(HTTPException) as raised:
                require_ml_service_auth(None)
        self.assertEqual(raised.exception.status_code, 503)

    def test_short_service_secret_fails_closed(self):
        with patch.dict(os.environ, {"ML_SERVICE_SECRET": "too-short"}):
            with self.assertRaises(HTTPException) as raised:
                require_ml_service_auth("too-short")
        self.assertEqual(raised.exception.status_code, 503)

    def test_wrong_service_secret_is_rejected(self):
        secret = "s" * 40
        with patch.dict(os.environ, {"ML_SERVICE_SECRET": secret}):
            with self.assertRaises(HTTPException) as raised:
                require_ml_service_auth("x" * 40)
        self.assertEqual(raised.exception.status_code, 401)

    def test_matching_service_secret_is_accepted(self):
        secret = "t" * 48
        with patch.dict(os.environ, {"ML_SERVICE_SECRET": secret}):
            self.assertIsNone(require_ml_service_auth(secret))


if __name__ == "__main__":
    unittest.main()
