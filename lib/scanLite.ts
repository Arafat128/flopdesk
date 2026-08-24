const CHAIN_IDS: Record<string, string> = {
  ethereum: "1",
  eth: "1",
  bsc: "56",
  base: "8453",
  arbitrum: "42161",
  polygon: "137",
  optimism: "10",
};

export type ScanResult = {
  address: string;
  symbol?: string;
  verdict: string;
  summary: string;
  url?: string;
};

async function getJson(url: string): Promise<any> {
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "flopdesk/1.0" },
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

function flag(info: Record<string, unknown>, key: string): string {
  const value = String(info[key] ?? "").trim().toLowerCase();
  if (["1", "true", "yes"].includes(value)) return "yes";
  if (["0", "false", "no"].includes(value)) return "no";
  return value || "n/a";
}

async function bestPair(address: string): Promise<any | null> {
  const wanted = address.toLowerCase();
  let payload = await getJson(`https://api.dexscreener.com/latest/dex/tokens/${address}`);
  let pairs = Array.isArray(payload?.pairs) ? payload.pairs : [];
  if (!pairs.length) {
    payload = await getJson(`https://api.dexscreener.com/latest/dex/search?q=${address}`);
    pairs = Array.isArray(payload?.pairs) ? payload.pairs : [];
  }
  const ranked: Array<[number, number, any]> = [];
  for (const pair of pairs) {
    const base = String(pair?.baseToken?.address || "").toLowerCase();
    const quote = String(pair?.quoteToken?.address || "").toLowerCase();
    const role = base === wanted ? 2 : quote === wanted ? 1 : 0;
    if (!role) continue;
    ranked.push([role, Number(pair?.liquidity?.usd || 0), pair]);
  }
  ranked.sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  return ranked[0]?.[2] || null;
}

export async function scanToken(address: string): Promise<ScanResult> {
  let pair = await bestPair(address);
  if (!pair) {
    await new Promise((resolve) => setTimeout(resolve, 800));
    pair = await bestPair(address);
  }
  if (!pair) {
    return {
      address,
      verdict: "unknown",
      summary: `SCAN ${address} | no DEX pair found | verdict=unknown`,
    };
  }
  const wanted = address.toLowerCase();
  const isBase = String(pair.baseToken?.address || "").toLowerCase() === wanted;
  const token = isBase ? pair.baseToken : pair.quoteToken;
  let price = pair.priceUsd || "n/a";
  if (!isBase) {
    try {
      price = (Number(pair.priceUsd) / Number(pair.priceNative)).toPrecision(6);
    } catch {
      price = "n/a";
    }
  }
  const chain = String(pair.chainId || "");
  const liq = Number(pair.liquidity?.usd || 0);
  const chainId = CHAIN_IDS[chain.toLowerCase()];
  let security: Record<string, unknown> = {};
  if (chainId) {
    const gp = await getJson(
      `https://api.gopluslabs.io/api/v1/token_security/${chainId}?contract_addresses=${address}`,
    );
    const info = gp?.result?.[wanted];
    if (info && typeof info === "object") security = info as Record<string, unknown>;
  }
  const honeypot = flag(security, "is_honeypot");
  const cannotSell = flag(security, "cannot_sell_all");
  const buyTax = security.buy_tax ?? "n/a";
  const sellTax = security.sell_tax ?? "n/a";
  const buy = Number(buyTax);
  const sell = Number(sellTax);
  let verdict = "ok";
  if (honeypot === "yes" || cannotSell === "yes") verdict = "danger";
  else if (buy >= 10 || sell >= 10 || liq < 5000) verdict = "caution";
  return {
    address,
    symbol: token?.symbol,
    verdict,
    url: pair.url,
    summary: `SCAN ${address} | ${token?.symbol || "?"} ${chain} | $${price} liq $${liq.toLocaleString("en-US", { maximumFractionDigits: 0 })} | honeypot=${honeypot} tax=${buyTax}/${sellTax} | verdict=${verdict} | ${pair.url || ""}`.slice(0, 4096),
  };
}
