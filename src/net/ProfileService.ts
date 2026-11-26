import { getStadium } from '../game/stadiums';
import { PhysicsProfile, StadiumId } from '../types';

const FIREBASE_DB_URL = 'https://haxturko53-default-rtdb.firebaseio.com';
const LOCAL_PROFILE_KEY = 'openhax_profile_v1';

export interface PlayerProfile {
  username: string;
  key: string;
  avatar: string;
  country: string;
  passHash?: string;
  goals: number;
  assists: number;
  saves: number;
  matches: number;
  wins: number;
  playSeconds: number;
  modes: Record<string, number>;
  stadiums: Record<string, number>;
  createdAt: number;
  updatedAt: number;
}

export function normalizeUsernameKey(username: string): string {
  return username
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .slice(0, 24);
}

export async function hashPassword(password: string): Promise<string> {
  const clean = password.trim();
  if (!clean) return '';
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const data = new TextEncoder().encode('openhax:' + clean);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return btoa(unescape(encodeURIComponent(clean)));
}

export function topRecordKey(map?: Record<string, number>): { key: string; count: number } | null {
  if (!map) return null;
  let bestKey = '';
  let bestVal = 0;
  for (const [k, v] of Object.entries(map)) {
    if (v > bestVal) {
      bestVal = v;
      bestKey = k;
    }
  }
  return bestKey ? { key: bestKey, count: bestVal } : null;
}

export function formatStadiumName(id: string): string {
  return getStadium(id as StadiumId).label;
}

const MODE_LABELS: Record<string, string> = {
  openhax: 'OpenHax Orijinal',
  classic_hax: 'Klasik Haxball',
  classic_hax_v2: 'Klasik Haxball v2',
  pro_control: 'Pro Kontrol',
  pro_control_v2: 'Pro Kontrol v2',
  pro_control_v3: 'Pro Kontrol v3',
  futsal: 'Futsal',
  big_arena: 'Büyük Saha',
  turbo: 'Hızlı Arcade',
  turbo_v2: 'Hızlı Arcade v2',
  low_gravity: 'Düşük Sürtünme',
  real_soccer: 'Gerçekçi Futbol',
  real_soccer_v2: 'Gerçekçi Futbol v2',
  ice_hockey: 'Buz Hokeyi',
  pinball: 'Pinball',
  heavy_tank: 'Ağır Tank'
};

export function formatModeName(id: string): string {
  return MODE_LABELS[id as PhysicsProfile] || id;
}

export function getTimeBadge(playSeconds = 0): { icon: string; name: string; nextAtSec: number | null } {
  if (playSeconds >= 36000) return { icon: '👑', name: 'Kral (10+ Saat)', nextAtSec: null };
  if (playSeconds >= 18000) return { icon: '💎', name: 'Elmas (5+ Saat)', nextAtSec: 36000 };
  if (playSeconds >= 3600) return { icon: '🥇', name: 'Altın (1+ Saat)', nextAtSec: 18000 };
  if (playSeconds >= 1800) return { icon: '🥈', name: 'Gümüş (30+ Dk)', nextAtSec: 3600 };
  if (playSeconds >= 300) return { icon: '🥉', name: 'Bronz (5+ Dk)', nextAtSec: 1800 };
  return { icon: '🌱', name: 'Çaylak', nextAtSec: 300 };
}

