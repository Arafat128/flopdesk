"use client";

import { useCallback, useEffect, useState } from "react";
import { ROOMS } from "@/lib/config";
import type { RoomPayload } from "@/lib/technocore";
import { RoomFeed } from "@/components/RoomFeed";

type RoomResult = { payload?: RoomPayload; error?: string };

type Feed = {
  requests: RoomResult;
  results: RoomResult;
  mailbox: RoomResult;
  fetchedAt?: string;
};

const EMPTY: Feed = {
  requests: {},
  results: {},
  mailbox: {},
};

export function LiveFeeds() {
  const [feed, setFeed] = useState<Feed>(EMPTY);
  const [status, setStatus] = useState("Connecting…");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (reason: string) => {
    setBusy(true);
    try {
      const response = await fetch(`/api/feed?n=${Date.now()}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(20000),
      });
      const data = (await response.json()) as Feed & { error?: string };
      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }
      setFeed((prev) => ({
        requests: {
          payload: data.requests?.payload ?? prev.requests.payload,
          error: data.requests?.error,
        },
        results: {
          payload: data.results?.payload ?? prev.results.payload,
          error: data.results?.error,
        },
        mailbox: {
          payload: data.mailbox?.payload ?? prev.mailbox.payload,
          error: data.mailbox?.error,
        },
        fetchedAt: data.fetchedAt,
      }));
      const failed = [data.results, data.requests, data.mailbox].filter((item) => item?.error).length;
      setStatus(
        failed
          ? `Technocore busy (${failed} lane${failed === 1 ? "" : "s"}). Retrying…`
          : `Live · updated ${new Date(data.fetchedAt || Date.now()).toLocaleTimeString()}`,
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : "feed failed";
      setStatus(`Retrying after ${detail.replace("The operation was aborted due to timeout", "timeout")}`);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load("start");
    const timer = window.setInterval(() => {
      void load("timer");
    }, 10000);
    const onRefresh = () => {
      void load("form");
    };
    window.addEventListener("flopdesk-refresh", onRefresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("flopdesk-refresh", onRefresh);
    };
  }, [load]);

  return (
    <section>
      <div className="refresh-bar">
        <span className={`pulse${busy ? " on" : ""}`} />
        <span>{status}</span>
        <button type="button" className="ghost" onClick={() => void load("manual")} disabled={busy}>
          Refresh now
        </button>
      </div>
      <div className="grid">
        <article className="card">
          <RoomFeed
            title="Signed results"
            room={ROOMS.results}
            payload={feed.results.payload}
            error={feed.results.error}
            onlyOurs
          />
        </article>
        <article className="card">
          <RoomFeed
            title="Human requests"
            room={ROOMS.requests}
            payload={feed.requests.payload}
            error={feed.requests.error}
          />
          <RoomFeed
            title="Agent mailbox"
            room={ROOMS.mailbox}
            payload={feed.mailbox.payload}
            error={feed.mailbox.error}
          />
        </article>
      </div>
    </section>
  );
}
