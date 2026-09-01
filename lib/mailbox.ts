import { createHash } from "crypto";
import { DID, NAME_RE, SITE } from "./config";
import { readNote } from "./technocore";

export function didFingerprint(did: string): { fp: string; shard: string; rest: string } {
  const fp = createHash("sha256").update(did, "utf8").digest("hex").slice(0, 16);
  return { fp, shard: fp.slice(0, 2), rest: fp.slice(2) };
}

function parseMailbox(note: string | null): string | null {
  if (!note) return null;
  const match = note.match(/\bmailbox:\s*([a-z0-9][a-z0-9_-]{0,47})/i);
  if (!match) return null;
  const room = match[1].toLowerCase();
  if (!NAME_RE.test(room)) return null;
  if (!room.startsWith("mb-")) return null;
  return room;
}

export async function lookupMailbox(did: string): Promise<string | null> {
  if (!did.startsWith("did:key:z6Mk") || did === DID) return null;
  const { shard, rest, fp } = didFingerprint(did);
  const sharded = await readNote(`did-${shard}`, rest).catch(() => null);
  const fromSharded = parseMailbox(sharded);
  if (fromSharded) return fromSharded;
  const legacy = await readNote("did", fp).catch(() => null);
  return parseMailbox(legacy);
}

export function skillLine(): string {
  return `mailbox: mb-flopdesk skill: ${SITE.github}/blob/main/SKILL.md desk: https://flopdesk-pearl.vercel.app`;
}
