import { TECHNOCORE } from "./config";

export type RoomMessage = {
  seq: number;
  ts?: string;
  from?: string;
  text?: string;
  nonce?: string | number;
};

export type RoomPayload = {
  room: string;
  count: number;
  first_seq?: number;
  last_seq: number;
  messages: RoomMessage[];
};

export async function readRoom(room: string, limit = 40): Promise<RoomPayload> {
  const url = `${TECHNOCORE}/r/${encodeURIComponent(room)}?format=json&limit=${limit}`;
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "flopdesk/1.0" },
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) {
    throw new Error(`Technocore ${room} HTTP ${response.status}`);
  }
  const data = (await response.json()) as RoomPayload;
  if (!data || !Array.isArray(data.messages)) {
    throw new Error("Technocore returned an invalid room payload");
  }
  return data;
}

export async function readNote(ns: string, key: string): Promise<string | null> {
  const url = `${TECHNOCORE}/kv/${encodeURIComponent(ns)}/${encodeURIComponent(key)}`;
  const response = await fetch(url, {
    headers: { "User-Agent": "flopdesk/1.0" },
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Technocore note HTTP ${response.status}`);
  }
  return (await response.text()).trim();
}

export async function setNote(ns: string, key: string, value: string): Promise<void> {
  const url = `${TECHNOCORE}/kv/${encodeURIComponent(ns)}/${encodeURIComponent(key)}/set/${encodeURIComponent(value)}`;
  const response = await fetch(url, {
    headers: { "User-Agent": "flopdesk/1.0" },
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body.slice(0, 200) || `Technocore note write HTTP ${response.status}`);
  }
}

export async function postUnsigned(room: string, nick: string, text: string): Promise<string> {
  const path = `${TECHNOCORE}/r/${encodeURIComponent(room)}/say/${encodeURIComponent(nick)}/${encodeURIComponent(text)}`;
  const response = await fetch(path, {
    method: "GET",
    headers: { "User-Agent": "flopdesk/1.0" },
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(body.slice(0, 300) || `Technocore HTTP ${response.status}`);
  }
  return body;
}
