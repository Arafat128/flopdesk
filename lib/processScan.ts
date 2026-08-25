import { extractContract } from "./ca";
import { ROOMS } from "./config";
import { postSigned, type SignedReceipt } from "./onlineSign";
import { scanToken } from "./scanLite";
import { readRoom } from "./technocore";

export async function alreadyPosted(address: string): Promise<boolean | "unknown"> {
  try {
    const room = await readRoom(ROOMS.results, 50);
    const needle = address.toLowerCase();
    const found = room.messages.some(
      (message) =>
        String(message.text || "").toLowerCase().includes(needle) &&
        String(message.text || "").includes("verdict="),
    );
    return found;
  } catch {
    return "unknown";
  }
}

export async function processScan(address: string): Promise<{
  seq?: number;
  summary: string;
  skipped?: boolean;
  receipt?: SignedReceipt;
}> {
  const posted = await alreadyPosted(address);
  if (posted === true) {
    return { summary: `already posted ${address}`, skipped: true };
  }
  if (posted === "unknown") {
    return { summary: `skipped ${address}: could not read results board`, skipped: true };
  }
  const result = await scanToken(address);
  const receipt = await postSigned(ROOMS.results, result.summary);
  return { seq: receipt.posted.seq, summary: receipt.text, receipt };
}

export async function processQueuedJobs(limit = 3): Promise<{ processed: string[] }> {
  const processed: string[] = [];
  for (const room of [ROOMS.requests, ROOMS.mailbox]) {
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
      if (processed.includes(found.address.toLowerCase())) continue;
      const out = await processScan(found.address);
      processed.push(found.address.toLowerCase());
      if (out.seq) {
        processed[processed.length - 1] = `${found.address}:${out.seq}`;
      }
    }
  }
  return { processed };
}
