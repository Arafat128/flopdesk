"use client";

import { useState } from "react";
import { verifyReceiptJson } from "@/lib/verifyReceipt";

export function VerifyBox() {
  const [raw, setRaw] = useState("");
  const [status, setStatus] = useState("");
  const [ok, setOk] = useState<boolean | null>(null);

  async function onVerify() {
    setOk(null);
    setStatus("Checking…");
    try {
      const result = await verifyReceiptJson(raw);
      setOk(true);
      setStatus(`Valid for ${result.did}`);
    } catch (error) {
      setOk(false);
      setStatus(error instanceof Error ? error.message : "Invalid receipt");
    }
  }

  return (
    <div>
      <label htmlFor="receipt">Receipt JSON</label>
      <textarea
        id="receipt"
        rows={7}
        value={raw}
        onChange={(event) => setRaw(event.target.value)}
        placeholder='{"schema":"technocore-signed-receipt-v1", ...}'
        spellCheck={false}
      />
      <div className="row">
        <button type="button" onClick={onVerify} disabled={!raw.trim()}>
          Verify offline
        </button>
      </div>
      {status ? (
        <p className={`msg${ok === false ? " err" : ""}`}>{status}</p>
      ) : null}
    </div>
  );
}
