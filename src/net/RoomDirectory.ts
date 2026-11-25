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
  country?: string;
  ownerHash?: string;
  updatedAt: number;
  source?: 'server' | 'local';
}

const LOCAL_STORAGE_KEY = 'openhax_local_rooms_v1';
const ROOM_TTL_MS = 20000; // Heartbeat runs every 6s in Web Worker so ghost rooms purge in <=20s

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
  private phpApiWorks: boolean | null =
    typeof window !== 'undefined' && window.location.hostname.endsWith('github.io') ? false : null;
  private lastCloudRooms: PublicRoomInfo[] = [];
  private cachedOwnerHash: string | null = null;
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

  private hasCloudDb(): boolean {
    return Boolean(
      FIREBASE_DB_URL ||
      (SUPABASE_URL && SUPABASE_ANON_KEY) ||
      (UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN)
    );
  }

  isServerDirectoryActive(): boolean | null {
    if (this.phpApiWorks === true) return true;
    if (this.hasCloudDb()) return true;
    return this.phpApiWorks;
  }

  private async listCloudRooms(): Promise<PublicRoomInfo[] | null> {
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
          rooms.sort((a, b) => a.code.localeCompare(b.code));
          this.lastCloudRooms = rooms;
          emitDebug('NET', `Upstash listRooms OK (${rooms.length} rooms)`);
          return rooms;
        }
        emitDebug('ERR', `Upstash listRooms HTTP ${res.status}`);
      } catch (err) {
        emitDebug('ERR', `Upstash listRooms error: ${String(err)}`);
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
          const rows = ((await res.json()) as PublicRoomInfo[]).map((r) => ({ ...r, source: 'server' as const }));
          rows.sort((a, b) => a.code.localeCompare(b.code));
          this.lastCloudRooms = rows;
          emitDebug('NET', `Supabase listRooms OK (${rows.length} rooms)`);
          return rows;
        }
        emitDebug('ERR', `Supabase listRooms HTTP ${res.status}`);
      } catch (err) {
        emitDebug('ERR', `Supabase listRooms error: ${String(err)}`);
      }
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
              if (!r || !r.code) continue;
              if (now - (r.updatedAt || 0) < ROOM_TTL_MS) {
                rooms.push({ ...r, source: 'server' });
              } else {
                // Clean up stale closed/abandoned ghost rooms in Firebase
                void this.removeCloudRoom(r.code);
              }
            }
          }
          rooms.sort((a, b) => a.code.localeCompare(b.code));
          this.lastCloudRooms = rooms;
          emitDebug('NET', `Firebase listRooms OK (${rooms.length} rooms)`);
          return rooms;
        }
        emitDebug('ERR', `Firebase listRooms HTTP ${res.status}`);
      } catch (err) {
        emitDebug('ERR', `Firebase listRooms error: ${String(err)}`);
      }
      return this.lastCloudRooms;
    }

    return null;
  }

  private async publishCloudRoom(room: Omit<PublicRoomInfo, 'updatedAt' | 'source'>, now: number): Promise<void> {
    if (UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN) {
      try {
        const payload = JSON.stringify({ ...room, updatedAt: now });
        await fetch(
          `${UPSTASH_REDIS_REST_URL.replace(/\/$/, '')}/hset/openhax_rooms/${encodeURIComponent(room.code)}/${encodeURIComponent(payload)}`,
          { method: 'POST', headers: { Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}` } }
        );
      } catch { /* ignore */ }
      return;
    }

    if (SUPABASE_URL && SUPABASE_ANON_KEY) {
      try {
        await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rooms`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            Prefer: 'resolution=merge-duplicates'
          },
          body: JSON.stringify({ ...room, updatedAt: now })
        });
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
        if (!res.ok) emitDebug('ERR', `Firebase publishRoom HTTP ${res.status}`);
      } catch (err) {
        emitDebug('ERR', `Firebase publishRoom error: ${String(err)}`);
      }
    }
  }

  private async removeCloudRoom(code: string): Promise<void> {
    if (UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN) {
      try {
        await fetch(
          `${UPSTASH_REDIS_REST_URL.replace(/\/$/, '')}/hdel/openhax_rooms/${encodeURIComponent(code)}`,
          { method: 'POST', headers: { Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}` }, keepalive: true }
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
          },
          keepalive: true
        });
      } catch { /* ignore */ }
      return;
    }

    if (FIREBASE_DB_URL) {
      try {
        await fetch(`${FIREBASE_DB_URL.replace(/\/$/, '')}/rooms/${encodeURIComponent(code)}.json`, {
          method: 'DELETE',
          keepalive: true
        });
      } catch { /* ignore */ }
    }
  }

  async listRooms(): Promise<{ rooms: PublicRoomInfo[]; mode: 'server' | 'local'; latencyMs: number }> {
    const localRooms = this.readLocalRooms();
    const t0 = performance.now();

    if (this.phpApiWorks !== false) {
      try {
        const res = await fetch('./api/rooms.php?action=list', { cache: 'no-store' });
        const text = await res.text();
        // If static server returned raw PHP code instead of executing it, text starts with '<'
        if (res.ok && text.trim().startsWith('{')) {
          const parsed = JSON.parse(text) as { ok?: boolean; rooms?: PublicRoomInfo[] };
          if (parsed.ok && Array.isArray(parsed.rooms)) {
            this.phpApiWorks = true;
            const map = new Map<string, PublicRoomInfo>();
            for (const r of parsed.rooms) {
              map.set(r.code, { ...r, source: 'server' });
            }
            for (const lr of localRooms) {
              if (!map.has(lr.code)) {
                map.set(lr.code, lr);
              }
            }
            return { rooms: Array.from(map.values()), mode: 'server', latencyMs: Math.max(1, Math.round(performance.now() - t0)) };
          }
        }
        this.phpApiWorks = false;
      } catch {
        this.phpApiWorks = false;
      }
    }

    if (this.hasCloudDb()) {
      const cloudRooms = await this.listCloudRooms();
      if (cloudRooms !== null) {
        return { rooms: cloudRooms, mode: 'server', latencyMs: Math.max(1, Math.round(performance.now() - t0)) };
      }
    }

    return { rooms: localRooms, mode: 'local', latencyMs: 0 };
  }

  async getOwnerHash(): Promise<string> {
    if (this.cachedOwnerHash) return this.cachedOwnerHash;
    let fallbackId = '';
    try {
      fallbackId = window.localStorage.getItem('openhax_client_id') || '';
      if (!fallbackId) {
        fallbackId = 'cid_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
        window.localStorage.setItem('openhax_client_id', fallbackId);
      }
    } catch {
      fallbackId = 'cid_anon';
    }
    try {
      const ctrl = new AbortController();
      const timer = window.setTimeout(() => ctrl.abort(), 2000);
      const res = await fetch('https://api.ipify.org?format=json', { signal: ctrl.signal, cache: 'no-store' });
      window.clearTimeout(timer);
      if (res.ok) {
        const data = (await res.json()) as { ip?: string };
        if (data?.ip) {
          let h = 2166136261;
          for (let i = 0; i < data.ip.length; i++) {
            h ^= data.ip.charCodeAt(i);
            h = Math.imul(h, 16777619);
          }
          this.cachedOwnerHash = 'ip_' + (h >>> 0).toString(36);
          return this.cachedOwnerHash;
        }
      }
    } catch { /* ignore */ }
    this.cachedOwnerHash = fallbackId;
    return this.cachedOwnerHash;
  }

  async canCreateRoom(hostName: string): Promise<{ ok: boolean; count: number; limit: number }> {
    const limit = 3;
    const ownerHash = await this.getOwnerHash();
    const { rooms } = await this.listRooms();
    const cleanHost = (hostName || '').trim().toLowerCase();
    const count = rooms.filter((r) => {
      if (r.ownerHash && r.ownerHash === ownerHash) return true;
      if (!r.ownerHash && cleanHost && r.hostName.trim().toLowerCase() === cleanHost) return true;
      return false;
    }).length;
    return { ok: count < limit, count, limit };
  }

  async publishRoom(room: Omit<PublicRoomInfo, 'updatedAt' | 'source'>): Promise<void> {
    const now = Date.now();
    const ownerHash = await this.getOwnerHash();
    const payload = { ...room, ownerHash };
    this.writeLocalRoom({ ...payload, updatedAt: now, source: 'local' });

    if (this.phpApiWorks !== false) {
      try {
        const res = await fetch('./api/rooms.php?action=upsert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const text = await res.text();
        if (res.ok && text.trim().startsWith('{')) {
          this.phpApiWorks = true;
          return;
        }
        this.phpApiWorks = false;
      } catch {
        this.phpApiWorks = false;
      }
    }

    if (this.hasCloudDb()) {
      await this.publishCloudRoom(payload, now);
    }
  }

  async removeRoom(code: string): Promise<void> {
    this.removeLocalRoom(code);

    if (this.phpApiWorks !== false) {
      try {
        const res = await fetch('./api/rooms.php?action=remove', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
          keepalive: true
        });
        if (res.ok) return;
      } catch {
        // Fall through
      }
    }

    if (this.hasCloudDb()) {
      await this.removeCloudRoom(code);
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
