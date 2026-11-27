import Peer, { DataConnection } from 'peerjs';
import { MatchSnapshot, Team } from '../types';
import { censorText } from '../game/profanity';

export type PeerRole = 'offline' | 'host' | 'guest';

export type NetPacket =
  | { type: 'join'; name: string; avatar: string; password?: string; country?: string; isMobile?: boolean }
  | { type: 'welcome'; playerId: string; roomName: string }
  | { type: 'auth_error'; reason: string }
  | { type: 'input'; bits: number }
  | { type: 'team'; team: Team }
  | { type: 'chat'; author: string; text: string; team?: Team }
  | { type: 'snap'; data: MatchSnapshot }
  | { type: 'ping'; ts: number; lastRtt?: number }
  | { type: 'pong'; ts: number }
  | { type: 'admin_cmd'; cmd: string; targetId?: string; value?: string | number | boolean }
  | { type: 'migrate_host'; newHostId: string; roomCode: string; roomName: string; password: string }
  | { type: 'stat_event'; event: 'goal' | 'save' | 'assist' | 'win' | 'match'; mode?: string; stadium?: string };

export interface PeerCallbacks {
  onStatus: (role: PeerRole, stateText: string, roomCode: string) => void;
  onLog: (level: 'INFO' | 'WARN' | 'ERROR', source: string, msg: string, detail?: string) => void;
  onPeerJoin: (peerId: string, name: string, avatar: string, country?: string, isMobile?: boolean) => boolean | string; // true = ok, string = reject reason
  onPeerLeave: (peerId: string) => void;
  onPeerInput: (peerId: string, bits: number) => void;
  onPeerTeam: (peerId: string, team: Team) => void;
  onChat: (author: string, text: string, team?: Team) => void;
  onWelcome: (playerId: string, roomName: string) => void;
  onAuthError: (reason: string) => void;
  onSnapshot: (snap: MatchSnapshot) => void;
  onPingUpdate: (pingMs: number | null) => void;
  onPeerPing?: (peerId: string, pingMs: number) => void;
  onAdminCmd?: (fromPeerId: string, cmd: string, targetId?: string, value?: string | number | boolean) => void;
  onMigrateHost?: (newHostId: string, roomCode: string, roomName: string, password: string) => void;
  onHostLost?: (roomCode: string) => void;
  onStatEvent?: (event: 'goal' | 'save' | 'assist' | 'win' | 'match', mode?: string, stadium?: string) => void;
}

const PEER_PREFIX = 'openhax2026-';

export function extractRoomCode(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  try {
    if (trimmed.includes('://') || trimmed.includes('room=')) {
      const url = new URL(trimmed, window.location.href);
      const q = url.searchParams.get('room');
      if (q) {
        return q.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
      }
    }
  } catch {
    // Fallback to raw sanitization
  }
  return trimmed.toLowerCase().replace(/[^a-z0-9-]/g, '');
}

