from __future__ import annotations

import argparse
import json
import os
from typing import Any

from tvDatafeed import TvDatafeed


def main() -> int:
    parser = argparse.ArgumentParser(description="Discover TradingView symbol candidates for an operator-reviewed exact mapping.")
    parser.add_argument("query", help="Search term passed to tv.search_symbol; this does not select or persist a mapping.")
    parser.add_argument("--exchange", default="", help="Optional exchange filter, for example NSE or MCX.")
    parser.add_argument("--limit", type=int, default=20, choices=range(1, 31))
    args = parser.parse_args()

    username = os.environ.get("TVDATAFEED_USERNAME", "").strip()
    password = os.environ.get("TVDATAFEED_PASSWORD", "")
    client = TvDatafeed(username, password) if username and password else TvDatafeed()
    response = client.search_symbol(args.query, args.exchange)
    candidates: list[dict[str, Any]] = []
    if response is not None and hasattr(response, "to_dict"):
        raw_rows = response.head(args.limit).to_dict(orient="records")
    elif isinstance(response, list):
        raw_rows = response[:args.limit]
    else:
        raw_rows = []

    for row in raw_rows:
        if not isinstance(row, dict):
            continue
        # Return candidates for human confirmation only. Never auto-pick the
        # first fuzzy result or use it as a mapping without persisting and
        # validating the exact exchange, contract and adjustment policy.
        candidate: dict[str, Any] = {}
        for key in ("symbol", "exchange", "description", "type", "provider_id", "source"):
            value = row.get(key)
            if value is not None:
                candidate[key] = str(value)
        candidates.append(candidate)
    print(json.dumps({"query": args.query, "exchange": args.exchange or None, "candidates": candidates}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
