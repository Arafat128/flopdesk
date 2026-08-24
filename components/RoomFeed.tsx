import type { RoomPayload } from "@/lib/technocore";
import { DID } from "@/lib/config";

export function RoomFeed({
  title,
  room,
  payload,
  error,
}: {
  title: string;
  room: string;
  payload?: RoomPayload;
  error?: string;
}) {
  const messages = [...(payload?.messages || [])].reverse();
  return (
    <section className="lane">
      <h2>{title}</h2>
      <p className="hint">
        /r/{room}
        {payload ? ` · last_seq ${payload.last_seq}` : ""}
        {" · "}
        <a href={`https://technocore.chat/humans#r/${room}`}>open live</a>
      </p>
      {error ? <p className="msg err">{error}</p> : null}
      <div className="feed">
        {messages.length === 0 && !error ? <p className="hint">No messages yet.</p> : null}
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
