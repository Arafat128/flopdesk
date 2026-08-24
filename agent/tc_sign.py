"""Technocore signed-write primitives and receipt helpers.

Canonical message payload, matching the public Technocore signed lane:

    room|nonce|normalized-text

normalized-text is the server sweep: Unicode categories Cc, Cf, Cs, Co, Zl, Zp
become spaces, then the string is trimmed. Sign anything else and the server
returns HTTP 403.

Room JSON from GET /r/<room> does not include the Ed25519 signature. Save it
yourself at write time or you cannot verify the message offline later.
"""

from __future__ import annotations

import base64
import json
import math
import os
import re
import time
import unicodedata
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from cryptography.exceptions import InvalidSignature, UnsupportedAlgorithm
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)

DEFAULT_BASE_URL = "https://technocore.chat"
DEFAULT_TIMEOUT_SECONDS = 20.0
MAX_MESSAGE_CHARS = 4096
MAX_RESPONSE_BYTES = 5 * 1024 * 1024
MAX_ERROR_RESPONSE_BYTES = 16 * 1024
MULTICODEC_ED25519 = b"\xed\x01"
MULTIBASE_LENGTH = 48
SIGNATURE_LENGTH = 86
RECEIPT_SCHEMA = "technocore-signed-receipt-v1"

BASE58BTC_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
BASE58BTC_INDEX = {character: index for index, character in enumerate(BASE58BTC_ALPHABET)}
INVISIBLE_CATEGORIES = frozenset({"Cc", "Cf", "Cs", "Co", "Zl", "Zp"})
NAME_PATTERN = re.compile(r"[a-z0-9][a-z0-9_-]{0,47}")
NONCE_PATTERN = re.compile(r"[0-9]{1,19}")
SIGNATURE_PATTERN = re.compile(rf"[A-Za-z0-9_-]{{{SIGNATURE_LENGTH}}}")


class SignError(ValueError):
    """Local identity or protocol input is invalid."""


class NetworkError(RuntimeError):
    """A Technocore HTTP request failed or returned an invalid response."""


def base58btc_encode(data: bytes) -> str:
    zeroes = len(data) - len(data.lstrip(b"\x00"))
    number = int.from_bytes(data, "big")
    encoded = ""
    while number:
        number, remainder = divmod(number, 58)
        encoded = BASE58BTC_ALPHABET[remainder] + encoded
    return "1" * zeroes + encoded