function randomRoomCode(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 5; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

export class PeerManager {
  private peer: Peer | null = null;
  private hostConn: DataConnection | null = null;
  private clientConns = new Map<string, DataConnection>();
  private clientNames = new Map<string, string>();
  private clientLastChat = new Map<string, number>();
  private clientLastTeam = new Map<string, number>();
  private pingTimer: number | null = null;
  private lastGuestRtt: number | null = null;
  private role: PeerRole = 'offline';
  private roomCode = '';
  private roomName = '';
  private roomPassword = '';
  private cb: PeerCallbacks;
  private hostPassAttempts = new Map<string, { count: number; lockedUntil: number }>();

  constructor(callbacks: PeerCallbacks) {
    this.cb = callbacks;
  }

  getRole(): PeerRole {
    return this.role;
  }

  getRoomCode(): string {
    return this.roomCode;
  }

  getRoomName(): string {
    return this.roomName;
  }

  getConnectedHumanCount(): number {
    if (this.role === 'host') return this.clientConns.size + 1;
    if (this.role === 'guest' && this.hostConn?.open) return 2;
    return 1;
  }

  hostRoom(options: { roomName: string; password?: string; preferredCode?: string; retryAttempt?: number }): string {
    this.disconnect();

    const code = (options.preferredCode || randomRoomCode()).toLowerCase().replace(/[^a-z0-9-]/g, '');
    const attempt = options.retryAttempt || 0;
    this.roomCode = code;
    this.roomName = options.roomName.trim() || 'OpenHax Oda';
    this.roomPassword = (options.password || '').trim();
    this.role = 'host';
    this.cb.onStatus('host', 'Signaling baglantisi kuruluyor...', code);
    this.cb.onLog('INFO', 'PeerJS', 'Online oda kuruluyor: ' + code);

    const peer = new Peer(PEER_PREFIX + code, { debug: 1 });
    this.peer = peer;

    peer.on('open', (id) => {
      if (this.peer !== peer) return;
      this.cb.onStatus('host', 'Oda acik (P2P)', code);
      this.cb.onLog('INFO', 'PeerJS', 'Oda acildi: ' + id);
    });

    peer.on('connection', (conn) => {
      this.cb.onLog('INFO', 'PeerJS', 'Misafir baglaniyor: ' + conn.peer);

      conn.on('data', (raw) => {
        const pkt = raw as NetPacket;
        if (!pkt || typeof pkt !== 'object') return;
        if (pkt.type === 'join') {
          if (this.clientConns.has(conn.peer)) return;
          if (this.roomPassword && (pkt.password || '').trim() !== this.roomPassword) {
            const now = Date.now();
            const rec = this.hostPassAttempts.get(conn.peer) || { count: 0, lockedUntil: 0 };
            if (rec.lockedUntil > now) {
              const remSec = Math.ceil((rec.lockedUntil - now) / 1000);
              const m = Math.floor(remSec / 60);
              const s = remSec % 60;
              conn.send({ type: 'auth_error', reason: `Çok fazla yanlış şifre denemesi! ${m} dk ${s} sn bekleyin.` } satisfies NetPacket);
            } else {
              if (rec.lockedUntil > 0 && rec.lockedUntil <= now) {
                rec.count = 0;
                rec.lockedUntil = 0;
              }
              rec.count += 1;
              if (rec.count >= 10) {
                rec.lockedUntil = now + 4 * 60 * 1000;
                this.hostPassAttempts.set(conn.peer, rec);
                conn.send({ type: 'auth_error', reason: '10 kez yanlış şifre girdiniz! 4 dakika beklemelisiniz.' } satisfies NetPacket);
              } else {
                this.hostPassAttempts.set(conn.peer, rec);
                conn.send({ type: 'auth_error', reason: `Oda şifresi yanlış! (Kalan hak: ${10 - rec.count}/10)` } satisfies NetPacket);
              }
            }
            setTimeout(() => {
              try { conn.close(); } catch {}
            }, 150);
            return;
          }
          this.hostPassAttempts.delete(conn.peer);
          const rawName = String(pkt.name || 'Misafir').trim().slice(0, 20) || 'Misafir';
          const cleanName = censorText(rawName);
          const cleanAvatar = String(pkt.avatar || ':)').trim().slice(0, 8) || ':)';
          const cleanCountry = String(pkt.country || 'TR').trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2) || 'TR';
          const result = this.cb.onPeerJoin(conn.peer, cleanName, cleanAvatar, cleanCountry, Boolean(pkt.isMobile));
          if (result !== true) {
            conn.send({ type: 'auth_error', reason: typeof result === 'string' ? result : 'Oda dolu!' } satisfies NetPacket);
            setTimeout(() => {
              try { conn.close(); } catch {}
            }, 150);
            return;
          }
          this.clientConns.set(conn.peer, conn);
          this.clientNames.set(conn.peer, cleanName);
          conn.send({ type: 'welcome', playerId: conn.peer, roomName: this.roomName } satisfies NetPacket);
          this.cb.onStatus('host', 'Oda acik (' + (this.clientConns.size + 1) + ' kisi)', this.roomCode);
        } else if (pkt.type === 'ping') {
          if (typeof pkt.lastRtt === 'number' && this.clientConns.has(conn.peer)) {
            this.cb.onPeerPing?.(conn.peer, Math.max(1, Math.min(999, Math.round(pkt.lastRtt))));
          }
          conn.send({ type: 'pong', ts: pkt.ts } satisfies NetPacket);
        } else {
          // Reject any gameplay/chat/admin packet before join handshake succeeds
          if (!this.clientConns.has(conn.peer)) return;
          if (pkt.type === 'input') {
            this.cb.onPeerInput(conn.peer, (Number(pkt.bits) || 0) & 31);
          } else if (pkt.type === 'team') {
            const now = performance.now();
            if (now - (this.clientLastTeam.get(conn.peer) || 0) < 400) return;
            this.clientLastTeam.set(conn.peer, now);
            if (pkt.team === 'red' || pkt.team === 'blue' || pkt.team === 'spec') {
              this.cb.onPeerTeam(conn.peer, pkt.team);
            }
          } else if (pkt.type === 'chat') {
            const now = performance.now();
            if (now - (this.clientLastChat.get(conn.peer) || 0) < 600) return;
            this.clientLastChat.set(conn.peer, now);
            const verifiedAuthor = this.clientNames.get(conn.peer) || 'Misafir';
            const cleanText = censorText(String(pkt.text || '').trim().slice(0, 180));
            if (!cleanText) return;
            const verifiedPkt: NetPacket = { type: 'chat', author: verifiedAuthor, text: cleanText };
            this.cb.onChat(verifiedAuthor, cleanText);
            this.broadcast(verifiedPkt, conn.peer);
          } else if (pkt.type === 'admin_cmd') {
            this.cb.onAdminCmd?.(conn.peer, pkt.cmd, pkt.targetId, pkt.value);
          }
        }
      });

      conn.on('close', () => {
        if (this.clientConns.has(conn.peer)) {
          this.clientConns.delete(conn.peer);
          this.clientNames.delete(conn.peer);
          this.clientLastChat.delete(conn.peer);
          this.clientLastTeam.delete(conn.peer);
          this.cb.onPeerLeave(conn.peer);
          this.cb.onStatus('host', 'Oda acik (' + (this.clientConns.size + 1) + ' kisi)', this.roomCode);
        }
      });

      conn.on('error', (err) => {
        this.cb.onLog('WARN', 'PeerConn', 'Misafir baglanti hatasi: ' + conn.peer, String(err));
      });
    });

    peer.on('error', (err) => {
      const msg = err && (err as Error).message ? (err as Error).message : String(err);
      this.cb.onLog('ERROR', 'PeerJS', 'Host hatasi: ' + msg);
      if (msg.includes('is taken')) {
        if (!options.preferredCode) {
          this.hostRoom({ roomName: this.roomName, password: this.roomPassword });
          return;
        }
        if (attempt < 5) {
          const savedName = this.roomName;
          const savedPass = this.roomPassword;
          setTimeout(() => {
            this.hostRoom({ roomName: savedName, password: savedPass, preferredCode: code, retryAttempt: attempt + 1 });
          }, 650);
          return;
        }
      }
      this.cb.onStatus('host', 'Hata: ' + msg, this.roomCode);
    });

    return code;
  }

  joinRoom(codeRaw: string, name: string, avatar: string, password?: string, country?: string, isMobile?: boolean): void {
    const code = extractRoomCode(codeRaw);
    if (!code) {
      this.cb.onAuthError('Gecersiz oda kodu.');
      return;
    }

    const lockKey = 'openhax_pass_lock_' + code;
    try {
      const rawLock = window.localStorage.getItem(lockKey);
      if (rawLock) {
        const parsed = JSON.parse(rawLock) as { count?: number; lockedUntil?: number };
        const now = Date.now();
        if (parsed.lockedUntil && parsed.lockedUntil > now) {
          const remSec = Math.ceil((parsed.lockedUntil - now) / 1000);
          const m = Math.floor(remSec / 60);
          const s = remSec % 60;
          this.cb.onAuthError(`Çok fazla yanlış şifre denemesi! ${m} dk ${s} sn bekleyin.`);
          return;
        }
      }
    } catch { /* ignore */ }

    this.disconnect();
    this.roomCode = code;
    this.role = 'guest';
    this.cb.onStatus('guest', 'Odaya baglaniliyor...', code);
    this.cb.onLog('INFO', 'PeerJS', 'Odaya baglaniliyor: ' + code);

    const peer = new Peer({ debug: 1 });
    this.peer = peer;

    peer.on('open', () => {
      if (this.peer !== peer) return;
      const conn = peer.connect(PEER_PREFIX + code, { reliable: false });
      this.hostConn = conn;
      let migrationTriggered = false;

      conn.on('open', () => {
        this.cb.onStatus('guest', 'Yetkilendiriliyor...', code);
        conn.send({ type: 'join', name, avatar, password, country, isMobile: Boolean(isMobile) } satisfies NetPacket);

        this.pingTimer = window.setInterval(() => {
          if (conn.open) {
            conn.send({ type: 'ping', ts: performance.now(), lastRtt: this.lastGuestRtt ?? undefined } satisfies NetPacket);
          }
        }, 2000);
      });

      conn.on('data', (raw) => {
        const pkt = raw as NetPacket;
        if (!pkt || typeof pkt !== 'object') return;
        if (pkt.type === 'welcome') {
          this.roomName = pkt.roomName || ('Oda ' + code);
          this.cb.onStatus('guest', 'Baglandi (P2P)', code);
          this.cb.onWelcome(pkt.playerId, this.roomName);
        } else if (pkt.type === 'auth_error') {
          migrationTriggered = true;
          this.cb.onLog('WARN', 'PeerJS', 'Odaya giris reddedildi: ' + pkt.reason);
          this.cb.onAuthError(pkt.reason);
          this.disconnect();
        } else if (pkt.type === 'migrate_host') {
          migrationTriggered = true;
          this.cb.onMigrateHost?.(pkt.newHostId, pkt.roomCode, pkt.roomName, pkt.password);
        } else if (pkt.type === 'stat_event') {
          this.cb.onStatEvent?.(pkt.event, pkt.mode, pkt.stadium);
        } else if (pkt.type === 'snap') {
          this.cb.onSnapshot(pkt.data);
        } else if (pkt.type === 'chat') {
          this.cb.onChat(pkt.author, pkt.text, pkt.team);
        } else if (pkt.type === 'pong') {
          const rtt = Math.max(1, Math.round(performance.now() - pkt.ts));
          this.lastGuestRtt = rtt;
          this.cb.onPingUpdate(rtt);
        }
      });

      conn.on('close', () => {
        if (this.role === 'guest') {
          this.cb.onLog('WARN', 'PeerJS', 'Oda baglantisi kapandi.');
          if (!migrationTriggered && this.cb.onHostLost) {
            const lostCode = this.roomCode;
            this.disconnect();
            this.cb.onHostLost(lostCode);
            return;
          }
          this.disconnect();
        }
      });

      conn.on('error', (err) => {
        this.cb.onLog('ERROR', 'PeerConn', 'Baglanti hatasi', String(err));
      });
    });

    peer.on('error', (err) => {
      const msg = err && (err as Error).message ? (err as Error).message : String(err);
      this.cb.onLog('ERROR', 'PeerJS', 'Katilim hatasi: ' + msg);
      this.cb.onAuthError(msg.includes('Could not connect to peer') ? 'Oda bulunamadi veya kapali!' : msg);
      this.disconnect();
    });
  }

  broadcastSnapshot(snap: MatchSnapshot): void {
    if (this.role !== 'host' || this.clientConns.size === 0) return;
    this.broadcast({ type: 'snap', data: snap });
  }

  broadcastHostMigration(newHostId: string): void {
    if (this.role !== 'host' || this.clientConns.size === 0) return;
    this.broadcast({
      type: 'migrate_host',
      newHostId,
      roomCode: this.roomCode,
      roomName: this.roomName,
      password: this.roomPassword
    });
  }

  broadcastChat(author: string, text: string, team?: Team): void {
    const pkt: NetPacket = { type: 'chat', author, text, team };
    if (this.role === 'host') {
      this.broadcast(pkt);
    } else if (this.role === 'guest' && this.hostConn?.open) {
      this.hostConn.send(pkt);
    }
  }

  sendInput(bits: number): void {
    if (this.role === 'guest' && this.hostConn?.open) {
      this.hostConn.send({ type: 'input', bits } satisfies NetPacket);
    }
  }

  sendTeamRequest(team: Team): void {
    if (this.role === 'guest' && this.hostConn?.open) {
      this.hostConn.send({ type: 'team', team } satisfies NetPacket);
    }
  }

  sendAdminCmd(cmd: string, targetId?: string, value?: string | number | boolean): void {
    if (this.role === 'guest' && this.hostConn?.open) {
      this.hostConn.send({ type: 'admin_cmd', cmd, targetId, value } satisfies NetPacket);
    }
  }

  sendStatEvent(peerId: string, event: 'goal' | 'save' | 'assist' | 'win' | 'match', mode?: string, stadium?: string): void {
    if (this.role !== 'host') return;
    const conn = this.clientConns.get(peerId);
    if (conn && conn.open) {
      conn.send({ type: 'stat_event', event, mode, stadium } satisfies NetPacket);
    }
  }

  kickPeer(peerId: string, reason: string): void {
    const conn = this.clientConns.get(peerId);
    if (conn) {
      try {
        conn.send({ type: 'auth_error', reason } satisfies NetPacket);
      } catch {}
      setTimeout(() => {
        try { conn.close(); } catch {}
      }, 120);
    }
  }

  private broadcast(pkt: NetPacket, excludePeerId?: string): void {
    this.clientConns.forEach((conn, id) => {
      if (id !== excludePeerId && conn.open) {
        conn.send(pkt);
      }
    });
  }

  disconnect(): void {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    this.clientConns.forEach((c) => {
      try { c.close(); } catch {}
    });
    this.clientConns.clear();
    this.clientNames.clear();
    this.clientLastChat.clear();
    this.clientLastTeam.clear();
    if (this.hostConn) {
      try { this.hostConn.close(); } catch {}
      this.hostConn = null;
    }
    if (this.peer) {
      try { this.peer.destroy(); } catch {}
      this.peer = null;
    }
    this.role = 'offline';
    this.roomCode = '';
    this.roomName = '';
    this.roomPassword = '';
    this.cb.onPingUpdate(null);
    this.cb.onStatus('offline', 'Lobi', '');
  }
}
