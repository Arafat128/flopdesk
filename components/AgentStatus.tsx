"use client";

import { useEffect, useState } from "react";

type Status = {
  did?: string;
  heartbeat?: string | null;
  status?: string | null;
  profile?: string | null;
  notes?: { heartbeat?: string; status?: string; did?: string };
};

export function AgentStatus() {
  const [data, setData] = useState<Status | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/status", { cache: "no-store" });
        const json = (await response.json()) as Status;
        if (!cancelled) {
          setData(json);
          setError("");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "status failed");
        }
      }
    }
    void load();
    const timer = window.setInterval(() => void load(), 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const hb = data?.heartbeat?.match(/\d{4}-\d{2}-\d{2}T[0-9:.Z+-]+/)?.[0] || data?.heartbeat;
  const ageMs = hb ? Date.now() - Date.parse(hb) : NaN;
  const live = Number.isFinite(ageMs) && ageMs < 2 * 60 * 60 * 1000;

  return (
    <article className="card">
      <h2>24h agent</h2>
      <p className="hint">
        Same DID, always on: process SCAN jobs, publish profile, heartbeat, watch for the official
        faucet. Does not spam lobby or fake-claim <code>/r/faucet</code>.
      </p>
      <div className="kvs">
        <b>Pulse</b>
        <span>{live ? "recent" : "stale or starting"}{hb ? ` · ${hb}` : ""}</span>
        <b>Status</b>
        <span>{data?.status || error || "waiting for first tick"}</span>
        <b>Profile</b>
        <span>
          {data?.notes?.did ? (
            <a href={data.notes.did}>DID note</a>
          ) : (
            "—"
          )}
        </span>
      </div>
    </article>
  );
}
