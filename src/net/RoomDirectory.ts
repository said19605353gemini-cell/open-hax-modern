import { StadiumId } from '../types';

export interface PublicRoomInfo {
  code: string;
  name: string;
  hostName: string;
  stadium: StadiumId;
  players: number;
  bots: number;
  maxPlayers: number;
  hasPassword: boolean;
  updatedAt: number;
  source?: 'server' | 'local';
}

const LOCAL_STORAGE_KEY = 'openhax_local_rooms_v1';
const ROOM_TTL_MS = 22000;
// GitHub Pages gibi statik sitelerde ortak oda listesi için Firebase Realtime Database URL'sini buraya yazın
// Örnek: 'https://projeniz-default-rtdb.firebaseio.com'
const FIREBASE_DB_URL: string = 'https://haxturko-default-rtdb.europe-west1.firebasedatabase.app';

export class RoomDirectory {
  private serverApiWorks: boolean | null = null;
  private channel: BroadcastChannel | null = null;
  private onLocalUpdateCallback: (() => void) | null = null;

  constructor(onLocalUpdate?: () => void) {
    this.onLocalUpdateCallback = onLocalUpdate || null;
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.channel = new BroadcastChannel('openhax_rooms_v1');
        this.channel.onmessage = () => {
          this.onLocalUpdateCallback?.();
        };
      } catch {
        this.channel = null;
      }
    }
  }

  private useFirebase(): boolean {
    if (!FIREBASE_DB_URL) return false;
    const isGh = typeof window !== 'undefined' && window.location.hostname.endsWith('github.io');
    return isGh || this.serverApiWorks === false;
  }

  isServerDirectoryActive(): boolean | null {
    return this.serverApiWorks;
  }

  async listRooms(): Promise<{ rooms: PublicRoomInfo[]; mode: 'server' | 'local' }> {
    const localRooms = this.readLocalRooms();

    if (this.useFirebase()) {
      try {
        const res = await fetch(`${FIREBASE_DB_URL.replace(/\/$/, '')}/rooms.json`, { cache: 'no-store' });
        if (res.ok) {
          const data = (await res.json()) as Record<string, PublicRoomInfo> | null;
          const now = Date.now();
          const rooms: PublicRoomInfo[] = [];
          if (data && typeof data === 'object') {
            for (const r of Object.values(data)) {
              if (r && r.code && now - (r.updatedAt || 0) < ROOM_TTL_MS) {
                rooms.push({ ...r, source: 'server' });
              }
            }
          }
          this.serverApiWorks = true;
          return { rooms, mode: 'server' };
        }
      } catch {
        // Fall through to local
      }
    }

    if (this.serverApiWorks !== false) {
      try {
        const res = await fetch('./api/rooms.php?action=list', { cache: 'no-store' });
        const text = await res.text();
        // If static server returned raw PHP code instead of executing it, text starts with '<'
        if (res.ok && text.trim().startsWith('{')) {
          const parsed = JSON.parse(text) as { ok?: boolean; rooms?: PublicRoomInfo[] };
          if (parsed.ok && Array.isArray(parsed.rooms)) {
            this.serverApiWorks = true;
            const map = new Map<string, PublicRoomInfo>();
            for (const r of parsed.rooms) {
              map.set(r.code, { ...r, source: 'server' });
            }
            for (const lr of localRooms) {
              if (!map.has(lr.code)) {
                map.set(lr.code, lr);
              }
            }
            return { rooms: Array.from(map.values()), mode: 'server' };
          }
        }
        this.serverApiWorks = false;
      } catch {
        this.serverApiWorks = false;
      }
    }

    return { rooms: localRooms, mode: 'local' };
  }

  async publishRoom(room: Omit<PublicRoomInfo, 'updatedAt' | 'source'>): Promise<void> {
    const now = Date.now();
    this.writeLocalRoom({ ...room, updatedAt: now, source: 'local' });

    if (this.useFirebase()) {
      try {
        const res = await fetch(`${FIREBASE_DB_URL.replace(/\/$/, '')}/rooms/${encodeURIComponent(room.code)}.json`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...room, updatedAt: now })
        });
        this.serverApiWorks = res.ok;
      } catch {
        // Ignore
      }
      return;
    }

    if (this.serverApiWorks === false) {
      return;
    }

    try {
      const res = await fetch('./api/rooms.php?action=upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(room)
      });
      const text = await res.text();
      this.serverApiWorks = res.ok && text.trim().startsWith('{');
    } catch {
      this.serverApiWorks = false;
    }
  }

  async removeRoom(code: string): Promise<void> {
    this.removeLocalRoom(code);

    if (this.useFirebase()) {
      try {
        await fetch(`${FIREBASE_DB_URL.replace(/\/$/, '')}/rooms/${encodeURIComponent(code)}.json`, {
          method: 'DELETE'
        });
      } catch {
        // Ignore
      }
      return;
    }

    if (this.serverApiWorks === false) {
      return;
    }

    try {
      await fetch('./api/rooms.php?action=remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });
    } catch {
      // Ignore network errors during unload
    }
  }

  private readLocalRooms(): PublicRoomInfo[] {
    try {
      const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw) as PublicRoomInfo[];
      if (!Array.isArray(arr)) return [];
      const now = Date.now();
      return arr.filter((r) => r && r.code && now - (r.updatedAt || 0) <= ROOM_TTL_MS);
    } catch {
      return [];
    }
  }

  private writeLocalRoom(room: PublicRoomInfo): void {
    try {
      const list = this.readLocalRooms().filter((r) => r.code !== room.code);
      list.unshift(room);
      window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(list));
      this.channel?.postMessage({ type: 'refresh' });
    } catch {
      // Ignore
    }
  }

  private removeLocalRoom(code: string): void {
    try {
      const list = this.readLocalRooms().filter((r) => r.code !== code);
      window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(list));
      this.channel?.postMessage({ type: 'refresh' });
    } catch {
      // Ignore
    }
  }
}
