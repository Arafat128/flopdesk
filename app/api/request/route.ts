import { NextRequest, NextResponse } from "next/server";
import { parseContract } from "@/lib/ca";
import { allowRequest, clientIp } from "@/lib/rateLimit";
import { postUnsigned } from "@/lib/technocore";
import { processScan } from "@/lib/processScan";
import { ROOMS } from "@/lib/config";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const ip = clientIp(request.headers);
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

  const queued = `SCAN ${parsed.address} kind=${parsed.kind} via flopdesk.web`;
  let queueError: string | undefined;
  try {
    await postUnsigned(ROOMS.requests, "flopdesk-web", queued);
  } catch (error) {
    queueError = error instanceof Error ? error.message : "queue failed";
  }

  try {
    const signed = await processScan(parsed.address);
    return NextResponse.json({
      ok: true,
      contract: parsed.address,
      queued: !queueError,
      queueError,
      skipped: signed.skipped || false,
      seq: signed.seq,
      summary: signed.summary,
      receipt: signed.receipt || null,
      resultUrl: signed.seq
        ? `https://technocore.chat/humans#r/${ROOMS.results}/${signed.seq}`
        : `https://technocore.chat/humans#r/${ROOMS.results}`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Online signing failed. Try again in a minute.",
        contract: parsed.address,
      },
      { status: 502 },
    );
  }
}
