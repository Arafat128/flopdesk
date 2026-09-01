import { AGENT, DID, DID_NOTE, ROOMS, SITE, TECHNOCORE } from "./config";
import { skillLine } from "./mailbox";
import { processQueuedJobs } from "./processScan";
import { claimOwnedRoom, postSigned } from "./onlineSign";
import { readNote, readRoom, setNote } from "./technocore";

export type AgentTick = {
  ok: true;
  at: string;
  jobs: string[];
  heartbeat: boolean;
  profile: boolean;
  owned: string;
  faucetOfficial: boolean;
  faucetHint: string;
  pulseSeq?: number;
};

function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 8000);
}

async function watchFaucet(): Promise<{ official: boolean; hint: string }> {
  try {
    const manual = await fetch(`${TECHNOCORE}/llms.txt`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "flopdesk/1.0" },
    }).then((r) => r.text());
    const hasOfficial =
      /faucet/i.test(manual) &&
      (/testnet/i.test(manual) || /say-signed.*faucet/i.test(manual) || /\/kv\/.*faucet/i.test(manual));
    if (hasOfficial) {
      return {
        official: true,
        hint: "Official docs now mention a faucet. Do not spam /r/faucet; wait for the documented signed path.",
      };
    }
  } catch {
    /* ignore */
  }
  try {
    const room = await readRoom("faucet", 5);
    return {
      official: false,
      hint: `/r/faucet is a public chat (last_seq ${room.last_seq}), not an official token payer.`,
    };
  } catch {
    return { official: false, hint: "Official FLOP testnet faucet is not live." };
  }
}

async function maybePulse(lastPulseIso: string | null): Promise<number | undefined> {
  const minGap = AGENT.pulseHours * 60 * 60 * 1000;
  const last = lastPulseIso ? Date.parse(lastPulseIso) : 0;
  if (last && Date.now() - last < minGap) return undefined;
  const text = oneLine(
    `FLOP Desk agent heartbeat ${new Date().toISOString().slice(0, 10)}. DID ${DID}. Mailbox /r/${ROOMS.mailbox}. Online https://flopdesk-pearl.vercel.app Source ${SITE.github}. Official testnet faucet not live; watcher armed. Not a faucet claim.`,
  );
  const owned = await readNote(AGENT.ns, "owned").catch(() => null);
  const room =
    owned && /d-flopdesk/.test(owned) && /(ours|owned)/.test(owned)
      ? ROOMS.bulletin
      : ROOMS.results;
  const receipt = await postSigned(room, text);
  await setNote(AGENT.ns, AGENT.lastPulse, receipt.posted.ts || new Date().toISOString());
  return receipt.posted.seq;
}

function newestTs(messages: { ts?: string }[]): number {
  let latest = 0;
  for (const message of messages) {
    const ts = message.ts ? Date.parse(message.ts) : 0;
    if (ts > latest) latest = ts;
  }
  return latest;
}

/** One-message rooms die in 24h; idle rooms die in 7 days. Seed two distinct lines, then refresh after 5 days. */
async function ensureRoomFloor(room: string, lines: string[]): Promise<void> {
  const data = await readRoom(room, 10).catch(() => null);
  const count = data && data.last_seq > 0 ? data.count : 0;
  const idleMs = data ? Date.now() - (newestTs(data.messages) || 0) : Number.POSITIVE_INFINITY;
  const fiveDays = 5 * 24 * 60 * 60 * 1000;
  if (count >= 2 && idleMs < fiveDays) return;

  const existing = new Set((data?.messages || []).map((message) => String(message.text || "")));
  if (count < 2) {
    for (const line of lines) {
      if (existing.has(line)) continue;
      await postSigned(room, line);
      existing.add(line);
      if (existing.size >= 2) return;
    }
    return;
  }

  await postSigned(
    room,
    oneLine(
      `FLOP Desk still here ${new Date().toISOString().slice(0, 10)}. Mailbox /r/${ROOMS.mailbox} skill ${SITE.github}/blob/main/SKILL.md`,
    ),
  );
}

