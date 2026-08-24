import { NextRequest, NextResponse } from "next/server";
import { parseContract } from "@/lib/ca";
import { allowRequest } from "@/lib/rateLimit";
import { postUnsigned } from "@/lib/technocore";
import { ROOMS } from "@/lib/config";

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  const gate = allowRequest(ip);
  if (!gate.ok) {
    return NextResponse.json(
      { error: `Too many requests. Retry after ${gate.retryAfter}s.` },
      { status: 429 },
    );
  }

  let body: { contract?: string };
  try {
    body = (await request.json()) as { contract?: string };
  } catch {
    return NextResponse.json({ error: "Send JSON { contract }." }, { status: 400 });
  }

  const parsed = parseContract(body.contract || "");
  if (!parsed) {
    return NextResponse.json(
      { error: "Paste a 0x EVM contract or a Solana token address." },
      { status: 400 },
    );
  }

  const text = `SCAN ${parsed.address} kind=${parsed.kind} via flopdesk.web`;
  try {
    await postUnsigned(ROOMS.requests, "flopdesk-web", text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Technocore write failed";
    return NextResponse.json({ error: detail }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    contract: parsed.address,
    room: ROOMS.requests,
    hint: `Local desk agent will sign a result into /r/${ROOMS.results}. Keep the watcher running.`,
  });
}
