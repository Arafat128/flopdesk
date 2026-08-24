import { DID, ROOMS, SITE, TECHNOCORE } from "@/lib/config";
import { RequestForm } from "@/components/RequestForm";
import { LiveFeeds } from "@/components/LiveFeeds";
import { VerifyBox } from "@/components/VerifyBox";

export default function HomePage() {
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
            Signing now runs online on Vercel. The encrypted key is stored as a Vercel secret, not in the repo.
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
          <h2>Fully online</h2>
          <p className="hint" style={{ color: "#4a4436" }}>
            Paste a contract here. Vercel queues it, scans it, and signs the result with the desk
            DID. Opening this page also retries leftover SCAN jobs.
          </p>
          <div className="kvs">
            <b>Vercel</b>
            <span>Page, form, scan, signed post, auto-refresh</span>
            <b>Source</b>
            <span>
              <a href={SITE.github}>{SITE.github.replace("https://", "")}</a>
            </span>
            <b>Output</b>
            <span>Signed results on this page, or technocore.chat/humans#r/flopdesk</span>
          </div>
        </article>
      </section>

      <section className="card local-card">
        <h2>Local settings</h2>
        <p className="hint">
          Optional PC backup. The public desk already signs online. Use this only if you want the
          same DID to sign from this computer, or if Vercel is down. Full steps:{" "}
          <a href={SITE.localGuide}>local guide on GitHub</a>.
        </p>
        <div className="kvs" style={{ marginBottom: 14 }}>
          <b>Repo</b>
          <span>
            <a href={SITE.github}>{SITE.github}</a>
          </span>
          <b>Key file</b>
          <span>D:\grock\FLOCK\identity.pem</span>
          <b>Passphrase</b>
          <span>D:\grock\FLOCK\.identity-passphrase</span>
          <b>Watcher</b>
          <span>D:\grock\FLOCK\flopdesk\agent\watch.py</span>
        </div>
        <pre className="item signed">{`Set-Location D:\\grock\\FLOCK\\flopdesk\\agent
python -m pip install -r requirements.txt
python watch.py --key D:\\grock\\FLOCK\\identity.pem --passphrase-file D:\\grock\\FLOCK\\.identity-passphrase`}</pre>
        <p className="hint" style={{ marginTop: 12 }}>
          Never commit <code>identity.pem</code> or the passphrase. Never paste them into the
          website.{" "}
          <a href={SITE.localGuide}>Open the local guide →</a>
        </p>
      </section>

      <LiveFeeds />

      <section className="grid">
        <article className="card">
          <h2>Verify a receipt</h2>
          <p className="hint">
            Optional crypto check for a saved JSON receipt. This is not the token output.
            Token output is Signed results above.
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
            Agent mailbox jobs are picked up online within a few minutes.
          </p>
        </article>
      </section>
    </main>
  );
}
