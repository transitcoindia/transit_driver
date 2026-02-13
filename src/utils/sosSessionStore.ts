import { randomBytes } from "crypto";

export interface SosSession {
  sessionId: string;
  driverId: string;
  lat: number;
  lng: number;
  updatedAt: Date;
  createdAt: Date;
}

const sessions = new Map<string, SosSession>();
const TTL_MS = 10 * 60 * 1000; // 10 minutes

function generateSessionId(): string {
  return randomBytes(8).toString("hex");
}

export function createSosSession(
  driverId: string,
  lat: number,
  lng: number
): string {
  const sessionId = generateSessionId();
  const now = new Date();
  sessions.set(sessionId, {
    sessionId,
    driverId,
    lat,
    lng,
    updatedAt: now,
    createdAt: now,
  });
  // Clean expired
  const cutoff = new Date(Date.now() - TTL_MS);
  for (const [id, s] of sessions.entries()) {
    if (s.updatedAt < cutoff) sessions.delete(id);
  }
  return sessionId;
}

export function updateSosSession(
  sessionId: string,
  driverId: string,
  lat: number,
  lng: number
): boolean {
  const s = sessions.get(sessionId);
  if (!s || s.driverId !== driverId) return false;
  s.lat = lat;
  s.lng = lng;
  s.updatedAt = new Date();
  return true;
}

export function getSosSession(sessionId: string): SosSession | null {
  const s = sessions.get(sessionId);
  if (!s) return null;
  if (Date.now() - s.updatedAt.getTime() > TTL_MS) {
    sessions.delete(sessionId);
    return null;
  }
  return s;
}
