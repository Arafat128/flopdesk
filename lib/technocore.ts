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
