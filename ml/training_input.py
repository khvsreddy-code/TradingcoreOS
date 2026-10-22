"""Security boundary for user-supplied ML training identity, URLs and CSV files."""
from __future__ import annotations
import argparse
import csv
import datetime as dt
import ipaddress
import math
import os
import re
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

MAX_CSV_BYTES = 25 * 1024 * 1024
MAX_CSV_ROWS = 10_000
REQUIRED = frozenset({"timestamp", "open", "high", "low", "close", "volume"})
ALIASES = {"date": "timestamp", "datetime": "timestamp", "shares_traded": "volume"}
SYMBOL_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$")
TIMEFRAME_RE = re.compile(r"^[1-9][0-9]{0,2}(?:s|m|h|d|D|w|W|M)$")
MODEL_ID_RE = re.compile(r"^[a-z][a-z0-9-]{0,63}$")


def validate_training_identity(symbol: str, timeframe: str, horizon: str | int) -> tuple[str, str, int]:
    symbol, timeframe = str(symbol).strip(), str(timeframe).strip()
    if not SYMBOL_RE.fullmatch(symbol) or ".." in symbol or symbol in {".", ".."}:
        raise ValueError("symbol must be a path-safe 1-32 character trading identifier")
    if not TIMEFRAME_RE.fullmatch(timeframe):
        raise ValueError("timeframe must be a compact value such as 1m, 5m, 1h or 1D")
    try:
        horizon_value = int(str(horizon).strip(), 10)
    except (TypeError, ValueError) as error:
        raise ValueError("horizon must be an integer between 1 and 500 candles") from error
    if not 1 <= horizon_value <= 500:
        raise ValueError("horizon must be an integer between 1 and 500 candles")
    return symbol, timeframe, horizon_value


def _allowed_hosts() -> frozenset[str]:
    configured = os.environ.get("ML_TRAINING_ALLOWED_HOSTS", "").strip()
    entries = configured.split(",") if configured else ["raw.githubusercontent.com"]
    hosts = set()
    for entry in entries:
        host = entry.strip().lower().rstrip(".")
        if not host:
            continue
        if "*" in host or not re.fullmatch(r"[a-z0-9.-]{1,253}", host) or ".." in host:
            raise ValueError("ML_TRAINING_ALLOWED_HOSTS must contain exact DNS hostnames")
        try:
            ipaddress.ip_address(host.strip("[]"))
        except ValueError:
            pass
        else:
            raise ValueError("IP-address download hosts are not permitted")
        hosts.add(host)
    if not hosts:
        raise ValueError("no training-data download hosts are configured")
    return frozenset(hosts)


def validate_download_url(url: str) -> str:
    if not isinstance(url, str) or not url.strip() or len(url) > 2048:
        raise ValueError("csv_url must be a non-empty URL no longer than 2048 characters")
    try:
        parsed = urllib.parse.urlsplit(url.strip())
        host, port = (parsed.hostname or "").lower().rstrip("."), parsed.port
    except ValueError as error:
        raise ValueError("csv_url is malformed") from error
    if parsed.scheme.lower() != "https":
        raise ValueError("csv_url must use HTTPS")
    if parsed.username is not None or parsed.password is not None:
        raise ValueError("csv_url must not contain user information")
    if port not in (None, 443):
        raise ValueError("csv_url must use the standard HTTPS port")
    if parsed.fragment:
        raise ValueError("csv_url fragments are not permitted")
    if not host or host not in _allowed_hosts():
        raise ValueError("csv_url host is not on ML_TRAINING_ALLOWED_HOSTS")
    return urllib.parse.urlunsplit(("https", parsed.netloc, parsed.path, parsed.query, ""))


