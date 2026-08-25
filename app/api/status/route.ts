import { NextResponse } from "next/server";
import { AGENT, DID, DID_NOTE, TECHNOCORE } from "@/lib/config";
import { readNote } from "@/lib/technocore";

export const dynamic = "force-dynamic";

export async function GET() {
  const [status, heartbeat, profile] = await Promise.all([
    readNote(AGENT.ns, AGENT.status).catch(() => null),
    readNote(AGENT.ns, AGENT.heartbeat).catch(() => null),
    readNote(DID_NOTE.ns, DID_NOTE.key).catch(() => null),
  ]);
  return NextResponse.json({
    did: DID,
    heartbeat,
    status,
    profile,
    notes: {
      heartbeat: `${TECHNOCORE}/kv/${AGENT.ns}/${AGENT.heartbeat}`,
      status: `${TECHNOCORE}/kv/${AGENT.ns}/${AGENT.status}`,
      did: `${TECHNOCORE}/kv/${DID_NOTE.ns}/${DID_NOTE.key}`,
    },
  });
}