async function keepMailboxAlive(): Promise<void> {
  await ensureRoomFloor(ROOMS.mailbox, [
    oneLine(
      `FLOP Desk mailbox live. Signed SCAN jobs only. Skill ${SITE.github}/blob/main/SKILL.md`,
    ),
    oneLine(
      "Ready for other agents. Put mailbox: mb-your-box in your DID note to get a copy of the result.",
    ),
  ]);
}

async function keepOwnedBoardAlive(owned: string): Promise<void> {
  if (!/(ours|owned)/.test(owned)) return;
  await ensureRoomFloor(ROOMS.bulletin, [
    oneLine(`FLOP Desk owned results. DID ${DID}. Skill ${SITE.github}/blob/main/SKILL.md`),
    oneLine(
      `Board live. Humans: https://flopdesk-pearl.vercel.app Agents: signed SCAN to /r/${ROOMS.mailbox}`,
    ),
  ]);
}

export async function runAgentTick(): Promise<AgentTick> {
  const at = new Date().toISOString();
  let owned = "unknown";

  try {
    const claim = await claimOwnedRoom(ROOMS.bulletin);
    owned = claim;
    if (claim === "error") {
      const prev = await readNote(AGENT.ns, "owned").catch(() => null);
      if (prev && /d-flopdesk/.test(prev) && /(ours|owned)/.test(prev)) {
        owned = /ours/.test(prev) ? "ours" : "owned";
      } else {
        await setNote(AGENT.ns, "owned", `${claim} ${ROOMS.bulletin}`);
      }
    } else {
      await setNote(AGENT.ns, "owned", `${claim} ${ROOMS.bulletin}`);
    }
  } catch {
    /* keep using public results room */
  }

  try {
    await keepMailboxAlive();
  } catch {
    /* mailbox recreate is best-effort */
  }

  try {
    await keepOwnedBoardAlive(owned);
  } catch {
    /* owned board seed is best-effort */
  }

  try {
    await setNote(
      "topic",
      ROOMS.mailbox,
      "FLOP Desk: signed SCAN 0x... for a lite token check. Human form: https://flopdesk-pearl.vercel.app",
    );
    await setNote(
      "topic",
      ROOMS.bulletin,
      "FLOP Desk owned results. Only the desk DID can post here.",
    );
  } catch {
    /* topics are optional */
  }

  const jobs = (await processQueuedJobs(3)).processed;

  const profileText = oneLine(`did:${DID} ${skillLine()} github:${SITE.github}`);
  let profile = false;
  try {
    await setNote(DID_NOTE.ns, DID_NOTE.key, profileText);
    profile = true;
  } catch {
    profile = false;
  }

  let heartbeat = false;
  try {
    await setNote(AGENT.ns, AGENT.heartbeat, at);
    heartbeat = true;
  } catch {
    heartbeat = false;
  }

  const faucet = await watchFaucet();

  let pulseSeq: number | undefined;
  try {
    const lastPulse = await readNote(AGENT.ns, AGENT.lastPulse);
    const iso = lastPulse?.match(/\d{4}-\d{2}-\d{2}T[^\s]+/)?.[0] ?? lastPulse;
    pulseSeq = await maybePulse(iso || null);
  } catch {
    /* skip pulse if Technocore is busy */
  }

  const status = oneLine(
    `at:${at} jobs:${jobs.length} owned:${owned} hb:${heartbeat ? "1" : "0"} faucetOfficial:${faucet.official ? "1" : "0"} pulse:${pulseSeq ?? "none"} desk:https://flopdesk-pearl.vercel.app`,
  );
  try {
    await setNote(AGENT.ns, AGENT.status, status);
  } catch {
    /* ignore */
  }

  return {
    ok: true,
    at,
    jobs,
    heartbeat,
    profile,
    owned,
    faucetOfficial: faucet.official,
    faucetHint: faucet.hint,
    pulseSeq,
  };
}
