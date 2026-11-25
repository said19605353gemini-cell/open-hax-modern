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

function emitDebug(tag: 'SYS' | 'NET' | 'ERR' | 'DUP', msg: string): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('openhax:debug', { detail: `[${tag}] ${msg}` }));
  }
}
// GitHub Pages gibi statik sitelerde ortak oda listesi için Firebase, Supabase veya Upstash Redis kullanabilirsiniz
const FIREBASE_DB_URL: string = 'https://haxturko-default-rtdb.europe-west1.firebasedatabase.app';
const SUPABASE_URL: string = '';
const SUPABASE_ANON_KEY: string = '';
const UPSTASH_REDIS_REST_URL: string = '';
const UPSTASH_REDIS_REST_TOKEN: string = '';

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

  private useCloudDb(): boolean {
    const hasCloud = Boolean(
      FIREBASE_DB_URL ||
      (SUPABASE_URL && SUPABASE_ANON_KEY) ||
      (UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN)
    );
    if (!hasCloud) return false;
    const isGh = typeof window !== 'undefined' && window.location.hostname.endsWith('github.io');
    return isGh || this.serverApiWorks === false;
  }

  isServerDirectoryActive(): boolean | null {
    return this.serverApiWorks;
  }

  async listRooms(): Promise<{ rooms: PublicRoomInfo[]; mode: 'server' | 'local' }> {
    const localRooms = this.readLocalRooms();

    if (this.useCloudDb()) {
      if (UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN) {
        try {
          const res = await fetch(`${UPSTASH_REDIS_REST_URL.replace(/\/$/, '')}/hgetall/openhax_rooms`, {
            headers: { Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}` },
            cache: 'no-store'
          });
          if (res.ok) {
            const json = (await res.json()) as { result?: string[] };
            const arr = json.result || [];
            const now = Date.now();
            const rooms: PublicRoomInfo[] = [];
            for (let i = 1; i < arr.length; i += 2) {
              try {
                const r = JSON.parse(arr[i]) as PublicRoomInfo;
                if (r && r.code && now - (r.updatedAt || 0) < ROOM_TTL_MS) {
                  rooms.push({ ...r, source: 'server' });
                }
              } catch { /* ignore */ }
            }
            this.serverApiWorks = true;
            emitDebug('NET', `Firebase listRooms OK (${rooms.length} rooms)`);
            return { rooms, mode: 'server' };
          } else {
            emitDebug('ERR', `Firebase listRooms HTTP ${res.status}`);
          }
        } catch (err) {
          emitDebug('ERR', `Firebase listRooms error: ${String(err)}`);
        }
      }

      if (SUPABASE_URL && SUPABASE_ANON_KEY) {
        try {
          const cutoff = Date.now() - ROOM_TTL_MS;
          const res = await fetch(
            `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rooms?updatedAt=gt.${cutoff}&select=*`,
            {
              headers: {
                apikey: SUPABASE_ANON_KEY,
                Authorization: `Bearer ${SUPABASE_ANON_KEY}`
              },
              cache: 'no-store'
            }
          );
          if (res.ok) {
            const rows = (await res.json()) as PublicRoomInfo[];
            this.serverApiWorks = true;
            return { rooms: rows.map((r) => ({ ...r, source: 'server' })), mode: 'server' };
          }
        } catch { /* fall through */ }
      }

      if (FIREBASE_DB_URL) {
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
            emitDebug('NET', `Firebase listRooms OK (${rooms.length} rooms)`);
            return { rooms, mode: 'server' };
          } else {
            emitDebug('ERR', `Firebase listRooms HTTP ${res.status}`);
          }
        } catch (err) {
          emitDebug('ERR', `Firebase listRooms error: ${String(err)}`);
        }
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

    if (this.useCloudDb()) {
      if (UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN) {
        try {
          const payload = JSON.stringify({ ...room, updatedAt: now });
          const res = await fetch(
            `${UPSTASH_REDIS_REST_URL.replace(/\/$/, '')}/hset/openhax_rooms/${encodeURIComponent(room.code)}/${encodeURIComponent(payload)}`,
            { method: 'POST', headers: { Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}` } }
          );
          this.serverApiWorks = res.ok;
        } catch { /* ignore */ }
        return;
      }

      if (SUPABASE_URL && SUPABASE_ANON_KEY) {
        try {
          const res = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rooms`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: SUPABASE_ANON_KEY,
              Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
              Prefer: 'resolution=merge-duplicates'
            },
            body: JSON.stringify({ ...room, updatedAt: now })
          });
          this.serverApiWorks = res.ok;
        } catch { /* ignore */ }
        return;
      }

      if (FIREBASE_DB_URL) {
        try {
          const res = await fetch(`${FIREBASE_DB_URL.replace(/\/$/, '')}/rooms/${encodeURIComponent(room.code)}.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...room, updatedAt: now })
          });
          this.serverApiWorks = res.ok;
        } catch { /* ignore */ }
        return;
      }
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

    if (this.useCloudDb()) {
      if (UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN) {
        try {
          await fetch(
            `${UPSTASH_REDIS_REST_URL.replace(/\/$/, '')}/hdel/openhax_rooms/${encodeURIComponent(code)}`,
            { method: 'POST', headers: { Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}` } }
          );
        } catch { /* ignore */ }
        return;
      }

      if (SUPABASE_URL && SUPABASE_ANON_KEY) {
        try {
          await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rooms?code=eq.${encodeURIComponent(code)}`, {
            method: 'DELETE',
            headers: {
              apikey: SUPABASE_ANON_KEY,
              Authorization: `Bearer ${SUPABASE_ANON_KEY}`
            }
          });
        } catch { /* ignore */ }
        return;
      }

      if (FIREBASE_DB_URL) {
        try {
          await fetch(`${FIREBASE_DB_URL.replace(/\/$/, '')}/rooms/${encodeURIComponent(code)}.json`, {
            method: 'DELETE'
          });
        } catch { /* ignore */ }
        return;
      }
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
