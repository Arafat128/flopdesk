"use client";

import { useEffect, useState } from "react";

type Receipt = {
  schema: string;
  did: string;
  room: string;
  nonce: string;
  text: string;
  signature: string;
  payload: string;
  posted?: { seq: number };
};

const STORE = "flopdesk.receipts";

function loadStored(): Receipt[] {
  try {
    const raw = localStorage.getItem(STORE);
    const parsed = raw ? (JSON.parse(raw) as Receipt[]) : [];
    return Array.isArray(parsed) ? parsed.slice(0, 10) : [];
  } catch {
    return [];
  }
}

function saveStored(receipts: Receipt[]) {
  localStorage.setItem(STORE, JSON.stringify(receipts.slice(0, 10)));
}

function downloadReceipt(receipt: Receipt) {
  const seq = receipt.posted?.seq ?? "new";
  const blob = new Blob([JSON.stringify(receipt, null, 2) + "\n"], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `flopdesk-receipt-seq-${seq}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

async function copyReceipt(receipt: Receipt) {
  await navigator.clipboard.writeText(JSON.stringify(receipt, null, 2));
}

export function RequestForm() {
  const [contract, setContract] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [saved, setSaved] = useState<Receipt[]>([]);

  useEffect(() => {
    setSaved(loadStored());
  }, []);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(false);
    setReceipt(null);
    setStatus("Scanning and signing online…");
    try {
      const response = await fetch("/api/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contract }),
        signal: AbortSignal.timeout(55000),
      });
      const data = (await response.json()) as {
        error?: string;
        summary?: string;
        seq?: number;
        skipped?: boolean;
        receipt?: Receipt | null;
        resultUrl?: string;
      };
      if (!response.ok) {
        throw new Error(data.error || "Request failed");
      }
      if (data.receipt) {
        setReceipt(data.receipt);
        const next = [data.receipt, ...loadStored().filter((item) => item.posted?.seq !== data.receipt?.posted?.seq)];
        saveStored(next);
        setSaved(next);
        setStatus(`Signed seq ${data.seq}. Download the receipt below — Technocore does not keep the signature.`);
      } else if (data.skipped) {
        setStatus("Already on the results board. A new receipt is only issued when this desk signs a fresh line.");
      } else {
        setStatus(data.summary || "Queued. Signed results auto-refresh below.");
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

      {receipt ? (
        <div className="receipt-box">
          <p className="hint">
            Online receipt for seq {receipt.posted?.seq}. This JSON is the only copy of the
            signature. Save it if you want to verify later.
          </p>
          <div className="row">
            <button type="button" onClick={() => downloadReceipt(receipt)}>
              Download receipt
            </button>
            <button type="button" className="ghost" onClick={() => void copyReceipt(receipt)}>
              Copy JSON
            </button>
          </div>
        </div>
      ) : null}

      {saved.length > 0 ? (
        <div className="receipt-box">
          <p className="hint">Receipts saved in this browser</p>
          {saved.slice(0, 5).map((item) => (
            <div className="row" key={`${item.nonce}-${item.posted?.seq || "x"}`}>
              <span className="hint" style={{ margin: 0 }}>
                seq {item.posted?.seq ?? "?"}
              </span>
              <button type="button" className="ghost" onClick={() => downloadReceipt(item)}>
                Download
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </form>
  );
}
