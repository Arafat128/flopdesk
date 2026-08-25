import { AGENT, DID, DID_NOTE, ROOMS, SITE, TECHNOCORE } from "./config";
import { processQueuedJobs } from "./processScan";
import { postSigned } from "./onlineSign";
import { readNote, readRoom, setNote } from "./technocore";

export type AgentTick = {
  ok: true;
  at: string;
  jobs: string[];
  heartbeat: boolean;
  profile: boolean;
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
    `FLOP Desk agent heartbeat. DID ${DID}. Mailbox /r/${ROOMS.mailbox}. Online https://flopdesk-pearl.vercel.app Source ${SITE.github}. Official testnet faucet not live; watcher armed. Not a faucet claim.`,
  );
  const receipt = await postSigned(ROOMS.results, text);
  await setNote(AGENT.ns, AGENT.lastPulse, receipt.posted.ts || new Date().toISOString());
  return receipt.posted.seq;
}

export async function runAgentTick(): Promise<AgentTick> {
  const at = new Date().toISOString();
  const jobs = (await processQueuedJobs(3)).processed;

  const profileText = oneLine(
    `mailbox: ${ROOMS.mailbox} desk: https://flopdesk-pearl.vercel.app github: ${SITE.github} did: ${DID}`,
  );
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
    `at:${at} jobs:${jobs.length} hb:${heartbeat ? "1" : "0"} faucetOfficial:${faucet.official ? "1" : "0"} pulse:${pulseSeq ?? "none"} desk:https://flopdesk-pearl.vercel.app`,
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
    faucetOfficial: faucet.official,
    faucetHint: faucet.hint,
    pulseSeq,
  };
}
