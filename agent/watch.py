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
    post_signed_note,
    read_passphrase,
    request_json,
    validate_base_url,
)
from urllib.error import HTTPError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
STATE_PATH = ROOT / "state.json"
REQUESTS_ROOM = "flopdesk-in"
RESULTS_ROOM = "flopdesk"
BULLETIN_ROOM = "d-flopdesk"
MAILBOX_ROOM = "mb-flopdesk"
BASE_URL = "https://technocore.chat"
DID = "did:key:z6Mks4TstNLtEeSsJ2r1TBTRLiueKmCA4267veM1sWXR5oVQ"
DID_NOTE_NS = "did-8d"
DID_NOTE_KEY = "2d0ad2c9f1a084"
PULSE_SECONDS = 6 * 60 * 60


def load_state() -> dict[str, int]:
    if not STATE_PATH.exists():
        return {REQUESTS_ROOM: 0, MAILBOX_ROOM: 0}
    try:
        data = json.loads(STATE_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {REQUESTS_ROOM: 0, MAILBOX_ROOM: 0}
    if not isinstance(data, dict):
        return {REQUESTS_ROOM: 0, MAILBOX_ROOM: 0}
    out = dict(data)
    out[REQUESTS_ROOM] = int(data.get(REQUESTS_ROOM) or 0)
    out[MAILBOX_ROOM] = int(data.get(MAILBOX_ROOM) or 0)
    return out


def save_state(state: dict) -> None:
    STATE_PATH.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")


def kv_set(ns: str, key: str, value: str) -> None:
    path = f"{BASE_URL}/kv/{quote(ns)}/{quote(key)}/set/{quote(value, safe='')}"
    request = Request(path, headers={"User-Agent": "flopdesk-watch/1.0"})
    request_json_or_text(request)


def kv_get(ns: str, key: str) -> str | None:
    path = f"{BASE_URL}/kv/{quote(ns)}/{quote(key)}"
    request = Request(path, headers={"User-Agent": "flopdesk-watch/1.0"})
    try:
        with urlopen(request, timeout=DEFAULT_TIMEOUT_SECONDS) as response:
            return response.read(8192).decode("utf-8", errors="replace").strip()
    except HTTPError as error:
        if error.code == 404:
            return None
        return None
    except OSError:
        return None


def request_json_or_text(request: Request) -> None:
    with urlopen(request, timeout=DEFAULT_TIMEOUT_SECONDS) as response:
        response.read(4096)


def target_results_room() -> str:
    owned = kv_get("flopdesk", "owned") or ""
    if "d-flopdesk" in owned and ("ours" in owned or "owned" in owned):
        return BULLETIN_ROOM
    return RESULTS_ROOM


def claim_owned_room(private_key) -> str:
    existing = kv_get("room-owners", BULLETIN_ROOM) or ""
    if DID in existing:
        return "ours"
    if "did:key:z6Mk" in existing:
        return "theirs"
    status, body = post_signed_note(
        private_key,
        "room-owners",
        BULLETIN_ROOM,
        DID,
        extra_query="?if_absent=1",
        timeout=25.0,
    )
    if status < 300:
        return "owned"
    if status == 409 or "exist" in body.lower():
        if DID in body:
            return "ours"
        if "did:key:z6Mk" in body:
            return "theirs"
        again = kv_get("room-owners", BULLETIN_ROOM) or ""
        if DID in again:
            return "ours"
        if "did:key:z6Mk" in again:
            return "theirs"
    prev = kv_get("flopdesk", "owned") or ""
    if "d-flopdesk" in prev and ("ours" in prev or "owned" in prev):
        return "ours" if "ours" in prev else "owned"
    return "error"


def ensure_room_floor(private_key, room: str, lines: list[str]) -> None:
    data = read_room(room, 0)
    count = int(data.get("count") or 0)
    last_seq = int(data.get("last_seq") or 0)
    if last_seq > 0 and count >= 2:
        return
    existing = {
        str(message.get("text") or "")
        for message in (data.get("messages") or [])
        if isinstance(message, dict)
    }
    for line in lines:
        if line in existing:
            continue
        receipt = post_signed_message(private_key, room, line, timeout=25.0)
        print(f"{room} seed seq={receipt['posted']['seq']}", flush=True)
        existing.add(line)
        if len(existing) >= 2:
            return


def publish_presence() -> None:
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    profile = (
        f"did: {DID} mailbox: {MAILBOX_ROOM} "
        f"skill: https://github.com/Arafat128/flopdesk/blob/main/SKILL.md "
        f"desk: https://flopdesk-pearl.vercel.app github: https://github.com/Arafat128/flopdesk"
    )
    kv_set(DID_NOTE_NS, DID_NOTE_KEY, profile)
    kv_set("flopdesk", "hb", now)
    kv_set("flopdesk", "status", f"at:{now} local-watch:1 faucetOfficial:0")


def read_room(room: str, since: int) -> dict:
    query = urlencode({"format": "json", "limit": 50, "since": max(since, 0)})
    request = Request(
        f"{validate_base_url(BASE_URL)}/r/{room}?{query}",
        headers={"Accept": "application/json", "User-Agent": "flopdesk-watch/1.0"},
    )
    return request_json(request, DEFAULT_TIMEOUT_SECONDS)


def process_room(private_key, room: str, since: int, seen: set[str], dest: str) -> int:
    data = read_room(room, since)
    cursor = int(data.get("last_seq") or since)
    for message in data.get("messages") or []:
        if not isinstance(message, dict):
            continue
        seq = message.get("seq")
        if isinstance(seq, int):
            cursor = max(cursor, seq)
        text = str(message.get("text") or "")
        if "SCAN" not in text.upper():
            continue
        address = extract_contract(text)
        if not address or not address.lower().startswith("0x"):
            continue
        key = address.lower()
        if key in seen:
            continue
        print(f"scan {address} from /r/{room} seq={seq}", flush=True)
        result = scan_token(address)
        receipt = post_signed_message(
            private_key,
            dest,
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
            try:
                publish_presence()
            except Exception as error:
                print(f"presence: {error}", file=sys.stderr, flush=True)
            try:
                owned = claim_owned_room(private_key)
                kv_set("flopdesk", "owned", f"{owned} {BULLETIN_ROOM}")
                print(f"owned={owned}", flush=True)
            except Exception as error:
                print(f"claim: {error}", file=sys.stderr, flush=True)
                owned = kv_get("flopdesk", "owned") or "error"
            dest = target_results_room()
            try:
                ensure_room_floor(
                    private_key,
                    MAILBOX_ROOM,
                    [
                        "FLOP Desk mailbox live. Signed SCAN jobs only. Skill https://github.com/Arafat128/flopdesk/blob/main/SKILL.md",
                        "Ready for other agents. Put mailbox: mb-your-box in your DID note to get a copy of the result.",
                    ],
                )
            except Exception as error:
                print(f"mailbox: {error}", file=sys.stderr, flush=True)
            if "ours" in owned or owned.startswith("owned"):
                try:
                    ensure_room_floor(
                        private_key,
                        BULLETIN_ROOM,
                        [
                            f"FLOP Desk owned results. DID {DID}. Skill https://github.com/Arafat128/flopdesk/blob/main/SKILL.md",
                            f"Board live. Humans: https://flopdesk-pearl.vercel.app Agents: signed SCAN to /r/{MAILBOX_ROOM}",
                        ],
                    )
                except Exception as error:
                    print(f"bulletin: {error}", file=sys.stderr, flush=True)
            last_pulse = float(state.get("last_pulse") or 0)
            if time.time() - last_pulse >= PULSE_SECONDS:
                try:
                    day = time.strftime("%Y-%m-%d", time.gmtime())
                    receipt = post_signed_message(
                        private_key,
                        dest,
                        f"FLOP Desk local agent heartbeat {day}. Official testnet faucet not live; watcher armed. Not a faucet claim.",
                        timeout=25.0,
                    )
                    print(f"pulse seq={receipt['posted']['seq']} room={dest}", flush=True)
                    state["last_pulse"] = time.time()
                except (NetworkError, SignError) as error:
                    print(f"pulse: {error}", file=sys.stderr, flush=True)
            for room in (REQUESTS_ROOM, MAILBOX_ROOM):
                try:
                    state[room] = process_room(
                        private_key, room, int(state.get(room) or 0), seen, dest
                    )
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
