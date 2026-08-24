#!/usr/bin/env python3
"""Local FLOP Desk watcher: read SCAN jobs, lite-scan, post a signed result.

The website is online. This process is local. identity.pem never goes to Vercel.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

from scan_lite import extract_contract, scan_token
from tc_sign import (
    DEFAULT_TIMEOUT_SECONDS,
    NetworkError,
    SignError,
    load_identity,
    post_signed_message,
    read_passphrase,
    request_json,
    validate_base_url,
)
from urllib.parse import urlencode
from urllib.request import Request

ROOT = Path(__file__).resolve().parent
STATE_PATH = ROOT / "state.json"
REQUESTS_ROOM = "flopdesk-in"
RESULTS_ROOM = "flopdesk"
MAILBOX_ROOM = "mb-flopdesk"
BASE_URL = "https://technocore.chat"


def load_state() -> dict[str, int]:
    if not STATE_PATH.exists():
        return {REQUESTS_ROOM: 0, MAILBOX_ROOM: 0}
    try:
        data = json.loads(STATE_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {REQUESTS_ROOM: 0, MAILBOX_ROOM: 0}
    if not isinstance(data, dict):
        return {REQUESTS_ROOM: 0, MAILBOX_ROOM: 0}
    return {
        REQUESTS_ROOM: int(data.get(REQUESTS_ROOM) or 0),
        MAILBOX_ROOM: int(data.get(MAILBOX_ROOM) or 0),
    }


def save_state(state: dict[str, int]) -> None:
    STATE_PATH.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")


def read_room(room: str, since: int) -> dict:
    query = urlencode({"format": "json", "limit": 50, "since": max(since, 0)})
    request = Request(
        f"{validate_base_url(BASE_URL)}/r/{room}?{query}",
        headers={"Accept": "application/json", "User-Agent": "flopdesk-watch/1.0"},
    )
    return request_json(request, DEFAULT_TIMEOUT_SECONDS)


def process_room(private_key, room: str, since: int, seen: set[str]) -> int:
    data = read_room(room, since)
    cursor = int(data.get("last_seq") or since)
    for message in data.get("messages") or []:
        if not isinstance(message, dict):
            continue
        seq = message.get("seq")
        if isinstance(seq, int):
            cursor = max(cursor, seq)
        text = str(message.get("text") or "")
        address = extract_contract(text)
        if not address:
            continue
        key = address.lower()
        if key in seen:
            continue
        print(f"scan {address} from /r/{room} seq={seq}", flush=True)
        result = scan_token(address)
        receipt = post_signed_message(
            private_key,
            RESULTS_ROOM,
            result["summary"],
            timeout=25.0,
        )
        seen.add(key)
        print(
            f"posted seq={receipt['posted']['seq']} verdict={result.get('verdict')}",
            flush=True,
        )
    return cursor


def main() -> int:
    parser = argparse.ArgumentParser(description="Watch FLOP Desk request rooms.")
    parser.add_argument("--key", type=Path, required=True)
    parser.add_argument("--passphrase-file", type=Path)
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    try:
        passphrase = read_passphrase(args.passphrase_file, "TECHNOCORE_PASSPHRASE")
        private_key = load_identity(args.key, passphrase)
        state = load_state()
        seen: set[str] = set()
        while True:
            for room in (REQUESTS_ROOM, MAILBOX_ROOM):
                try:
                    state[room] = process_room(private_key, room, state.get(room, 0), seen)
                except (NetworkError, SignError) as error:
                    print(f"error {room}: {error}", file=sys.stderr, flush=True)
            save_state(state)
            if args.once:
                return 0
            time.sleep(12)
    except (SignError, NetworkError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
