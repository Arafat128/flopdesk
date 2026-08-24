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
      });
      const data = (await response.json()) as { error?: string; hint?: string };
      if (!response.ok) {
        throw new Error(data.error || "Request failed");
      }
      setStatus(data.hint || "Queued. Watch the signed results lane.");
      setContract("");
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
          {busy ? "Sending" : "Request signed check"}
        </button>
      </div>
      {status ? <p className={`msg${error ? " err" : ""}`}>{status}</p> : null}
    </form>
  );
}
