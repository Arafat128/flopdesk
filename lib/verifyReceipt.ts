const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const INVISIBLE = new Set(["Cc", "Cf", "Cs", "Co", "Zl", "Zp"]);

function base58Decode(value: string): Uint8Array {
  let number = 0n;
  for (const character of value) {
    const digit = B58.indexOf(character);
    if (digit < 0) {
      throw new Error(`invalid base58 character ${character}`);
    }
    number = number * 58n + BigInt(digit);
  }
  const hex = number.toString(16);
  const padded = hex.length % 2 ? `0${hex}` : hex;
  const decoded = padded ? Uint8Array.from(padded.match(/../g)!.map((byte) => parseInt(byte, 16))) : new Uint8Array();
  const zeroes = value.match(/^1*/)?.[0].length ?? 0;
  const out = new Uint8Array(zeroes + decoded.length);
  out.set(decoded, zeroes);
  return out;
}

function normalize(text: string): string {
  const swept = Array.from(text)
    .map((character) => {
      const code = character.codePointAt(0) || 0;
      const category = categoryOf(code);
      return INVISIBLE.has(category) ? " " : character;
    })
    .join("")
    .trim();
  if (!swept) {
    throw new Error("message has no visible text");
  }
  return swept;
}

function categoryOf(code: number): string {
  if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return "Cc";
  if (code === 0xad || (code >= 0x200b && code <= 0x200f) || (code >= 0x202a && code <= 0x202e) || (code >= 0x2060 && code <= 0x206f) || (code >= 0xe0000 && code <= 0xe007f)) {
    return "Cf";
  }
  if (code === 0x2028) return "Zl";
  if (code === 0x2029) return "Zp";
  return "Lo";
}

function publicKeyFromDid(did: string): Uint8Array {
  if (!did.startsWith("did:key:z6Mk") || did.length !== 8 + 48) {
    throw new Error("DID must be canonical did:key:z6Mk…");
  }
  const decoded = base58Decode(did.slice("did:key:z".length));
  if (decoded.length !== 34 || decoded[0] !== 0xed || decoded[1] !== 0x01) {
    throw new Error("DID is not an Ed25519 public key");
  }
  return decoded.slice(2);
}

function b64urlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "==".slice((value.length * 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function verifyReceiptJson(raw: string): Promise<{ did: string }> {
  const receipt = JSON.parse(raw) as {
    schema?: string;
    did?: string;
    room?: string;
    nonce?: string;
    text?: string;
    signature?: string;
  };
  if (receipt.schema !== "technocore-signed-receipt-v1") {
    throw new Error("unsupported receipt schema");
  }
  if (!receipt.did || !receipt.room || !receipt.nonce || !receipt.text || !receipt.signature) {
    throw new Error("receipt is missing required fields");
  }
  const text = normalize(receipt.text);
  const payload = new Uint8Array(
    new TextEncoder().encode(`${receipt.room}|${receipt.nonce}|${text}`),
  );
  const publicKey = new Uint8Array(publicKeyFromDid(receipt.did));
  const key = await crypto.subtle.importKey("raw", publicKey, "Ed25519", false, ["verify"]);
  const signature = new Uint8Array(b64urlDecode(receipt.signature));
  const ok = await crypto.subtle.verify("Ed25519", key, signature, payload);
  if (!ok) {
    throw new Error("signature does not match DID and payload");
  }
  return { did: receipt.did };
}
