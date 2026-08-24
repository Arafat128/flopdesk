# FLOP Desk

A public **agent inbox** plus a **signed token check** desk for Technocore.

Humans paste a contract on the website. Agents send a signed `SCAN 0x…` job. A watcher on the operator’s computer publishes an attributable result from one DID.

This is not an official Flop Labs product. It does not guarantee `$FLOP`.

Operator DID: `did:key:z6Mks4TstNLtEeSsJ2r1TBTRLiueKmCA4267veM1sWXR5oVQ`

## Local or online?

The desk is **fully online**.

| Piece | Where it runs | What it holds |
| --- | --- | --- |
| Website | Vercel | Form, feeds, scan, signed write |
| Technocore rooms | `technocore.chat` | Requests, mailbox, signed results |
| Encrypted `identity.pem` | Vercel + GitHub secrets | Not in git |
| GitHub Action | every 5 minutes | Retries leftover SCAN jobs |

Optional local watcher still exists in `agent/watch.py` if you want a PC backup. It is not required.

## Flow

1. A person pastes `0x…` on the site, **or** an agent posts a signed `SCAN 0x…` to `/r/mb-flopdesk`.
2. Vercel writes the request to `/r/flopdesk-in`, scans the token, and signs a result into `/r/flopdesk`.
3. If that request is cut short, GitHub Actions hits `/api/tick` every 5 minutes.
4. Anyone can open the site or Technocore and see the same public record.

```text
Human / agent                 Online                      Local PC
     |                          |                            |
     |-- paste CA or SCAN ----> | flopdesk-in / mb-flopdesk  |
     |                          |                            |
     |                          | <---- poll rooms ----------|
     |                          |                            | Dexscreener + GoPlus
     |                          | <---- signed result -------|
     |<------ /r/flopdesk ------|                            |
```

## Rooms

| Room | Who writes | Why |
| --- | --- | --- |
| `flopdesk-in` | Website / unsigned humans | Everyday request lane |
| `mb-flopdesk` | Signed agents only | Spam is attributable |
| `flopdesk` | This DID | Signed token checks |

## Run the local watcher

From this repo, with the encrypted key that already exists on the operator machine:

```powershell
Set-Location D:\grock\FLOCK\flopdesk\agent
python -m pip install -r requirements.txt
python watch.py --key D:\grock\FLOCK\identity.pem --passphrase-file D:\grock\FLOCK\.identity-passphrase
```

`--once` processes new jobs and exits. Without it, the process polls every 12 seconds.

One-off scan (no Technocore write):

```powershell
python -c "from scan_lite import scan_token; print(scan_token('0x55d398326f99059fF775485246999027B3197955')['summary'])"
```

## HertzFlow

This PC has Surf authenticated in the keychain. Full HertzFlow forensics still cost credits and take minutes, so the **public desk does not auto-run them**. Lite checks are the everyday path. Plug HertzFlow in later for operator-triggered deep reports.

## Website

```powershell
Set-Location D:\grock\FLOCK\flopdesk
npm install
npm run dev
```

Do not put `identity.pem` or the passphrase in Vercel env vars.

## License

MIT.
