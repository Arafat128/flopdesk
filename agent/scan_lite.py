"""Fast public token check: Dexscreener + GoPlus. No private keys."""

from __future__ import annotations

import json
import re
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen

CHAIN_IDS = {
    "ethereum": "1",
    "eth": "1",
    "bsc": "56",
    "base": "8453",
    "arbitrum": "42161",
    "polygon": "137",
    "optimism": "10",
}

EVM_RE = re.compile(r"0x[a-fA-F0-9]{40}")


def _get_json(url: str, timeout: float = 15.0) -> Any:
    request = Request(url, headers={"Accept": "application/json", "User-Agent": "flopdesk/1.0"})
    try:
        with urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except Exception:
        return None


def extract_contract(text: str) -> str | None:
    match = EVM_RE.search(text or "")
    if match:
        return match.group(0)
    return None


def _best_pair(address: str) -> dict[str, Any] | None:
    payload = _get_json(f"https://api.dexscreener.com/latest/dex/tokens/{address}") or {}
    pairs = payload.get("pairs") if isinstance(payload, dict) else None
    if not isinstance(pairs, list) or not pairs:
        search = _get_json(f"https://api.dexscreener.com/latest/dex/search?q={address}") or {}
        pairs = search.get("pairs") if isinstance(search, dict) else None
    if not isinstance(pairs, list) or not pairs:
        return None
    wanted = address.lower()
    ranked: list[tuple[int, float, dict[str, Any]]] = []
    for pair in pairs:
        if not isinstance(pair, dict):
            continue
        base = str((pair.get("baseToken") or {}).get("address") or "").lower()
        quote = str((pair.get("quoteToken") or {}).get("address") or "").lower()
        if base == wanted:
            role = 2
        elif quote == wanted:
            role = 1
        else:
            continue
        liquidity = ((pair.get("liquidity") or {}).get("usd")) or 0
        try:
            liq = float(liquidity)
        except (TypeError, ValueError):
            liq = 0.0
        ranked.append((role, liq, pair))
    if not ranked:
        return None
    ranked.sort(key=lambda item: (item[0], item[1]), reverse=True)
    return ranked[0][2]


def _goplus(chain: str, address: str) -> dict[str, Any]:
    chain_id = CHAIN_IDS.get(chain.lower())
    if not chain_id:
        return {}
    query = urlencode({"contract_addresses": address})
    payload = _get_json(f"https://api.gopluslabs.io/api/v1/token_security/{chain_id}?{query}")
    result = payload.get("result") if isinstance(payload, dict) else None
    if isinstance(result, dict):
        info = result.get(address.lower())
        if isinstance(info, dict):
            return info
    return {}


def _flag(info: dict[str, Any], key: str) -> str:
    value = str(info.get(key) or "").strip().lower()
    if value in {"1", "true", "yes"}:
        return "yes"
    if value in {"0", "false", "no"}:
        return "no"
    return value or "n/a"


def scan_token(address: str) -> dict[str, Any]:
    pair = _best_pair(address)
    if pair is None:
        return {
            "address": address,
            "verdict": "unknown",
            "summary": f"SCAN {address} | no DEX pair found | verdict=unknown",
        }
    base = pair.get("baseToken") or {}
    quote = pair.get("quoteToken") or {}
    if str(base.get("address") or "").lower() == address.lower():
        token = base
        price = pair.get("priceUsd") or "n/a"
    else:
        token = quote
        try:
            price = f"{float(pair.get('priceUsd')) / float(pair.get('priceNative')):.6g}"
        except (TypeError, ValueError, ZeroDivisionError):
            price = "n/a"
    chain = str(pair.get("chainId") or "")
    liquidity = ((pair.get("liquidity") or {}).get("usd")) or 0
    security = _goplus(chain, address)
    honeypot = _flag(security, "is_honeypot")
    cannot_sell = _flag(security, "cannot_sell_all")
    buy_tax = security.get("buy_tax") or "n/a"
    sell_tax = security.get("sell_tax") or "n/a"
    try:
        liq = float(liquidity)
    except (TypeError, ValueError):
        liq = 0.0
    try:
        buy = float(buy_tax)
        sell = float(sell_tax)
    except (TypeError, ValueError):
        buy, sell = 0.0, 0.0
    verdict = "ok"
    if honeypot == "yes" or cannot_sell == "yes":
        verdict = "danger"
    elif buy >= 10 or sell >= 10 or liq < 5000:
        verdict = "caution"
    summary = (
        f"SCAN {address} | {token.get('symbol') or '?'} {chain} | "
        f"${price} liq ${liq:,.0f} | honeypot={honeypot} tax={buy_tax}/{sell_tax} | "
        f"verdict={verdict} | {pair.get('url') or ''}"
    )
    return {
        "address": address,
        "symbol": token.get("symbol"),
        "name": token.get("name"),
        "chain": chain,
        "price": price,
        "liquidity": liq,
        "honeypot": honeypot,
        "buy_tax": buy_tax,
        "sell_tax": sell_tax,
        "verdict": verdict,
        "url": pair.get("url"),
        "summary": summary[:4096],
    }