export function formatPlayTime(sec = 0): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}sa ${m}dk`;
  if (m > 0) return `${m}dk ${s % 60}sn`;
  return `${s}sn`;
}

export function createEmptyProfile(username: string, avatar: string, country: string, passHash = ''): PlayerProfile {
  const now = Date.now();
  return {
    username,
    key: normalizeUsernameKey(username) || 'player',
    avatar,
    country,
    passHash,
    goals: 0,
    assists: 0,
    saves: 0,
    matches: 0,
    wins: 0,
    playSeconds: 0,
    modes: {},
    stadiums: {},
    createdAt: now,
    updatedAt: now
  };
}

export class ProfileService {
  private isGuestSession = false;

  setGuestMode(guest: boolean): void {
    this.isGuestSession = guest;
  }

  isGuest(): boolean {
    return this.isGuestSession;
  }

  async checkMemberLocked(username: string): Promise<boolean> {
    const key = normalizeUsernameKey(username);
    if (!key) return false;
    try {
      const res = await fetch(`${FIREBASE_DB_URL}/profiles/${encodeURIComponent(key)}.json`, { cache: 'no-store' });
      if (res.ok) {
        const data = (await res.json()) as PlayerProfile | null;
        return Boolean(data && data.passHash);
      }
    } catch { /* ignore */ }
    return false;
  }

  async loginOrRegister(
    username: string,
    avatar: string,
    country: string,
    password: string
  ): Promise<{ ok: true; profile: PlayerProfile; isNew: boolean } | { ok: false; error: string }> {
    const key = normalizeUsernameKey(username);
    if (!key) return { ok: false, error: 'Geçersiz kullanıcı adı.' };
    const passHash = await hashPassword(password);

    // Check Firebase first
    let remote: PlayerProfile | null = null;
    try {
      const res = await fetch(`${FIREBASE_DB_URL}/profiles/${encodeURIComponent(key)}.json`, { cache: 'no-store' });
      if (res.ok) {
        const data = (await res.json()) as PlayerProfile | null;
        if (data && data.username) {
          remote = {
            ...createEmptyProfile(data.username, avatar, country, data.passHash || ''),
            ...data,
            modes: data.modes || {},
            stadiums: data.stadiums || {}
          };
        }
      }
    } catch {
      // Fallback to local
    }

    if (remote) {
      if (remote.passHash) {
        if (!passHash || passHash !== remote.passHash) {
          return { ok: false, error: 'Bu kullanıcı adı şifreli! Lütfen doğru hesap şifresini girin.' };
        }
      }
      remote.avatar = avatar;
      remote.country = country;
      remote.updatedAt = Date.now();
      if (!remote.passHash && passHash) remote.passHash = passHash;
      await this.saveProfile(remote);
      return { ok: true, profile: remote, isNew: false };
    }

    // Fallback check localStorage if offline
    const local = this.loadLocal();
    if (local && local.key === key) {
      if (local.passHash && passHash !== local.passHash) {
        return { ok: false, error: 'Yerel hesap şifresi hatalı.' };
      }
      local.avatar = avatar;
      local.country = country;
      local.updatedAt = Date.now();
      if (!local.passHash && passHash) local.passHash = passHash;
      await this.saveProfile(local);
      return { ok: true, profile: local, isNew: false };
    }

    const fresh = createEmptyProfile(username, avatar, country, passHash);
    await this.saveProfile(fresh);
    return { ok: true, profile: fresh, isNew: true };
  }

  loadLocal(): PlayerProfile | null {
    try {
      const raw = window.localStorage.getItem(LOCAL_PROFILE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as PlayerProfile;
    } catch {
      return null;
    }
  }

  logoutLocal(): void {
    try {
      window.localStorage.removeItem(LOCAL_PROFILE_KEY);
    } catch { /* ignore */ }
    try {
      const g = (window as unknown as { google?: { accounts?: { id?: { disableAutoSelect?: () => void } } } }).google;
      g?.accounts?.id?.disableAutoSelect?.();
    } catch { /* ignore */ }
  }

  async saveProfile(profile: PlayerProfile): Promise<void> {
    profile.updatedAt = Date.now();
    try {
      window.localStorage.setItem(LOCAL_PROFILE_KEY, JSON.stringify(profile));
    } catch { /* ignore */ }
    try {
      await fetch(`${FIREBASE_DB_URL}/profiles/${encodeURIComponent(profile.key)}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
        keepalive: true
      });
    } catch { /* ignore */ }
  }

  async fetchProfileByUsername(username: string): Promise<PlayerProfile | null> {
    const key = normalizeUsernameKey(username);
    if (!key) return null;
    try {
      const res = await fetch(`${FIREBASE_DB_URL}/profiles/${encodeURIComponent(key)}.json`, { cache: 'no-store' });
      if (res.ok) {
        const data = (await res.json()) as PlayerProfile | null;
        if (data && data.username) {
          return {
            ...createEmptyProfile(data.username, data.avatar || ':)', data.country || 'TR'),
            ...data,
            modes: data.modes || {},
            stadiums: data.stadiums || {}
          };
        }
      }
    } catch { /* ignore */ }
    const local = this.loadLocal();
    return local && local.key === key ? local : null;
  }

  async fetchLeaderboard(limit = 12): Promise<PlayerProfile[]> {
    try {
      const res = await fetch(`${FIREBASE_DB_URL}/profiles.json`, { cache: 'no-store' });
      if (res.ok) {
        const data = (await res.json()) as Record<string, PlayerProfile> | null;
        if (data && typeof data === 'object') {
          return Object.values(data)
            .filter((p) => p && p.username)
            .sort((a, b) => (b.goals || 0) - (a.goals || 0) || (b.saves || 0) - (a.saves || 0))
            .slice(0, limit);
        }
      }
    } catch { /* ignore */ }
    const local = this.loadLocal();
    return local ? [local] : [];
  }
}
