import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { runAgentTick } from "@/lib/agentLoop";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

function bearerOk(header: string, secret: string): boolean {
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return false;
  const token = header.slice(prefix.length);
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET || "";
  if (secret.length < 16) return false;
  return bearerOk(request.headers.get("authorization") || "", secret);
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await runAgentTick();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: "tick failed" }, { status: 502 });
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
