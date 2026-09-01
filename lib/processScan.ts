import { extractContract } from "./ca";
import { AGENT, DID, ROOMS } from "./config";
import { lookupMailbox } from "./mailbox";
import { postSigned, type SignedReceipt } from "./onlineSign";
import { scanToken } from "./scanLite";
import { readNote, readRoom, setNote } from "./technocore";

export async function alreadyPosted(address: string): Promise<boolean | "unknown"> {
  const needle = address.toLowerCase();
  const rooms = [ROOMS.results, ROOMS.bulletin];
  let sawUnknown = false;
  for (const room of rooms) {
    try {
      const data = await readRoom(room, 50);
      const found = data.messages.some(
        (message) =>
          message.from === DID &&
          String(message.text || "").toLowerCase().includes(needle) &&
          String(message.text || "").includes("verdict="),
      );
      if (found) return true;
    } catch {
      sawUnknown = true;
    }
  }
  return sawUnknown ? "unknown" : false;
}

async function maybeReplyMailbox(fromDid: string | undefined, summary: string): Promise<void> {
  if (!fromDid || !fromDid.startsWith("did:key:z6Mk") || fromDid === DID) return;
  const box = await lookupMailbox(fromDid);
  if (!box) return;
  const fp = fromDid.slice(-12);
  const gateKey = `rl-${fp.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 16) || "x"}`;
  const last = await readNote(AGENT.ns, gateKey).catch(() => null);
  const lastMs = last ? Date.parse(last.match(/\d{4}-\d{2}-\d{2}T[^\s]+/)?.[0] || last) : 0;
  if (lastMs && Date.now() - lastMs < 60 * 60 * 1000) return;
  await postSigned(box, summary.slice(0, 4000));
  await setNote(AGENT.ns, gateKey, new Date().toISOString()).catch(() => undefined);
}

export async function processScan(
  address: string,
  fromDid?: string,
): Promise<{
  seq?: number;
  summary: string;
  skipped?: boolean;
  receipt?: SignedReceipt;
  room?: string;
}> {
  const posted = await alreadyPosted(address);
  if (posted === true) {
    return { summary: `already posted ${address}`, skipped: true };
  }
  if (posted === "unknown") {
    return { summary: `skipped ${address}: could not read results board`, skipped: true };
  }
  const result = await scanToken(address);
  const room = ROOMS.results;
  const receipt = await postSigned(room, result.summary);
  await maybeReplyMailbox(fromDid, result.summary).catch(() => undefined);
  return { seq: receipt.posted.seq, summary: receipt.text, receipt, room };
}

export async function processQueuedJobs(limit = 3): Promise<{ processed: string[] }> {
  const processed: string[] = [];
  for (const room of [ROOMS.mailbox, ROOMS.requests]) {
    let payload;
    try {
      payload = await readRoom(room, 40);
    } catch {
      continue;
    }
    for (const message of [...payload.messages].reverse()) {
      if (processed.length >= limit) break;
      const found = extractContract(String(message.text || ""));
      if (!found) continue;
      const key = found.address.toLowerCase();
      if (processed.includes(key)) continue;
      const from = typeof message.from === "string" ? message.from : undefined;
      const out = await processScan(found.address, from);
      processed.push(out.seq ? `${key}:${out.seq}` : key);
    }
  }
  return { processed };
}