def base58btc_decode(value: str) -> bytes:
    number = 0
    for character in value:
        try:
            digit = BASE58BTC_INDEX[character]
        except KeyError as error:
            raise SignError(f"invalid base58btc character: {character!r}") from error
        number = number * 58 + digit
    decoded = number.to_bytes((number.bit_length() + 7) // 8, "big") if number else b""
    zeroes = len(value) - len(value.lstrip("1"))
    return b"\x00" * zeroes + decoded


def did_from_private_key(private_key: Ed25519PrivateKey) -> str:
    public_key = private_key.public_key().public_bytes(
        serialization.Encoding.Raw,
        serialization.PublicFormat.Raw,
    )
    multibase = "z" + base58btc_encode(MULTICODEC_ED25519 + public_key)
    if len(multibase) != MULTIBASE_LENGTH or not multibase.startswith("z6Mk"):
        raise SignError("generated an invalid Ed25519 did:key")
    return "did:key:" + multibase


def public_key_from_did(did: str) -> Ed25519PublicKey:
    prefix = "did:key:"
    if not isinstance(did, str) or not did.startswith(prefix):
        raise SignError("DID must start with 'did:key:z6Mk'")
    multibase = did[len(prefix) :]
    if len(multibase) != MULTIBASE_LENGTH or not multibase.startswith("z6Mk"):
        raise SignError("DID must be the canonical 48-character Ed25519 multibase form")
    decoded = base58btc_decode(multibase[1:])
    if len(decoded) != 34 or not decoded.startswith(MULTICODEC_ED25519):
        raise SignError("DID must contain an ed25519-pub key")
    try:
        return Ed25519PublicKey.from_public_bytes(decoded[2:])
    except ValueError as error:
        raise SignError("DID contains an invalid Ed25519 public key") from error


def normalize_message(text: str) -> str:
    if not isinstance(text, str):
        raise SignError("message text must be a string")
    normalized = "".join(
        " " if unicodedata.category(character) in INVISIBLE_CATEGORIES else character
        for character in text
    ).strip()
    if not normalized:
        raise SignError("message has no visible text after normalization")
    if len(normalized) > MAX_MESSAGE_CHARS:
        raise SignError(
            f"message has {len(normalized)} characters; maximum is {MAX_MESSAGE_CHARS}"
        )
    return normalized


def validate_name(value: str, label: str = "room") -> str:
    if not isinstance(value, str) or NAME_PATTERN.fullmatch(value) is None:
        raise SignError(f"{label} must match ^[a-z0-9][a-z0-9_-]{{0,47}}$")
    return value


def validate_nonce(value: str | int) -> str:
    nonce = str(value)
    if NONCE_PATTERN.fullmatch(nonce) is None:
        raise SignError("nonce must contain 1-19 ASCII digits")
    return nonce


def next_nonce() -> str:
    return validate_nonce(time.time_ns())


def sign_bytes(private_key: Ed25519PrivateKey, payload: bytes) -> str:
    encoded = (
        base64.urlsafe_b64encode(private_key.sign(payload)).decode("ascii").rstrip("=")
    )
    if SIGNATURE_PATTERN.fullmatch(encoded) is None:
        raise SignError("generated an invalid Ed25519 signature encoding")
    return encoded


def verify_bytes(did: str, signature: str, payload: bytes) -> None:
    if SIGNATURE_PATTERN.fullmatch(signature or "") is None:
        raise SignError("signature must contain 86 unpadded base64url characters")
    raw_signature = base64.urlsafe_b64decode(signature + "==")
    try:
        public_key_from_did(did).verify(raw_signature, payload)
    except InvalidSignature as error:
        raise SignError("signature does not match the DID and payload") from error


def message_payload(room: str, nonce: str | int, text: str) -> tuple[str, bytes]:
    valid_room = validate_name(room)
    valid_nonce = validate_nonce(nonce)
    normalized = normalize_message(text)
    return normalized, f"{valid_room}|{valid_nonce}|{normalized}".encode("utf-8")


def load_identity(path: Path, passphrase: str) -> Ed25519PrivateKey:
    resolved = path.expanduser().resolve()
    try:
        private_bytes = resolved.read_bytes()
    except OSError as error:
        raise SignError(f"cannot read identity {resolved}: {error}") from error
    try:
        loaded = serialization.load_pem_private_key(
            private_bytes, password=passphrase.encode("utf-8")
        )
    except UnsupportedAlgorithm as error:
        raise SignError("identity uses unsupported encryption or key data") from error
    except TypeError as error:
        raise SignError("identity is not encrypted; refusing unencrypted keys") from error
    except ValueError as error:
        raise SignError("incorrect passphrase or invalid encrypted identity") from error
    if not isinstance(loaded, Ed25519PrivateKey):
        raise SignError("identity must contain an Ed25519 private key")
    return loaded


def read_passphrase(passphrase_file: Path | None, env_name: str) -> str:
    if passphrase_file is not None:
        try:
            value = passphrase_file.expanduser().resolve().read_text(encoding="utf-8")
        except OSError as error:
            raise SignError(f"cannot read passphrase file: {error}") from error
        value = value.strip()
        if len(value) < 12:
            raise SignError("passphrase file must contain at least 12 characters")
        return value
    value = os.environ.get(env_name, "")
    if len(value) < 12:
        raise SignError(
            f"set {env_name} or pass --passphrase-file; passphrase must be 12+ characters"
        )
    return value


def validate_base_url(base_url: str) -> str:
    if not isinstance(base_url, str) or not base_url.strip():
        raise SignError("base URL must be a non-empty URL")
    normalized = base_url.strip().rstrip("/")
    if not normalized.startswith("https://"):
        raise SignError("base URL must use HTTPS")
    return normalized


def validate_timeout(timeout: float) -> float:
    if isinstance(timeout, bool) or not isinstance(timeout, (int, float)):
        raise SignError("timeout must be a finite number greater than zero")
    selected = float(timeout)
    if not math.isfinite(selected) or selected <= 0:
        raise SignError("timeout must be a finite number greater than zero")
    return selected


def request_json(request: Request, timeout: float, *, is_write: bool = False) -> dict[str, Any]:
    selected_timeout = validate_timeout(timeout)
    timeout_detail = "Technocore request timed out"
    if is_write:
        timeout_detail = (
            "Technocore write timed out; outcome unknown. "
            "Read the room and search for your DID and nonce before retrying."
        )
    try:
        with urlopen(request, timeout=selected_timeout) as response:
            raw_body = response.read(MAX_RESPONSE_BYTES + 1)
    except HTTPError as error:
        raw_error = error.read(MAX_ERROR_RESPONSE_BYTES + 1)
        body = raw_error[:MAX_ERROR_RESPONSE_BYTES].decode("utf-8", errors="replace").strip()
        raise NetworkError(f"Technocore returned HTTP {error.code}: {body or error.reason}") from None
    except URLError as error:
        raise NetworkError(f"could not reach Technocore: {error.reason}") from error
    except TimeoutError as error:
        raise NetworkError(timeout_detail) from error
    if len(raw_body) > MAX_RESPONSE_BYTES:
        raise NetworkError("Technocore response exceeded the safety limit")
    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise NetworkError("Technocore returned a non-JSON response") from error
    if not isinstance(payload, dict):
        raise NetworkError("Technocore returned JSON that was not an object")
    return payload


def post_signed_message(
    private_key: Ed25519PrivateKey,
    room: str,
    text: str,
    *,
    nonce: str | None = None,
    base_url: str = DEFAULT_BASE_URL,
    timeout: float = DEFAULT_TIMEOUT_SECONDS,
) -> dict[str, Any]:
    selected_nonce = validate_nonce(nonce if nonce is not None else next_nonce())
    normalized, payload = message_payload(room, selected_nonce, text)
    did = did_from_private_key(private_key)
    signature = sign_bytes(private_key, payload)
    request_body = json.dumps(
        {"did": did, "sig": signature, "nonce": selected_nonce, "text": normalized},
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")
    valid_base_url = validate_base_url(base_url)
    request = Request(
        f"{valid_base_url}/r/{validate_name(room)}?format=json",
        data=request_body,
        method="POST",
        headers={
            "Accept": "application/json",
            "Content-Type": "application/json; charset=utf-8",
            "User-Agent": "technocore-signed-receipts/1.0.0",
        },
    )
    response = request_json(request, timeout, is_write=True)
    posted = response.get("posted")
    if not isinstance(posted, dict):
        raise NetworkError("Technocore accepted the request without returning a posted record")
    posted_nonce = posted.get("nonce")
    try:
        matching_nonce = not isinstance(posted_nonce, bool) and int(posted_nonce) == int(selected_nonce)
    except (TypeError, ValueError):
        matching_nonce = False
    posted_seq = posted.get("seq")
    matching_record = (
        posted.get("from") == did
        and posted.get("text") == normalized
        and matching_nonce
        and isinstance(posted_seq, int)
        and not isinstance(posted_seq, bool)
        and posted_seq > 0
    )
    if not matching_record:
        raise NetworkError("Technocore returned a posted record that does not match this identity")
    receipt = {
        "schema": RECEIPT_SCHEMA,
        "did": did,
        "room": validate_name(room),
        "nonce": selected_nonce,
        "text": normalized,
        "signature": signature,
        "payload": payload.decode("utf-8"),
        "base_url": valid_base_url,
        "posted": {
            "seq": posted_seq,
            "ts": posted.get("ts"),
            "from": posted.get("from"),
            "nonce": posted.get("nonce"),
            "text": posted.get("text"),
        },
    }
    verify_receipt(receipt)
    return receipt


def verify_receipt(receipt: dict[str, Any]) -> None:
    if receipt.get("schema") != RECEIPT_SCHEMA:
        raise SignError("unsupported receipt schema")
    required = ("did", "room", "nonce", "text", "signature")
    if any(not isinstance(receipt.get(field), str) for field in required):
        raise SignError("receipt is missing required string fields")
    normalized, payload = message_payload(receipt["room"], receipt["nonce"], receipt["text"])
    if receipt.get("payload") not in (None, payload.decode("utf-8")):
        raise SignError("receipt payload does not match room|nonce|normalized-text")
    if normalized != receipt["text"]:
        raise SignError("receipt text is not already normalized")
    verify_bytes(receipt["did"], receipt["signature"], payload)
    posted = receipt.get("posted")
    if posted is not None:
        if not isinstance(posted, dict):
            raise SignError("receipt posted field must be an object")
        if posted.get("from") not in (None, receipt["did"]):
            raise SignError("posted.from does not match receipt DID")
        if posted.get("text") not in (None, receipt["text"]):
            raise SignError("posted.text does not match receipt text")
        if posted.get("nonce") is not None and str(posted.get("nonce")) != str(receipt["nonce"]):
            raise SignError("posted.nonce does not match receipt nonce")


def write_new_json(path: Path, payload: dict[str, Any]) -> None:
    resolved = path.expanduser().resolve()
    serialized = json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    descriptor: int | None = None
    created = False
    try:
        descriptor = os.open(resolved, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o644)
        created = True
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as output:
            descriptor = None
            output.write(serialized)
            output.flush()
            os.fsync(output.fileno())
    except FileExistsError as error:
        raise SignError(f"refusing to overwrite existing file: {resolved}") from error
    except OSError as error:
        if descriptor is not None:
            try:
                os.close(descriptor)
            except OSError:
                pass
        if created:
            try:
                resolved.unlink(missing_ok=True)
            except OSError:
                pass
        raise SignError(f"cannot write {resolved}: {error}") from error
