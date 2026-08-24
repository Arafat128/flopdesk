import { after } from "next/server";
import { NextResponse } from "next/server";
import { readRoom, type RoomPayload } from "@/lib/technocore";
import { processQueuedJobs } from "@/lib/processScan";
import { ROOMS } from "@/lib/config";

export const dynamic = "force-dynamic";

type RoomResult = {
  payload?: RoomPayload;
  error?: string;
};

async function loadRoom(room: string): Promise<RoomResult> {
  try {
    return { payload: await readRoom(room, 25) };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "read failed";
    return { error: detail.replace("The operation was aborted due to timeout", "Technocore timed out") };
  }
}

export async function GET() {
  const [requests, results, mailbox] = await Promise.all([
    loadRoom(ROOMS.requests),
    loadRoom(ROOMS.results),
    loadRoom(ROOMS.mailbox),
  ]);
  after(async () => {
    try {
      await processQueuedJobs(1);
    } catch {
      /* leftover SCAN jobs retry on the next refresh */
    }
  });
  return NextResponse.json({
    requests,
    results,
    mailbox,
    fetchedAt: new Date().toISOString(),
  });
}
