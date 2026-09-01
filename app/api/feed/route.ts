import { NextResponse } from "next/server";
import { readRoom, type RoomPayload } from "@/lib/technocore";
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
  const [requests, results, mailbox, bulletin] = await Promise.all([
    loadRoom(ROOMS.requests),
    loadRoom(ROOMS.results),
    loadRoom(ROOMS.mailbox),
    loadRoom(ROOMS.bulletin),
  ]);
  return NextResponse.json({
    requests,
    results,
    mailbox,
    bulletin,
    fetchedAt: new Date().toISOString(),
  });
}