class _AllowlistedRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Re-validate every redirect before another outbound request is issued."""
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        validate_download_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def _parse_timestamp(value: str, row_number: int) -> float:
    try:
        parsed = dt.datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError as error:
        raise ValueError(f"CSV row {row_number}: timestamp must be an ISO-8601 datetime") from error
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt.timezone.utc)
    result = parsed.timestamp()
    if not math.isfinite(result):
        raise ValueError(f"CSV row {row_number}: timestamp is invalid")
    return result


def validate_training_csv(csv_path: str | os.PathLike[str]) -> int:
    path = Path(csv_path)
    if not path.is_file() or path.is_symlink():
        raise ValueError("training CSV must be a regular, non-symlink file")
    if not 0 < path.stat().st_size <= MAX_CSV_BYTES:
        raise ValueError("training CSV must be non-empty and at most 25 MiB")
    count, previous = 0, None
    try:
        with path.open("r", encoding="utf-8-sig", newline="") as stream:
            reader = csv.DictReader(stream)
            raw_headers = reader.fieldnames
            if not raw_headers or any(not str(name).strip() for name in raw_headers):
                raise ValueError("training CSV must contain a non-empty header row")
            headers = [ALIASES.get(str(name).strip().lower().replace(" ", "_"),
                                   str(name).strip().lower().replace(" ", "_")) for name in raw_headers]
            if len(headers) != len(set(headers)):
                raise ValueError("training CSV contains duplicate or conflicting column names")
            missing = sorted(REQUIRED.difference(headers))
            if missing:
                raise ValueError("training CSV is missing required columns: " + ", ".join(missing))
            for row_number, row in enumerate(reader, start=2):
                if row_number > MAX_CSV_ROWS + 1:
                    raise ValueError("training CSV exceeds the 10000-row safety limit")
                if None in row:
                    raise ValueError(f"CSV row {row_number}: row contains more fields than the header")
                values = {}
                for raw_name, canonical_name in zip(raw_headers, headers):
                    raw = row.get(raw_name)
                    if raw is None or not str(raw).strip():
                        raise ValueError(f"CSV row {row_number}: {canonical_name} is missing")
                    values[canonical_name] = str(raw).strip()
                timestamp = _parse_timestamp(values["timestamp"], row_number)
                if previous is not None and timestamp <= previous:
                    raise ValueError(f"CSV row {row_number}: timestamps must be strictly increasing with no duplicates")
                previous = timestamp
                nums = {}
                for name in headers:
                    if name == "timestamp":
                        continue
                    try:
                        value = float(values[name])
                    except ValueError as error:
                        raise ValueError(f"CSV row {row_number}: {name} must be numeric") from error
                    if not math.isfinite(value):
                        raise ValueError(f"CSV row {row_number}: {name} must be finite")
                    nums[name] = value
                op, hi, lo, close, volume = nums["open"], nums["high"], nums["low"], nums["close"], nums["volume"]
                if min(op, hi, lo, close) <= 0 or volume < 0:
                    raise ValueError(f"CSV row {row_number}: OHLC prices must be positive and volume non-negative")
                if hi < max(op, close) or lo > min(op, close) or hi < lo:
                    raise ValueError(f"CSV row {row_number}: OHLC high/low are inconsistent")
                count += 1
    except (csv.Error, UnicodeDecodeError) as error:
        raise ValueError("training input is not a valid UTF-8 CSV file") from error
    if count < 2:
        raise ValueError("training CSV must contain at least two candles")
    return count


def download_training_csv(url: str, output: str | os.PathLike[str]) -> int:
    url = validate_download_url(url)
    target = Path(output)
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary_name = None
    opener = urllib.request.build_opener(_AllowlistedRedirectHandler())
    request = urllib.request.Request(url, headers={
        "User-Agent": "TradingCoreOS-ML-Training/1.0",
        "Accept": "text/csv,application/octet-stream;q=0.9",
    })
    try:
        with opener.open(request, timeout=30) as response:
            validate_download_url(response.geturl())
            if response.headers.get_content_type().lower() in {"text/html", "application/xhtml+xml"}:
                raise ValueError("download server returned HTML instead of CSV")
            length = response.headers.get("Content-Length")
            if length:
                try:
                    if int(length) > MAX_CSV_BYTES:
                        raise ValueError("training download exceeds the 25 MiB safety limit")
                except ValueError as error:
                    if "25 MiB" in str(error):
                        raise
                    raise ValueError("download server returned an invalid Content-Length") from error
            with tempfile.NamedTemporaryFile(mode="wb", prefix=".training-csv-", suffix=".tmp",
                                             dir=target.parent, delete=False) as temporary:
                temporary_name = temporary.name
                total = 0
                while True:
                    chunk = response.read(64 * 1024)
                    if not chunk:
                        break
                    total += len(chunk)
                    if total > MAX_CSV_BYTES:
                        raise ValueError("training download exceeds the 25 MiB safety limit")
                    temporary.write(chunk)
        count = validate_training_csv(temporary_name)
        os.replace(temporary_name, target)
        temporary_name = None
        return count
    except (urllib.error.URLError, TimeoutError) as error:
        raise ValueError("unable to download training CSV over the allowlisted HTTPS connection") from error
    finally:
        if temporary_name:
            try:
                Path(temporary_name).unlink(missing_ok=True)
            except OSError:
                pass


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate TradingCoreOS ML training inputs")
    commands = parser.add_subparsers(dest="command", required=True)
    identity = commands.add_parser("validate-identity")
    identity.add_argument("--symbol", required=True)
    identity.add_argument("--timeframe", required=True)
    identity.add_argument("--horizon", required=True)
    download = commands.add_parser("download")
    download.add_argument("--url", required=True)
    download.add_argument("--output", required=True)
    csv_command = commands.add_parser("validate-csv")
    csv_command.add_argument("--csv", required=True)
    args = parser.parse_args()
    if args.command == "validate-identity":
        symbol, timeframe, horizon = validate_training_identity(args.symbol, args.timeframe, args.horizon)
        print(f"validated symbol={symbol} timeframe={timeframe} horizon={horizon}")
    elif args.command == "download":
        print(f"downloaded and validated {download_training_csv(args.url, args.output)} candles")
    else:
        print(f"validated {validate_training_csv(args.csv)} candles")


if __name__ == "__main__":
    main()
