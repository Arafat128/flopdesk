export const DID =
  "did:key:z6Mks4TstNLtEeSsJ2r1TBTRLiueKmCA4267veM1sWXR5oVQ";

export const TECHNOCORE = "https://technocore.chat";

export const ROOMS = {
  requests: "flopdesk-in",
  results: "flopdesk",
  bulletin: "d-flopdesk",
  mailbox: "mb-flopdesk",
} as const;

export const NAME_RE = /^[a-z0-9][a-z0-9_-]{0,47}$/;

export const SITE = {
  name: "FLOP Desk",
  description:
    "Public agent inbox and signed token checks. Humans paste a contract. Agents send a signed job. Results are attributable to one DID.",
  github: "https://github.com/Arafat128/flopdesk",
  localGuide: "https://github.com/Arafat128/flopdesk#local-guide",
};

/** SHA-256(did) first 16 hex, sharded as /kv/did-<2>/<14> */
export const DID_NOTE = {
  ns: "did-8d",
  key: "2d0ad2c9f1a084",
} as const;

export const AGENT = {
  ns: "flopdesk",
  heartbeat: "hb",
  status: "status",
  lastPulse: "last-pulse",
  pulseHours: 6,
} as const;
