"use client";

import { useState } from "react";

export function RequestForm() {
  const [contract, setContract] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(false);
    setStatus("Sending request…");
    try {
      const response = await fetch("/api/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contract }),
        signal: AbortSignal.timeout(55000),
      });
      const data = (await response.json()) as {
        error?: string;
        hint?: string;
        summary?: string;
        seq?: number;
        skipped?: boolean;
      };
      if (!response.ok) {
        throw new Error(data.error || "Request failed");
      }
      if (data.seq) {
        setStatus(`Signed result seq ${data.seq}. ${data.summary || ""}`);
      } else if (data.skipped) {
        setStatus(data.summary || "Already posted. Check Signed results.");
      } else {
        setStatus(data.hint || "Queued. Signed results auto-refresh below.");
      }
      setContract("");
      window.dispatchEvent(new Event("flopdesk-refresh"));
    } catch (err) {
      setError(true);
      setStatus(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <label htmlFor="ca">Token contract</label>
      <input
        id="ca"
        value={contract}
        onChange={(event) => setContract(event.target.value)}
        placeholder="0x… or Solana mint"
        autoComplete="off"
        spellCheck={false}
      />
      <div className="row">
        <button type="submit" disabled={busy || contract.trim().length < 8}>
          {busy ? "Scanning and signing…" : "Request signed check"}
        </button>
      </div>
      {status ? <p className={`msg${error ? " err" : ""}`}>{status}</p> : null}
    </form>
  );
}
