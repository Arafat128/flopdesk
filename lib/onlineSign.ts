import { createPrivateKey, createPublicKey, sign } from "crypto";
import { DID, ROOMS, TECHNOCORE } from "./config";

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const MULTICODEC = Buffer.from([0xed, 0x01]);

function base58btcEncode(data: Buffer): string {
  let zeroes = 0;
  for (const byte of data) {
    if (byte === 0) zeroes += 1;
    else break;
  }
  let number = BigInt("0x" + data.toString("hex"));
  let encoded = "";
  while (number > 0n) {
    const rem = Number(number % 58n);
    number /= 58n;
    encoded = B58[rem] + encoded;
  }
  return "1".repeat(zeroes) + encoded;
}

function normalizeMessage(text: string): string {
  const swept = Array.from(text)
    .map((character) => {
      const code = character.codePointAt(0) || 0;
      if (
        code <= 0x1f ||
        (code >= 0x7f && code <= 0x9f) ||
        code === 0xad ||
        (code >= 0x200b && code <= 0x200f) ||
        (code >= 0x202a && code <= 0x202e)
      ) {
        return " ";
      }
      return character;
    })
    .join("")
    .trim();
  if (!swept) {
    throw new Error("message has no visible text");
  }
  if (swept.length > 4096) {
    throw new Error("message too long");
  }
  return swept;
}

function loadKey() {
  const pem = (process.env.TECHNOCORE_IDENTITY_PEM || "").replace(/\\n/g, "\n");
  const passphrase = process.env.TECHNOCORE_PASSPHRASE || "";
  if (!pem.includes("BEGIN") || passphrase.length < 12) {
    throw new Error("online signer is not configured");
  }
  return createPrivateKey({ key: pem, format: "pem", passphrase });
}

export function didFromEnv(): string {
  const key = loadKey();
  const spki = createPublicKey(key).export({ type: "spki", format: "der" }) as Buffer;
  const raw = spki.subarray(-32);
  const multibase = "z" + base58btcEncode(Buffer.concat([MULTICODEC, raw]));
  const did = "did:key:" + multibase;
  if (did !== DID) {
    throw new Error("online key does not match the public desk DID");
  }
  return did;
}

export async function postSigned(room: string, text: string): Promise<{ seq: number; did: string; text: string }> {
  const key = loadKey();
  const did = didFromEnv();
  const nonce = Date.now().toString();
  const normalized = normalizeMessage(text);
  const payload = Buffer.from(`${room}|${nonce}|${normalized}`, "utf8");
  const signature = sign(null, payload, key).toString("base64url");
  const response = await fetch(`${TECHNOCORE}/r/${encodeURIComponent(room)}?format=json`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json; charset=utf-8",
      "User-Agent": "flopdesk/1.0",
    },
    body: JSON.stringify({ did, sig: signature, nonce, text: normalized }),
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.posted) {
    throw new Error(`signed write failed HTTP ${response.status}`);
  }
  if (body.posted.from !== did || String(body.posted.text) !== normalized) {
    throw new Error("signed write did not echo this DID");
  }
  return { seq: body.posted.seq, did, text: normalized };
}

