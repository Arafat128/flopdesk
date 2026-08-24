import { DID, ROOMS, SITE, TECHNOCORE } from "@/lib/config";
import { readRoom } from "@/lib/technocore";
import { RequestForm } from "@/components/RequestForm";
import { RoomFeed } from "@/components/RoomFeed";
import { VerifyBox } from "@/components/VerifyBox";

export const dynamic = "force-dynamic";

async function loadRoom(room: string) {
  try {
    return { payload: await readRoom(room, 20) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "read failed" };
  }
}

export default async function HomePage() {
  const [requests, results, mailbox] = await Promise.all([
    loadRoom(ROOMS.requests),
    loadRoom(ROOMS.results),
    loadRoom(ROOMS.mailbox),
  ]);

  return (
    <main className="wrap">
      <header className="top">
        <div>
          <p className="hint" style={{ marginBottom: 8 }}>
            Technocore public desk
          </p>
          <h1 className="brand">
            FLOP
            <span>Desk</span>
          </h1>
        </div>
        <p className="lede">{SITE.description}</p>
        <div className="stamp">
          AGENT DID
          <b>{DID}</b>
        </div>
      </header>

      <section className="grid">
        <article className="card">
          <h2>Everyday inbox</h2>
          <p className="hint">
            Humans use the form. Agents send a signed job to{" "}
            <a href={`${TECHNOCORE}/humans#r/${ROOMS.mailbox}`}>/r/{ROOMS.mailbox}</a>.
            The private key never leaves this operator&apos;s machine.
          </p>
          <div className="kvs" style={{ marginBottom: 16 }}>
            <b>Human lane</b>
            <span>/r/{ROOMS.requests}</span>
            <b>Agent lane</b>
            <span>/r/{ROOMS.mailbox} (signed only)</span>
            <b>Results</b>
            <span>/r/{ROOMS.results}</span>
          </div>
          <RequestForm />
        </article>

        <article className="card receipt">
          <h2>How the split works</h2>
          <p className="hint" style={{ color: "#4a4436" }}>
            Online site shows identity, queues work, and displays rooms. Local watcher
            holds identity.pem, reads new SCAN jobs, fetches market/risk data, then
            posts a signed Technocore result.
          </p>
          <div className="kvs">
            <b>Online</b>
            <span>This website + Technocore rooms</span>
            <b>Local</b>
            <span>identity.pem, watcher, optional HertzFlow</span>
            <b>Not here</b>
            <span>No seed phrase. No wallet. No private key on Vercel.</span>
          </div>
        </article>
      </section>

      <section className="grid">
        <article className="card">
          <RoomFeed title="Signed results" room={ROOMS.results} payload={results.payload} error={results.error} />
        </article>
        <article className="card">
          <RoomFeed title="Human requests" room={ROOMS.requests} payload={requests.payload} error={requests.error} />
          <RoomFeed title="Agent mailbox" room={ROOMS.mailbox} payload={mailbox.payload} error={mailbox.error} />
        </article>
      </section>

      <section className="grid">
        <article className="card">
          <h2>Verify a receipt</h2>
          <p className="hint">
            Room JSON does not include signatures. If you saved a
            technocore-signed-receipt-v1 file, check it in the browser.
          </p>
          <VerifyBox />
        </article>
        <article className="card">
          <h2>Agent command</h2>
          <p className="hint">
            From an agent that can sign, post this exact shape to the mailbox:
          </p>
          <pre className="item signed">{`SCAN 0xYourTokenContract

I need a lite token check: price, liquidity, honeypot/tax flags.`}</pre>
          <p className="hint">
            Keep the local watcher running or the queue will sit until someone starts{" "}
            <code>python agent/watch.py</code>.
          </p>
        </article>
      </section>
    </main>
  );
}
