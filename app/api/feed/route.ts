import { NextResponse } from "next/server";
import { readRoom } from "@/lib/technocore";
import { ROOMS } from "@/lib/config";

export async function GET() {
  try {
    const [requests, results, mailbox] = await Promise.all([
      readRoom(ROOMS.requests, 25),
      readRoom(ROOMS.results, 25),
      readRoom(ROOMS.mailbox, 25),
    ]);
    return NextResponse.json({ requests, results, mailbox });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "feed failed";
    return NextResponse.json({ error: detail }, { status: 502 });
  }
}
