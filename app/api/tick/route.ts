import { NextRequest, NextResponse } from "next/server";
import { processQueuedJobs } from "@/lib/processScan";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET || "";
  if (secret.length < 16) return false;
  const header = request.headers.get("authorization") || "";
  return header === `Bearer ${secret}`;
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await processQueuedJobs(4);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "tick failed";
    return NextResponse.json({ error: detail }, { status: 502 });
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
