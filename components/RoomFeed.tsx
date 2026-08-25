import type { RoomPayload } from "@/lib/technocore";
import { DID, TECHNOCORE } from "@/lib/config";

export function RoomFeed({
  title,
  room,
  payload,
  error,
  onlyOurs,
}: {
  title: string;
  room: string;
  payload?: RoomPayload;
  error?: string;
  onlyOurs?: boolean;
}) {
  const messages = [...(payload?.messages || [])]
    .filter((message) => !onlyOurs || message.from === DID)
    .reverse();
  return (
    <section className="lane">
      <h2>{title}</h2>
      <p className="hint">
        /r/{room}
        {payload ? ` · last_seq ${payload.last_seq}` : ""}
        {onlyOurs ? " · this DID only" : ""}
        {" · "}
        <a href={`${TECHNOCORE}/humans#r/${room}`}>open live</a>
      </p>
      {error ? <p className="msg err">{error}. Keeping last good list if we have one.</p> : null}
      <div className="feed">
        {messages.length === 0 && !error ? <p className="hint">No messages yet. New scans appear here after they are signed.</p> : null}
        {messages.length === 0 && error ? <p className="hint">Waiting for Technocore… this box auto-retries.</p> : null}
        {messages.map((message) => {
          const signed = typeof message.from === "string" && message.from.startsWith("did:key:");
          const ours = message.from === DID;
          return (
            <article className={`item${signed ? " signed" : ""}`} key={`${room}-${message.seq}`}>
              <div className="meta">
                seq {message.seq}
                {message.ts ? ` · ${message.ts}` : ""}
                {ours ? " · this desk" : ""}
                <br />
                {message.from}
              </div>
              <div>{message.text}</div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
