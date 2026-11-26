import 'flag-icons/css/flag-icons.min.css';
import './styles.css';
import {
  BallEntity,
  BotDifficulty,
  FieldPowerup,
  GameSettings,
  GoalParticle,
  MatchSnapshot,
  PerfTelemetry,
  PhysicsFeelMode,
  PhysicsProfile,
  PlayerEntity,
  PowerupMode,
  PowerupType,
  StadiumConfig,
  StadiumId,
  Team
} from './types';
import {
  ALL_COUNTRY_CODES,
  createFlagEl,
  DEFAULT_YOUTUBE_CLIENT_ID,
  getCountryLabel,
  LANG_TO_FLAG,
  loadSettings,
  PERFORMANCE_PRESETS,
  saveSettings,
  DEFAULT_SETTINGS
} from './game/settings';
import { censorText } from './game/profanity';
import { getStadium, parseHbsToStadium, setCustomHbsStadium, STADIUMS, stadiumToHbsJson } from './game/stadiums';
import { resetPositionsForKickoff, stepPhysicsTick } from './game/physics';
import { InputController } from './game/input';
import { CanvasRenderer } from './game/renderer';
import { GameLoop } from './game/loop';
import { AudioEngine } from './game/audio';
import { Lang, t } from './i18n';
import { extractRoomCode, PeerManager, PeerRole } from './net/PeerManager';
import { PublicRoomInfo, RoomDirectory } from './net/RoomDirectory';
import {
  createEmptyProfile,
  formatModeName,
  formatPlayTime,
  formatStadiumName,
  getTimeBadge,
  PlayerProfile,
  ProfileService,
  topRecordKey
} from './net/ProfileService';

type ViewScreen = 'auth' | 'lobby' | 'room';

interface DebugEntry {
  ts: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  source: string;
  message: string;
  detail?: string;
}

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) {
    throw new Error('DOM element missing: #' + id);
  }
  return node as T;
}

class OpenHaxApp {
  private settings: GameSettings = loadSettings();
  private stadium: StadiumConfig = getStadium(this.settings.stadium);

  private canvas = el<HTMLCanvasElement>('game-canvas');
  private renderer = new CanvasRenderer(this.canvas);
  private input = new InputController();
  private audio = new AudioEngine();
  private directory: RoomDirectory;
  private peerMgr: PeerManager;
  private loop: GameLoop;

  private activeScreen: ViewScreen = 'auth';
  private pendingInviteCode = '';
  private roomKind: 'public' | 'private' | 'offline' | 'local2p' = 'public';
  private currentRoomName = 'OpenHax Oda';
  private roomMaxPlayers = 8;
  private roomScoreLimit = 5;
  private roomTimeLimit = 180;
  private roomHasPassword = false;
  private customTuningActive = false;
  private matchEnded = false;
  private botCounter = 1;

  private players: PlayerEntity[] = [];
  private ball: BallEntity = { x: 430, y: 230, prevX: 430, prevY: 230, vx: 0, vy: 0, radius: 10 };
  private particles: GoalParticle[] = [];
  private botAvoidMemory = new Map<string, number>();

  private tick = 0;
  private matchSeconds = 0;
  private tickInSecond = 0;
  private scoreRed = 0;
  private scoreBlue = 0;
  private paused = false;
  private teamsLocked = false;
  private roomEntryLocked = false;
  private goalPending = false;
  private goalBannerTeam: Team | null = null;
  private goalResetTicks = 0;

  private myPlayerId = 'host';
  private lastSentInputBits = -1;
  private inputKeepaliveTicks = 0;
  private pingMs: number | null = null;
  private pendingNetEvents = 0;

  private roomsCache: PublicRoomInfo[] = [];
  private lastDirPingMs = 0;
  private refreshingRooms = false;
  private lobbyPollTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private heartbeatWorker: Worker | null = null;
  private pageExitHandler: (() => void) | null = null;
  private lastTouchId = '';
  private assistTouchId = '';
  private lastTouchTick = 0;
  private saveCooldownTick = 0;
  private enabledPowerups: PowerupType[] = [];
  private fieldPowerup: FieldPowerup | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private ytAccessToken: string | null = null;
  private renderTeamsModalFn: (() => void) | null = null;
  private nextPowerupSpawnTick = 0;
  private ballFireType: PowerupType | null = null;
  private ballFireUntilTick = 0;
  private profileSvc = new ProfileService();
  private myProfile: PlayerProfile | null = null;
  private currentRoomPassword = '';
  private pendingJoinCode = '';

  private debugLogs: DebugEntry[] = [];
  private debugErrors = 0;

  // Screen containers
  private viewAuth = el<HTMLElement>('view-auth');
  private viewLobby = el<HTMLElement>('view-lobby');
  private viewRoom = el<HTMLElement>('view-room');

  // Topbar refs
  private topbarBrand = el<HTMLDivElement>('topbar-brand');
  private topbarScore = el<HTMLDivElement>('topbar-score');
  private userPill = el<HTMLSpanElement>('user-pill');
  private btnChangeName = el<HTMLButtonElement>('btn-change-name');
  private btnLogoutHome = el<HTMLButtonElement>('btn-logout-home');
  private btnPause = el<HTMLButtonElement>('btn-pause');
  private btnReset = el<HTMLButtonElement>('btn-reset');
  private btnMute = el<HTMLButtonElement>('btn-mute');
  private btnSettings = el<HTMLButtonElement>('btn-settings');
  private btnDebug = el<HTMLButtonElement>('btn-debug');
  private btnLeaveRoom = el<HTMLButtonElement>('btn-leave-room');
  private scoreRedEl = el<HTMLSpanElement>('score-red');
  private scoreBlueEl = el<HTMLSpanElement>('score-blue');
  private timerEl = el<HTMLDivElement>('match-timer');

  // Auth refs
  private authNick = el<HTMLInputElement>('auth-nick');
  private authAvatar = el<HTMLInputElement>('auth-avatar');
  private authCountry = el<HTMLSelectElement>('auth-country');
  private syncLangSelectUi?: () => void;
  private syncCountrySelectUi?: () => void;
  private authPass = el<HTMLInputElement>('auth-pass');
  private authError = el<HTMLDivElement>('auth-error');
  private btnProfile = el<HTMLButtonElement>('btn-profile');
  private profileModal = el<HTMLDivElement>('profile-modal');
  private inviteNotice = el<HTMLDivElement>('invite-notice');
  private btnAuthEnter = el<HTMLButtonElement>('btn-auth-enter');

  // Lobby refs
  private dirModeBadge = el<HTMLSpanElement>('dir-mode-badge');
  private lobbySearch = el<HTMLInputElement>('lobby-search');
  private lobbySort = el<HTMLSelectElement>('lobby-sort');
  private lobbyFilterAccess = el<HTMLSelectElement>('lobby-filter-access');
  private lobbyFilterStadium = el<HTMLSelectElement>('lobby-filter-stadium');
  private lobbyRoomCount = el<HTMLSpanElement>('lobby-room-count');
  private joinCodeInput = el<HTMLInputElement>('join-code-input');
  private joinPassInput = el<HTMLInputElement>('join-pass-input');
  private lobbyError = el<HTMLDivElement>('lobby-error');
  private roomsTbody = el<HTMLTableSectionElement>('rooms-tbody');
  private roomsEmpty = el<HTMLDivElement>('rooms-empty');
  private createName = el<HTMLInputElement>('create-name');
  private createType = el<HTMLSelectElement>('create-type');
  private createPassWrap = el<HTMLLabelElement>('create-pass-wrap');
  private createPass = el<HTMLInputElement>('create-pass');
  private createStadium = el<HTMLSelectElement>('create-stadium');
  private createMax = el<HTMLSelectElement>('create-max');
  private createBotRow = el<HTMLDivElement>('create-bot-row');
  private createBots = el<HTMLSelectElement>('create-bots');
  private createBotDiff = el<HTMLSelectElement>('create-botdiff');
  private createPhysics = el<HTMLSelectElement>('create-physics');
  private createScoreLimit = el<HTMLSelectElement>('create-scorelimit');
  private createTimeLimit = el<HTMLSelectElement>('create-timelimit');

  // Room refs
  private roomTitleLabel = el<HTMLElement>('room-title-label');
  private roomCodeBadge = el<HTMLSpanElement>('room-code-badge');
  private netStatusEl = el<HTMLSpanElement>('net-status');
  private btnCopyLink = el<HTMLButtonElement>('btn-copy-link');
  private hostBotBar = el<HTMLElement>('host-bot-bar');
  private roomBotDiff = el<HTMLSelectElement>('room-botdiff');
  private roomStadium = el<HTMLSelectElement>('room-stadium');
  private roomPhysics = el<HTMLSelectElement>('room-physics');
  private roomPhysicsFeel = el<HTMLSelectElement>('room-physics-feel');
  private rosterStrip = el<HTMLDivElement>('roster-strip');
  private fpsHudEl = el<HTMLDivElement>('fps-hud');
  private goalBannerEl = el<HTMLDivElement>('goal-banner');
  private pauseBannerEl = el<HTMLDivElement>('pause-banner');
  private controlsHintEl = el<HTMLSpanElement>('controls-hint');
  private chatBox = el<HTMLDivElement>('chat-box');
  private chatInput = el<HTMLInputElement>('chat-input');

  // Modals
  private settingsModal = el<HTMLDivElement>('settings-modal');
  private debugModal = el<HTMLDivElement>('debug-modal');
  private debugLogBox = el<HTMLDivElement>('debug-log-box');
  private ctxMenu = el<HTMLDivElement>('player-ctx-menu');
  private physicsAdminNote = el<HTMLDivElement>('physics-admin-note');

  constructor() {
    this.installErrorTraps();

    this.directory = new RoomDirectory(() => {
      if (this.activeScreen === 'lobby') {
        void this.refreshRoomList();
      }
    });

    this.peerMgr = new PeerManager({
      onStatus: (role, stateText, roomCode) => this.onPeerStatus(role, stateText, roomCode),
      onLog: (level, source, msg, detail) => this.log(level, source, msg, detail),
      onPeerJoin: (peerId, name, avatar, country) => this.handlePeerJoin(peerId, name, avatar, country),
      onPeerLeave: (peerId) => this.handlePeerLeave(peerId),
      onPeerInput: (peerId, bits) => this.handlePeerInput(peerId, bits),
      onPeerTeam: (peerId, team) => this.handlePeerTeam(peerId, team),
      onChat: (author, text, team) => this.addChat(author, text, false, team),
      onWelcome: (playerId, roomName) => {
        this.myPlayerId = playerId;
        this.currentRoomName = roomName;
        this.roomTitleLabel.textContent = roomName;
        this.addChat('Sistem', 'Odaya baglandiniz.', true);
        this.switchScreen('room');
      },
      onAuthError: (reason) => {
        if (this.pendingJoinCode && reason.includes('bulunamadi')) {
          void this.directory.removeRoom(this.pendingJoinCode);
          this.pendingJoinCode = '';
          void this.refreshRoomList();
        }
        this.showLobbyError(reason);
        this.switchScreen('lobby');
      },
      onSnapshot: (snap) => this.applyGuestSnapshot(snap),
      onPingUpdate: (ping) => {
        this.pingMs = ping;
        const me = this.players.find((p) => p.id === this.myPlayerId);
        if (me && ping !== null) me.ping = ping;
      },
      onPeerPing: (peerId, ping) => {
        const p = this.players.find((pl) => pl.id === peerId);
        if (p) p.ping = ping;
      },
      onAdminCmd: (fromPeerId, cmd, targetId, value) => this.handleRemoteAdminCmd(fromPeerId, cmd, targetId, value),
      onMigrateHost: (newHostId, roomCode, roomName, password) =>
        this.handleMigrateHost(newHostId, roomCode, roomName, password),
      onHostLost: (roomCode) => this.handleHostLost(roomCode),
      onStatEvent: (event, mode, stadium) => this.applyLocalStatEvent(event, mode, stadium)
    });

    this.loop = new GameLoop(
      () => this.settings,
      () => this.onSimulationTick(),
      (alpha) => this.onRenderFrame(alpha),
      (telemetry) => this.updateHud(telemetry)
    );

    this.bindUI();
    this.syncSettingsToUI();
    this.audio.setConfig(this.settings.masterSound, this.settings.soundVolume);

    const params = new URLSearchParams(window.location.search);
    const inviteRoom = extractRoomCode(params.get('room') || '');
    if (inviteRoom) {
      this.pendingInviteCode = inviteRoom;
      this.inviteNotice.textContent = 'Odaya davet edildin: [' + inviteRoom + ']';
      this.inviteNotice.classList.remove('hidden');
      this.btnAuthEnter.textContent = 'Adını Oluştur ve Odaya Katıl';
    }

    this.authNick.value = this.settings.nickname || '';
    this.authAvatar.value = this.settings.avatar || ':)';
    this.populateCountrySelect(this.settings.lang || 'tr');
    this.authCountry.value = this.settings.country || 'TR';
    this.syncLangSelectUi = this.enhanceFlagSelect(
      el<HTMLSelectElement>('select-lang'),
      (val) => LANG_TO_FLAG[val as Lang] || 'TR',
      false,
      true
    );
    this.syncCountrySelectUi = this.enhanceFlagSelect(
      this.authCountry,
      (val) => val,
      true,
      true
    );
    this.myProfile = this.profileSvc.loadLocal();
    void this.profileSvc.fetchLeaderboard(30).then((all) => {
      const box = el<HTMLDivElement>('auth-top-stats');
      const goalsBody = el<HTMLTableSectionElement>('auth-top-goals');
      const timeBody = el<HTMLTableSectionElement>('auth-top-time');
      goalsBody.textContent = '';
      timeBody.textContent = '';
      if (!all.length) {
        box.textContent = '';
        return;
      }
      const byGoals = [...all].sort((a, b) => (b.goals || 0) - (a.goals || 0)).slice(0, 8);
      const byTime = [...all].sort((a, b) => (b.playSeconds || 0) - (a.playSeconds || 0)).slice(0, 8);
      byGoals.forEach((p, idx) => {
        const tr = document.createElement('tr');
        const bdg = getTimeBadge(p.playSeconds || 0);
        const tdRank = document.createElement('td');
        tdRank.textContent = String(idx + 1);
        const tdPlayer = document.createElement('td');
        tdPlayer.append(bdg.icon + ' ', createFlagEl(p.country), ' ' + p.username);
        const tdGoals = document.createElement('td');
        tdGoals.textContent = String(p.goals || 0);
        const tdSaves = document.createElement('td');
        tdSaves.textContent = String(p.saves || 0);
        tr.append(tdRank, tdPlayer, tdGoals, tdSaves);
        goalsBody.appendChild(tr);
      });
      byTime.forEach((p, idx) => {
        const tr = document.createElement('tr');
        const bdg = getTimeBadge(p.playSeconds || 0);
        const tdRank = document.createElement('td');
        tdRank.textContent = String(idx + 1);
        const tdPlayer = document.createElement('td');
        tdPlayer.append(createFlagEl(p.country), ' ' + p.username);
        const tdBdg = document.createElement('td');
        tdBdg.textContent = bdg.icon;
        const tdTime = document.createElement('td');
        tdTime.textContent = formatPlayTime(p.playSeconds || 0);
        tr.append(tdRank, tdPlayer, tdBdg, tdTime);
        timeBody.appendChild(tr);
      });
      const bestGoal = byGoals[0];
      const bestTime = byTime[0];
      box.textContent = '';
      box.append(
        '🏆 Gol Kralı: ',
        createFlagEl(bestGoal.country),
        ` ${bestGoal.username} (${bestGoal.goals || 0})  ·  ⏱️ En Çok Süre: `,
        createFlagEl(bestTime.country),
        ` ${bestTime.username} (${formatPlayTime(bestTime.playSeconds || 0)})`
      );
    });
    window.setInterval(() => {
      if (this.activeScreen === 'room') {
        this.saveMatchSnapshot();
        if (this.myProfile) {
          this.myProfile.playSeconds = (this.myProfile.playSeconds || 0) + 15;
          void this.profileSvc.saveProfile(this.myProfile);
        }
      }
    }, 15000);
    window.setInterval(() => {
      if (this.activeScreen === 'room') {
        this.saveMatchSnapshot();
        if (this.peerMgr.getRole() === 'host' && Math.hypot(this.ball.vx, this.ball.vy) > 65) {
          resetPositionsForKickoff(this.players, this.ball, this.stadium);
        }
      }
    }, 1000);

    // Anti-Cheat: Speedhack / clock-tamper detector (compares performance.now vs Date.now)
    let acLastPerf = performance.now();
    let acLastWall = Date.now();
    let acStrikes = 0;
    window.setInterval(() => {
      const nowPerf = performance.now();
      const nowWall = Date.now();
      const dPerf = nowPerf - acLastPerf;
      const dWall = nowWall - acLastWall;
      acLastPerf = nowPerf;
      acLastWall = nowWall;
      if (dWall >= 3000 && dWall <= 12000) {
        const ratio = dPerf / dWall;
        if (ratio > 1.35 || ratio < 0.65) {
          acStrikes++;
          if (acStrikes >= 2 && this.activeScreen === 'room') {
            this.paused = true;
            acStrikes = 0;
            if (this.peerMgr.getRole() === 'guest') {
              this.btnLeaveRoom.click();
            }
          }
        } else {
          acStrikes = 0;
        }
      }
    }, 4000);
    window.addEventListener('beforeunload', () => {
      if (this.activeScreen === 'room') this.saveMatchSnapshot();
    });

    // Fetch live physics config from Firebase RTDB (read-only from client)
    void fetch('https://haxturko53-default-rtdb.firebaseio.com/config/physics.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg) => {
        if (cfg && typeof cfg === 'object') {
          this.updateSettings(cfg as Partial<GameSettings>);
          this.syncSettingsToUI();
        }
      })
      .catch(() => { /* fallback to DEFAULT_SETTINGS */ });
    let restored = false;
    try {
      const savedScreen = window.sessionStorage.getItem('openhax_active_screen');
      const savedRoomRaw = window.sessionStorage.getItem('openhax_active_room');
      if (!this.pendingInviteCode && this.settings.nickname.trim()) {
        if (savedScreen === 'room' && savedRoomRaw) {
          const sr = JSON.parse(savedRoomRaw) as {
            role?: 'host' | 'guest';
            kind?: 'public' | 'private' | 'offline' | 'local2p';
            roomName?: string;
            stadium?: string;
            password?: string;
            code?: string;
          };
          if (sr.role === 'guest' && sr.code) {
            this.switchScreen('lobby');
            this.joinRemoteRoom(sr.code, sr.password || '');
            restored = true;
          } else if (sr.role === 'host' && sr.kind) {
            const fullSr = sr as typeof sr & {
              maxPlayers?: string;
              scoreLimit?: string;
              timeLimit?: string;
              botDiff?: string;
              physProfile?: string;
              physHz?: string;
              roomMaxFps?: string;
              powerupMode?: string;
            };
            if (fullSr.roomName) this.createName.value = fullSr.roomName;
            this.createType.value = fullSr.kind || 'public';
            if (fullSr.stadium) this.createStadium.value = fullSr.stadium;
            if (fullSr.maxPlayers) this.createMax.value = fullSr.maxPlayers;
            if (fullSr.scoreLimit) this.createScoreLimit.value = fullSr.scoreLimit;
            if (fullSr.timeLimit) this.createTimeLimit.value = fullSr.timeLimit;
            if (fullSr.botDiff) this.createBotDiff.value = fullSr.botDiff;
            if (fullSr.physProfile) this.createPhysics.value = fullSr.physProfile;
            if (fullSr.roomMaxFps) el<HTMLSelectElement>('create-roommaxfps').value = fullSr.roomMaxFps;
            if (fullSr.powerupMode) el<HTMLSelectElement>('create-powerup').value = fullSr.powerupMode;
            this.createPass.value = fullSr.password || '';
            this.createAndEnterRoom(true);
            restored = true;
          }
        } else if (savedScreen === 'lobby') {
          this.switchScreen('lobby');
          restored = true;
        }
      }
    } catch { /* ignore */ }
    if (!restored) {
      this.switchScreen('auth');
      this.authNick.focus();
    }

    this.log('INFO', 'Boot', 'OpenHax Modern hazir (OpenHax mekanikleri + 60 FPS sabit).');
  }

  private installErrorTraps(): void {
    window.addEventListener('error', (e) => {
      const msg = e.message || 'JS hatasi';
      const detail = (e.filename || '') + ':' + (e.lineno || 0) + ':' + (e.colno || 0) + (e.error?.stack ? '\n' + e.error.stack : '');
      this.log('ERROR', 'WindowError', msg, detail);
    });
    window.addEventListener('unhandledrejection', (e) => {
      const reason = e.reason;
      const msg = reason?.message ? reason.message : String(reason);
      this.log('ERROR', 'Promise', msg, reason?.stack);
    });
    window.addEventListener('beforeunload', () => {
      const code = this.peerMgr.getRoomCode();
      if (this.peerMgr.getRole() === 'host' && code) {
        void this.directory.removeRoom(code);
      }
      this.peerMgr.disconnect();
    });
  }

  private log(level: 'INFO' | 'WARN' | 'ERROR', source: string, message: string, detail?: string): void {
    const now = new Date();
    const ms = ('00' + now.getMilliseconds()).slice(-3);
    const ts = now.toTimeString().split(' ')[0] + '.' + ms;

    this.debugLogs.push({ ts, level, source, message, detail });
    if (this.debugLogs.length > 200) {
      this.debugLogs.shift();
    }
    if (level === 'ERROR') {
      this.debugErrors++;
      this.btnDebug.classList.add('danger');
      this.btnDebug.textContent = 'Debug (' + this.debugErrors + ')';
    }
    if (!this.debugModal.classList.contains('hidden')) {
      this.renderDebugLogs();
    }
  }

  private renderDebugLogs(): void {
    this.debugLogBox.innerHTML = '';
    for (let i = 0; i < this.debugLogs.length; i++) {
      const item = this.debugLogs[i];
      const div = document.createElement('div');
      div.className = 'debug-line ' + item.level;
      div.textContent =
        '[' + item.ts + '] [' + item.level + '] [' + item.source + '] ' + item.message + (item.detail ? '\n' + item.detail : '');
      this.debugLogBox.appendChild(div);
    }
    this.debugLogBox.scrollTop = this.debugLogBox.scrollHeight;
  }

  private switchScreen(screen: ViewScreen): void {
    this.activeScreen = screen;
    try {
      window.sessionStorage.setItem('openhax_active_screen', screen);
      if (screen !== 'room') {
        window.sessionStorage.removeItem('openhax_active_room');
        window.sessionStorage.removeItem('openhax_match_state');
      }
    } catch { /* ignore */ }

    this.viewAuth.classList.toggle('hidden', screen !== 'auth');
    this.viewLobby.classList.toggle('hidden', screen !== 'lobby');
    this.viewRoom.classList.toggle('hidden', screen !== 'room');

    const inRoom = screen === 'room';
    document.body.classList.toggle('in-room', inRoom);
    if (!inRoom) document.body.classList.remove('show-roombars');
    this.topbarBrand.classList.toggle('hidden', inRoom);
    this.topbarScore.classList.toggle('hidden', !inRoom);
    this.btnPause.classList.toggle('hidden', !inRoom);
    this.btnReset.classList.toggle('hidden', !inRoom);
    this.btnLeaveRoom.classList.toggle('hidden', !inRoom);
    el<HTMLButtonElement>('btn-topbar-menu').classList.toggle('hidden', !inRoom);
    el<HTMLButtonElement>('btn-toggle-roombars').classList.toggle('hidden', !inRoom);
    el<HTMLButtonElement>('btn-record').classList.toggle('hidden', !inRoom);
    el<HTMLButtonElement>('btn-room-yt-connect').classList.toggle('hidden', !inRoom);
    el<HTMLSelectElement>('room-yt-privacy').classList.toggle('hidden', !inRoom);
    if (!inRoom) {
      el<HTMLButtonElement>('btn-record-pause').classList.add('hidden');
    }

    const hasNick = Boolean(this.settings.nickname.trim());
    const badge = getTimeBadge(this.myProfile?.playSeconds || 0);
    this.userPill.classList.toggle('hidden', !hasNick || inRoom);
    this.userPill.textContent = badge.icon + ' ' + this.settings.nickname + ' (' + this.settings.avatar + ')';
    this.btnChangeName.classList.toggle('hidden', screen !== 'lobby');
    this.btnLogoutHome.classList.toggle('hidden', screen !== 'lobby');
    this.btnProfile.classList.toggle('hidden', screen === 'auth' || !hasNick);

    if (screen === 'lobby') {
      this.stopMatchLoop();
      this.startLobbyPolling();
      this.createName.value = (this.settings.nickname || 'Oyuncu') + "'nun Odasi";
      void this.refreshRoomList();
    } else if (screen === 'room') {
      this.stopLobbyPolling();
      this.input.attach();
      this.loop.start();
    } else {
      this.stopLobbyPolling();
      this.stopMatchLoop();
    }
  }

  private stopMatchLoop(): void {
    this.loop.stop();
    this.input.detach();
  }

  private startLobbyPolling(): void {
    this.stopLobbyPolling();
    const ms = Number(el<HTMLSelectElement>('lobby-refresh-rate').value);
    if (!ms || ms <= 0) return;
    this.lobbyPollTimer = window.setInterval(() => {
      void this.refreshRoomList();
    }, ms);
  }

  private stopLobbyPolling(): void {
    if (this.lobbyPollTimer !== null) {
      clearInterval(this.lobbyPollTimer);
      this.lobbyPollTimer = null;
    }
  }

  private bindUI(): void {
    const unlockAudio = () => this.audio.unlockAndPreload();
    window.addEventListener('pointerdown', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });

    window.addEventListener('keydown', (e) => {
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLSelectElement) {
        if (e.code === 'Escape') active.blur();
        return;
      }
      if (e.code === 'Escape') {
        this.settingsModal.classList.add('hidden');
        this.debugModal.classList.add('hidden');
      } else if (this.activeScreen === 'room') {
        if (e.code === 'KeyP' && this.isMeAdmin()) this.dispatchAdminAction('toggle_pause');
        else if (e.code === 'KeyR' && this.isMeAdmin()) this.dispatchAdminAction('reset_match');
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.settings.pauseOnBlur && this.peerMgr.getRole() === 'offline') {
        this.input.clear();
      }
    });

    // Screen 1: Auth
    this.viewAuth.querySelectorAll<HTMLButtonElement>('.av-pick').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.authAvatar.value = btn.dataset.av || ':)';
      });
    });
    this.authNick.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        if (this.authPass.value.trim()) void this.submitAuth();
        else void this.submitGuestAuth();
      }
    });
    this.authPass.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void this.submitAuth();
    });
    this.btnAuthEnter.addEventListener('click', () => void this.submitAuth());
    el<HTMLButtonElement>('btn-guest-enter').addEventListener('click', () => void this.submitGuestAuth());

    // Topbar & Profile modal
    this.btnChangeName.addEventListener('click', () => {
      this.switchScreen('auth');
      this.authNick.focus();
    });
    this.btnLogoutHome.addEventListener('click', () => {
      this.myProfile = null;
      this.profileSvc.logoutLocal();
      this.authPass.value = '';
      this.switchScreen('auth');
      this.authNick.focus();
    });
    this.btnProfile.addEventListener('click', () => {
      this.profileModal.classList.remove('hidden');
      void this.openProfileModal(this.myProfile || createEmptyProfile(this.settings.nickname || 'Oyuncu', this.settings.avatar, this.settings.country || 'TR'));
    });
    el<HTMLButtonElement>('btn-profile-close').addEventListener('click', () => {
      this.profileModal.classList.add('hidden');
    });
    const infoModal = el<HTMLDivElement>('info-modal');
    el<HTMLButtonElement>('btn-info-close').addEventListener('click', () => infoModal.classList.add('hidden'));
    infoModal.addEventListener('click', (e) => {
      if (e.target === infoModal) infoModal.classList.add('hidden');
    });
    document.querySelectorAll<HTMLButtonElement>('[data-nav]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const nav = btn.dataset.nav || 'play';
        document.querySelectorAll('.nav-link').forEach((n) => n.classList.toggle('active', n === btn));
        if (nav === 'play') {
          infoModal.classList.add('hidden');
          if (this.activeScreen === 'auth') this.authNick.focus();
          return;
        }
        const title = el<HTMLElement>('info-modal-title');
        const body = el<HTMLDivElement>('info-modal-body');
        if (nav === 'news') {
          title.textContent = '📰 Haberler & Güncellemeler';
          body.textContent =
            '• Özel Güç Modları: Şahin Vuruşu (1.95x), Alevli Şut (1.55x), Hızlı Koşu, Mıknatıs ve Dev Oyuncu güçleri eklendi — ESC menüsünden tek tek açıp kapatılabilir.\n' +
            '• RaidCall Tarzı Rozetler & Liderlik: Oyunda kalma süresine göre 🌱 -> 👑 rozetleri, gol/kurtarma/asist ve favori harita istatistikleri eklendi.\n' +
            '• Gelişmiş Fizik & Haritalar: 16 fizik profili (v1/v2/v3), 60–500 Hz fizik motoru ve 17 saha (.hbs dahil) eklendi.\n' +
            '• Oda Yönetimi: Fare ile sürükle-bırak takım değiştirme/at, oda giriş kilidi, otomatik kurucu devri ve ⏺ maç video kaydı aktif.';
        } else if (nav === 'about') {
          title.textContent = '⚽ OpenHaxModern Hakkında (Open Source)';
          body.textContent =
            'OpenHaxModern, tarayıcı üzerinde kurulum gerektirmeden oynanabilen açık kaynaklı (Open Source) modern 2D çok oyunculu futbol oyunudur.\n\n' +
            '• Altyapı: WebRTC (PeerJS) ile düşük gecikmeli P2P maçlar, Firebase Realtime Database ile canlı lobi, üye profilleri ve genel sohbet.\n' +
            '• Kontroller: W A S D veya Ok Tuşları ile hareket, X / Boşluk ile şut. ESC (Menü), P (Duraklat), R (Sıfırla).\n' +
            '• Sohbet Komutları: /color #ff00ff (renk), /avatar 🔥 (simge), /nick YeniAd (isim).';
        } else {
          title.textContent = '🌐 Topluluk & Açık Kaynak';
          body.textContent =
            'OpenHaxModern tamamen açık kaynaklıdır ve topluluk katkılarına açıktır.\n\n' +
            '• GitHub Kaynak Kodu: https://github.com/said19605353gemini-cell/open-hax-modern\n' +
            '• Canlı Oyun Adresi: https://said19605353gemini-cell.github.io/open-hax-modern/\n\n' +
            'Kurallar: Küfür ve hakaret tüm dillerde otomatik filtrelenir. Arkadaşlarınızı davet linkiyle odanıza çağırabilir, gol ve kurtarma sıralamasında yarışabilirsiniz.';
        }
        body.style.whiteSpace = 'pre-line';
        infoModal.classList.remove('hidden');
      });
    });
    this.profileModal.addEventListener('click', (e) => {
      if (e.target === this.profileModal) this.profileModal.classList.add('hidden');
    });
    const globalChatBox = el<HTMLDivElement>('global-chat-box');
    const globalChatIn = el<HTMLInputElement>('global-chat-input');
    const lobbyGlobalChatBox = el<HTMLDivElement>('lobby-global-chat-box');
    const lobbyGlobalChatIn = el<HTMLInputElement>('lobby-global-chat-input');
    const GLOBAL_CHAT_URL = 'https://haxturko-default-rtdb.europe-west1.firebasedatabase.app/global_chat.json';
    let lastGlobalSend = 0;

    const renderChatRows = (box: HTMLDivElement, rows: Array<{ author: string; text: string; country?: string; badge?: string; ts?: number }>) => {
      box.textContent = '';
      for (const m of rows) {
        if (!m || !m.text) continue;
        const div = document.createElement('div');
        div.className = 'chat-msg';
        const nickSpan = document.createElement('span');
        nickSpan.className = 'nick';
        if (m.badge) nickSpan.append(m.badge + ' ');
        nickSpan.append(createFlagEl(m.country), ` ${censorText(String(m.author || 'Oyuncu').slice(0, 20))}: `);
        const msgSpan = document.createElement('span');
        msgSpan.textContent = censorText(String(m.text).slice(0, 160));
        div.appendChild(nickSpan);
        div.appendChild(msgSpan);
        box.appendChild(div);
      }
      box.scrollTop = box.scrollHeight;
    };

    const loadGlobalChat = async () => {
      try {
        const res = await fetch(`${GLOBAL_CHAT_URL}?orderBy="$key"&limitToLast=35`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as Record<string, { author: string; text: string; country?: string; badge?: string; ts?: number }> | null;
        if (!data || typeof data !== 'object') {
          globalChatBox.textContent = '';
          lobbyGlobalChatBox.textContent = '';
          return;
        }
        const rows = Object.values(data).sort((a, b) => (a.ts || 0) - (b.ts || 0));
        renderChatRows(globalChatBox, rows);
        renderChatRows(lobbyGlobalChatBox, rows);
      } catch { /* ignore */ }
    };

    const sendGlobalChat = async (sourceInput: HTMLInputElement) => {
      const now = performance.now();
      if (now - lastGlobalSend < 1400) return;
      const raw = sourceInput.value.trim();
      if (!raw) return;
      lastGlobalSend = now;
      sourceInput.value = '';
      const author = censorText((this.authNick.value.trim() || this.settings.nickname || 'Misafir').slice(0, 20));
      const text = censorText(raw.slice(0, 160));
      const bdg = getTimeBadge(this.myProfile?.playSeconds || 0).icon;
      const country = this.authCountry.value || this.settings.country || 'TR';
      try {
        await fetch(GLOBAL_CHAT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ author, text, country, badge: bdg, ts: Date.now() })
        });
        void loadGlobalChat();
      } catch { /* ignore */ }
    };

    el<HTMLButtonElement>('btn-global-chat-send').addEventListener('click', () => void sendGlobalChat(globalChatIn));
    globalChatIn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void sendGlobalChat(globalChatIn);
    });
    el<HTMLButtonElement>('btn-lobby-global-chat-send').addEventListener('click', () => void sendGlobalChat(lobbyGlobalChatIn));
    lobbyGlobalChatIn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void sendGlobalChat(lobbyGlobalChatIn);
    });
    void loadGlobalChat();
    window.setInterval(() => {
      if (this.activeScreen === 'auth' || this.activeScreen === 'lobby') void loadGlobalChat();
    }, 4500);

    el<HTMLButtonElement>('btn-profile-mine').addEventListener('click', () => {
      if (this.myProfile) void this.openProfileModal(this.myProfile);
    });
    el<HTMLButtonElement>('btn-profile-search').addEventListener('click', () => {
      const q = el<HTMLInputElement>('profile-search-input').value.trim();
      if (!q) return;
      void this.profileSvc.fetchProfileByUsername(q).then((found) => {
        if (found) {
          void this.openProfileModal(found);
        } else {
          const box = el<HTMLDivElement>('profile-card-box');
          box.textContent = `"${q}" adlı üye profili bulunamadı.`;
        }
      });
    });
    this.btnPause.addEventListener('click', () => {
      if (this.isMeAdmin()) this.dispatchAdminAction('toggle_pause');
    });
    el<HTMLButtonElement>('btn-pause-resume').addEventListener('click', () => {
      if (this.isMeAdmin()) this.dispatchAdminAction('toggle_pause');
    });
    el<HTMLButtonElement>('btn-pause-reset').addEventListener('click', () => {
      if (this.isMeAdmin()) this.dispatchAdminAction('reset_match');
    });
    el<HTMLButtonElement>('btn-pause-settings').addEventListener('click', () => {
      this.settingsModal.classList.remove('hidden');
    });
    el<HTMLButtonElement>('btn-pause-leave').addEventListener('click', () => {
      this.leaveCurrentRoom();
    });
    this.btnReset.addEventListener('click', () => {
      if (this.isMeAdmin()) this.dispatchAdminAction('reset_match');
    });
    this.btnMute.addEventListener('click', () => {
      this.updateSettings({ masterSound: !this.settings.masterSound });
      el<HTMLInputElement>('set-sound').checked = this.settings.masterSound;
    });
    el<HTMLSelectElement>('select-lang').addEventListener('change', (e) => {
      this.updateSettings({ lang: (e.target as HTMLSelectElement).value as Lang });
      this.applyLanguage();
    });
    this.btnLeaveRoom.addEventListener('click', () => this.leaveCurrentRoom());

    this.btnSettings.addEventListener('click', () => {
      this.settingsModal.classList.toggle('hidden');
    });
    el<HTMLButtonElement>('btn-settings-close').addEventListener('click', () => {
      this.settingsModal.classList.add('hidden');
    });
    this.settingsModal.addEventListener('click', (e) => {
      if (e.target === this.settingsModal) this.settingsModal.classList.add('hidden');
    });

    const teamsModal = el<HTMLDivElement>('teams-modal');
    const renderTeamsModal = () => {
      const lists: Record<Team, HTMLDivElement> = {
        red: el<HTMLDivElement>('teams-list-red'),
        spec: el<HTMLDivElement>('teams-list-spec'),
        blue: el<HTMLDivElement>('teams-list-blue')
      };
      lists.red.innerHTML = '';
      lists.spec.innerHTML = '';
      lists.blue.innerHTML = '';
      const isAdm = this.isMeAdmin();
      el<HTMLDivElement>('teams-admin-actions').classList.toggle('hidden', !isAdm);
      this.roomStadium.disabled = !isAdm;
      this.roomPhysics.disabled = !isAdm;
      this.roomPhysicsFeel.disabled = !isAdm;
      el<HTMLSelectElement>('room-physicshz').disabled = !isAdm;
      el<HTMLButtonElement>('btn-room-reset-physics').disabled = !isAdm;
      el<HTMLButtonElement>('btn-room-upload-hbs').classList.toggle('hidden', !isAdm);
      const canEditPhysics = this.activeScreen === 'room' && isAdm;
      const physicsPane = document.querySelector<HTMLElement>('[data-pane="physics"]');
      if (physicsPane) {
        physicsPane.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>('input, select, button').forEach((ctrl) => {
          ctrl.disabled = !canEditPhysics;
        });
      }
      el<HTMLSelectElement>('teams-botdiff').value = this.settings.botDifficulty;
      el<HTMLButtonElement>('btn-teams-lock').textContent = this.teamsLocked ? '🔒 Takım Kilitli' : '🔓 Takım Kilitle';
      el<HTMLButtonElement>('btn-teams-roomlock').textContent = this.roomEntryLocked ? '🔒 Oda Giriş: Kilitli' : '🚪 Oda Giriş: Açık';
      for (const p of this.players) {
        const row = document.createElement('div');
        row.className = 'team-player-row';
        if (isAdm) {
          row.draggable = true;
          row.addEventListener('dragstart', (ev) => {
            if (ev.dataTransfer) {
              ev.dataTransfer.effectAllowed = 'move';
              ev.dataTransfer.setData('text/plain', p.id);
            }
          });
        }
        const label = document.createElement('span');
        if (p.isBot) {
          label.textContent = '🤖 ' + (p.isAdmin ? '★ ' : '') + p.avatar + ' ' + p.name;
        } else {
          label.append(createFlagEl(p.country), ' ' + (p.isAdmin ? '★ ' : '') + p.avatar + ' ' + p.name);
        }
        const pingSpan = document.createElement('span');
        pingSpan.style.opacity = '0.75';
        pingSpan.style.fontSize = '12px';
        pingSpan.textContent = p.isBot
          ? 'BOT'
          : typeof p.ping === 'number'
            ? p.ping + ' ms'
            : p.id === 'host'
              ? '0 ms'
              : '—';
        row.appendChild(label);
        row.appendChild(pingSpan);
        row.addEventListener('click', (ev) => {
          ev.stopPropagation();
          if (isAdm) this.openPlayerContextMenu(ev.clientX, ev.clientY, p);
        });
        lists[p.team].appendChild(row);
      }
    };
    this.renderTeamsModalFn = renderTeamsModal;
    const bindDropZone = (node: HTMLElement | null, onDropPlayer: (playerId: string) => void) => {
      if (!node) return;
      node.addEventListener('dragover', (e) => {
        if (!this.isMeAdmin()) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        node.classList.add('drop-hover');
      });
      node.addEventListener('dragleave', () => node.classList.remove('drop-hover'));
      node.addEventListener('drop', (e) => {
        node.classList.remove('drop-hover');
        if (!this.isMeAdmin()) return;
        e.preventDefault();
        const pid = e.dataTransfer?.getData('text/plain');
        if (pid) onDropPlayer(pid);
      });
    };
    bindDropZone(el<HTMLDivElement>('teams-list-red').parentElement, (pid) => this.dispatchAdminAction('set_team', pid, 'red'));
    bindDropZone(el<HTMLDivElement>('teams-list-spec').parentElement, (pid) => this.dispatchAdminAction('set_team', pid, 'spec'));
    bindDropZone(el<HTMLDivElement>('teams-list-blue').parentElement, (pid) => this.dispatchAdminAction('set_team', pid, 'blue'));
    bindDropZone(el<HTMLDivElement>('teams-kick-dropzone'), (pid) => {
      if (pid !== 'host') this.dispatchAdminAction('kick', pid);
    });
    el<HTMLButtonElement>('btn-teams-modal').addEventListener('click', () => {
      renderTeamsModal();
      teamsModal.classList.toggle('hidden');
    });
    el<HTMLButtonElement>('btn-topbar-menu').addEventListener('click', () => {
      renderTeamsModal();
      teamsModal.classList.toggle('hidden');
    });
    el<HTMLButtonElement>('btn-toggle-roombars').addEventListener('click', () => {
      document.body.classList.toggle('show-roombars');
    });
    el<HTMLButtonElement>('btn-teams-copy').addEventListener('click', () => {
      this.btnCopyLink.click();
    });
    el<HTMLButtonElement>('btn-teams-leave').addEventListener('click', () => {
      teamsModal.classList.add('hidden');
      this.leaveCurrentRoom();
    });
    el<HTMLButtonElement>('btn-teams-close').addEventListener('click', () => teamsModal.classList.add('hidden'));
    el<HTMLButtonElement>('btn-teams-start').addEventListener('click', () => {
      teamsModal.classList.add('hidden');
      if (this.paused && this.isMeAdmin()) this.dispatchAdminAction('toggle_pause');
    });
    teamsModal.addEventListener('click', (e) => {
      if (e.target === teamsModal) teamsModal.classList.add('hidden');
    });
    const joinCol = (team: Team) => {
      if (this.teamsLocked && !this.isMeAdmin()) return;
      (this.viewRoom.querySelector(`[data-team="${team}"]`) as HTMLButtonElement | null)?.click();
      setTimeout(renderTeamsModal, 60);
    };
    el<HTMLButtonElement>('btn-join-red').addEventListener('click', () => joinCol('red'));
    el<HTMLButtonElement>('btn-join-spec').addEventListener('click', () => joinCol('spec'));
    el<HTMLButtonElement>('btn-join-blue').addEventListener('click', () => joinCol('blue'));
    el<HTMLButtonElement>('btn-teams-lock').addEventListener('click', () => {
      if (!this.isMeAdmin()) return;
      this.dispatchAdminAction('toggle_lock');
      setTimeout(renderTeamsModal, 60);
    });
    el<HTMLButtonElement>('btn-teams-roomlock').addEventListener('click', () => {
      if (!this.isMeAdmin()) return;
      this.dispatchAdminAction('toggle_roomlock');
      setTimeout(renderTeamsModal, 60);
    });
    el<HTMLButtonElement>('btn-teams-reset').addEventListener('click', () => {
      if (!this.isMeAdmin()) return;
      for (const p of this.players) this.dispatchAdminAction('set_team', p.id, 'spec');
      setTimeout(renderTeamsModal, 60);
    });
    el<HTMLButtonElement>('btn-teams-auto').addEventListener('click', () => {
      if (!this.isMeAdmin()) return;
      this.players.forEach((p, idx) => {
        this.dispatchAdminAction('set_team', p.id, idx % 2 === 0 ? 'red' : 'blue');
      });
      setTimeout(renderTeamsModal, 60);
    });
    el<HTMLButtonElement>('btn-teams-rand').addEventListener('click', () => {
      if (!this.isMeAdmin()) return;
      const shuffled = [...this.players].sort(() => Math.random() - 0.5);
      shuffled.forEach((p, idx) => {
        this.dispatchAdminAction('set_team', p.id, idx % 2 === 0 ? 'red' : 'blue');
      });
      setTimeout(renderTeamsModal, 60);
    });
    el<HTMLButtonElement>('btn-teams-addredbot').addEventListener('click', () => {
      el<HTMLButtonElement>('btn-add-red-bot').click();
      setTimeout(renderTeamsModal, 60);
    });
    el<HTMLButtonElement>('btn-teams-addbluebot').addEventListener('click', () => {
      el<HTMLButtonElement>('btn-add-blue-bot').click();
      setTimeout(renderTeamsModal, 60);
    });
    el<HTMLButtonElement>('btn-teams-remredbot').addEventListener('click', () => {
      if (this.isMeAdmin()) this.dispatchAdminAction('remove_team_bot', undefined, 'red');
    });
    el<HTMLButtonElement>('btn-teams-rembluebot').addEventListener('click', () => {
      if (this.isMeAdmin()) this.dispatchAdminAction('remove_team_bot', undefined, 'blue');
    });
    el<HTMLSelectElement>('teams-botdiff').addEventListener('change', (e) => {
      if (this.isMeAdmin()) this.dispatchAdminAction('set_botdiff', undefined, (e.target as HTMLSelectElement).value);
    });
    const pwModal = el<HTMLDivElement>('powerups-modal');
    el<HTMLButtonElement>('btn-powerups-modal').addEventListener('click', () => {
      pwModal.querySelectorAll<HTMLInputElement>('.pw-chk').forEach((chk) => {
        chk.checked = this.enabledPowerups.includes(chk.value as PowerupType);
      });
      pwModal.classList.remove('hidden');
    });
    el<HTMLButtonElement>('btn-powerups-close').addEventListener('click', () => pwModal.classList.add('hidden'));
    pwModal.addEventListener('click', (e) => {
      if (e.target === pwModal) pwModal.classList.add('hidden');
    });
    pwModal.querySelectorAll<HTMLInputElement>('.pw-chk').forEach((chk) => {
      chk.addEventListener('change', () => {
        if (!this.isMeAdmin()) return;
        const selected: PowerupType[] = [];
        pwModal.querySelectorAll<HTMLInputElement>('.pw-chk').forEach((c) => {
          if (c.checked) selected.push(c.value as PowerupType);
        });
        this.dispatchAdminAction('set_powerups', undefined, selected.join(','));
      });
    });
    el<HTMLButtonElement>('btn-record').addEventListener('click', () => this.toggleMatchRecording());
    el<HTMLButtonElement>('btn-record-pause').addEventListener('click', () => this.togglePauseRecording());
    el<HTMLButtonElement>('btn-room-yt-connect').addEventListener('click', () => void this.connectYouTube());
    el<HTMLSelectElement>('room-yt-privacy').addEventListener('change', (e) => {
      const pv = (e.target as HTMLSelectElement).value as GameSettings['youtubePrivacy'];
      el<HTMLSelectElement>('set-yt-privacy').value = pv || 'unlisted';
      this.updateSettings({ youtubePrivacy: pv });
    });
    el<HTMLSelectElement>('lobby-refresh-rate').addEventListener('change', () => {
      if (this.activeScreen === 'lobby') this.startLobbyPolling();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.activeScreen === 'room') {
        if (!this.settingsModal.classList.contains('hidden')) {
          this.settingsModal.classList.add('hidden');
          return;
        }
        if (!this.debugModal.classList.contains('hidden')) {
          this.debugModal.classList.add('hidden');
          return;
        }
        renderTeamsModal();
        teamsModal.classList.toggle('hidden');
      }
    });
    document.addEventListener('click', () => {
      this.ctxMenu.classList.add('hidden');
    });

    const isLocalDev = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (!isLocalDev) {
      window.addEventListener('keydown', (e) => {
        const key = e.key.toUpperCase();
        if (
          e.key === 'F12' ||
          ((e.ctrlKey || e.metaKey) && e.shiftKey && (key === 'I' || key === 'J' || key === 'C')) ||
          ((e.ctrlKey || e.metaKey) && key === 'U')
        ) {
          e.preventDefault();
          e.stopPropagation();
        }
      }, true);
      document.addEventListener('contextmenu', (e) => {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
          e.preventDefault();
        }
      });
    }

    this.btnDebug.addEventListener('click', () => {
      this.debugModal.classList.toggle('hidden');
      if (!this.debugModal.classList.contains('hidden')) {
        this.renderDebugLogs();
      }
    });
    window.addEventListener('openhax:debug', (ev) => {
      const detail = (ev as CustomEvent<string>).detail;
      if (detail) {
        this.debugLogs.push({
          ts: new Date().toLocaleTimeString(),
          level: detail.includes('[ERR]') ? 'ERROR' : 'INFO',
          source: 'NET',
          message: detail
        });
        if (this.debugLogs.length > 150) this.debugLogs.shift();
        if (!this.debugModal.classList.contains('hidden')) this.renderDebugLogs();
      }
    });
    el<HTMLButtonElement>('btn-debug-close').addEventListener('click', () => {
      this.debugModal.classList.add('hidden');
    });
    el<HTMLButtonElement>('btn-debug-clear').addEventListener('click', () => {
      this.debugLogs = [];
      this.debugErrors = 0;
      this.btnDebug.classList.remove('danger');
      this.btnDebug.textContent = 'Debug';
      this.renderDebugLogs();
    });
    el<HTMLButtonElement>('btn-debug-copy').addEventListener('click', () => {
      const text = this.debugLogs
        .map((l) => '[' + l.ts + '] [' + l.level + '] [' + l.source + '] ' + l.message + (l.detail ? '\n' + l.detail : ''))
        .join('\n');
      navigator.clipboard?.writeText(text).catch(() => {});
    });

    // Screen 2: Lobby
    el<HTMLButtonElement>('btn-refresh-rooms').addEventListener('click', () => {
      void this.refreshRoomList();
    });
    this.lobbySearch.addEventListener('input', () => this.renderRoomsTable());
    for (const st of Object.values(STADIUMS)) {
      const opt = document.createElement('option');
      opt.value = st.id;
      opt.textContent = 'Saha: ' + st.label.split(' ')[0];
      this.lobbyFilterStadium.appendChild(opt);
    }
    this.lobbySort.addEventListener('change', () => this.renderRoomsTable());
    this.lobbyFilterAccess.addEventListener('change', () => this.renderRoomsTable());
    this.lobbyFilterStadium.addEventListener('change', () => this.renderRoomsTable());
    el<HTMLButtonElement>('btn-join-code').addEventListener('click', () => {
      const code = extractRoomCode(this.joinCodeInput.value);
      if (!code) {
        this.showLobbyError('Lutfen gecerli bir oda kodu veya davet linki girin.');
        return;
      }
      this.joinRemoteRoom(code, this.joinPassInput.value);
    });

    this.createType.addEventListener('change', () => {
      const t = this.createType.value;
      const isOnline = t === 'public' || t === 'private';
      this.createPassWrap.classList.toggle('hidden', !isOnline);
      this.createBotRow.classList.toggle('hidden', t === 'local2p');
    });

    el<HTMLButtonElement>('btn-create-room').addEventListener('click', () => {
      const kind = this.createType.value;
      if (kind === 'public' || kind === 'private') {
        void this.directory.canCreateRoom(this.settings.nickname).then((chk) => {
          if (!chk.ok) {
            this.showLobbyError(`Aynı IP / kişi üzerinden en fazla ${chk.limit} aktif oda açabilirsiniz (Mevcut: ${chk.count}/${chk.limit}).`);
            return;
          }
          this.createAndEnterRoom();
        });
      } else {
        this.createAndEnterRoom();
      }
    });

    // .hbs / .hbys custom map upload & download
    const hbsInput = el<HTMLInputElement>('hbs-file-input');
    const triggerHbsUpload = () => {
      hbsInput.value = '';
      hbsInput.click();
    };
    const downloadHbsMap = (stId: StadiumId) => {
      const st = this.activeScreen === 'room' ? this.stadium : getStadium(stId);
      const json = stadiumToHbsJson(st);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeName = (st.label || st.id).replace(/[^a-zA-Z0-9_-]+/g, '_').toLowerCase();
      a.download = `${safeName}.hbs`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    };

    el<HTMLButtonElement>('btn-create-upload-hbs').addEventListener('click', triggerHbsUpload);
    el<HTMLButtonElement>('btn-room-upload-hbs').addEventListener('click', () => {
      if (!this.isMeAdmin()) return;
      triggerHbsUpload();
    });
    el<HTMLButtonElement>('btn-create-download-hbs').addEventListener('click', () => {
      downloadHbsMap(this.createStadium.value as StadiumId);
    });
    el<HTMLButtonElement>('btn-room-download-hbs').addEventListener('click', () => {
      downloadHbsMap(this.roomStadium.value as StadiumId);
    });

    hbsInput.addEventListener('change', () => {
      const file = hbsInput.files?.[0];
      if (!file) return;
      void file.text().then((txt) => {
        try {
          const parsed = parseHbsToStadium(txt, file.name);
          setCustomHbsStadium(parsed);
          const optCreate = this.createStadium.querySelector<HTMLOptionElement>('option[value="custom_hbs"]');
          const optRoom = this.roomStadium.querySelector<HTMLOptionElement>('option[value="custom_hbs"]');
          if (optCreate) optCreate.textContent = 'Özel: ' + parsed.label;
          if (optRoom) optRoom.textContent = 'Özel: ' + parsed.label;
          this.createStadium.value = 'custom_hbs';
          this.roomStadium.value = 'custom_hbs';
          if (this.activeScreen === 'room' && this.isMeAdmin()) {
            this.updateSettings({ stadium: 'custom_hbs' });
            resetPositionsForKickoff(this.players, this.ball, this.stadium);
          } else {
            this.lobbyError.classList.add('hidden');
          }
        } catch {
          window.alert('Geçersiz .hbs / .hbys harita dosyası! Lütfen geçerli bir HaxBall stadium JSON dosyası seçin.');
        }
      });
    });

    // Screen 3: Room controls
    this.btnCopyLink.addEventListener('click', () => {
      const code = this.peerMgr.getRoomCode();
      if (!code) return;
      const url = window.location.origin + window.location.pathname + '?room=' + code;
      navigator.clipboard?.writeText(url).then(() => {
        const old = this.btnCopyLink.textContent;
        this.btnCopyLink.textContent = 'Kopyalandı!';
        setTimeout(() => {
          this.btnCopyLink.textContent = old;
        }, 1400);
      }).catch(() => {});
    });

    this.viewRoom.querySelectorAll<HTMLButtonElement>('[data-team]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (this.teamsLocked && !this.isMeAdmin()) return;
        const team = btn.dataset.team as Team;
        if (this.peerMgr.getRole() === 'guest') {
          this.peerMgr.sendTeamRequest(team);
        } else {
          this.handlePeerTeam(this.myPlayerId, team);
        }
      });
    });

    el<HTMLButtonElement>('btn-add-red-bot').addEventListener('click', () => {
      if (this.isMeAdmin()) this.dispatchAdminAction('add_bot', undefined, 'red');
    });
    el<HTMLButtonElement>('btn-add-blue-bot').addEventListener('click', () => {
      if (this.isMeAdmin()) this.dispatchAdminAction('add_bot', undefined, 'blue');
    });
    el<HTMLButtonElement>('btn-remove-bot').addEventListener('click', () => {
      if (this.isMeAdmin()) this.dispatchAdminAction('remove_bot');
    });
    el<HTMLButtonElement>('btn-clear-bots').addEventListener('click', () => {
      if (this.isMeAdmin()) this.dispatchAdminAction('clear_bots');
    });

    this.roomBotDiff.addEventListener('change', () => {
      if (!this.isMeAdmin()) return;
      const diff = this.roomBotDiff.value as BotDifficulty;
      if (this.peerMgr.getRole() === 'guest') {
        this.dispatchAdminAction('set_botdiff', undefined, diff);
        return;
      }
      this.updateSettings({ botDifficulty: diff });
      el<HTMLSelectElement>('set-botdiff').value = this.settings.botDifficulty;
    });

    this.roomStadium.addEventListener('change', () => {
      if (!this.isMeAdmin()) return;
      const stId = this.roomStadium.value as StadiumId;
      if (this.peerMgr.getRole() === 'guest') {
        this.dispatchAdminAction('set_stadium', undefined, stId);
        return;
      }
      this.updateSettings({ stadium: stId });
      resetPositionsForKickoff(this.players, this.ball, this.stadium);
    });

    this.roomPhysics.addEventListener('change', () => {
      if (!this.isMeAdmin()) return;
      const pf = this.roomPhysics.value as PhysicsProfile;
      if (this.peerMgr.getRole() === 'guest') {
        this.dispatchAdminAction('set_physics', undefined, pf);
        return;
      }
      this.customTuningActive = false;
      this.updateSettings({ physicsProfile: pf });
      el<HTMLSelectElement>('set-physics').value = pf;
    });

    this.roomPhysicsFeel.addEventListener('change', () => {
      if (!this.isMeAdmin()) return;
      const mode = this.roomPhysicsFeel.value as PhysicsFeelMode;
      if (this.peerMgr.getRole() === 'guest') {
        this.dispatchAdminAction('set_physics_feel', undefined, mode);
        return;
      }
      this.updateSettings({ physicsFeel: mode });
      (document.getElementById('set-physics-feel') as HTMLSelectElement | null || document.createElement('select')).value = mode;
    });

    el<HTMLSelectElement>('room-physicshz').addEventListener('change', () => {
      if (!this.isMeAdmin()) return;
      const hz = Number(el<HTMLSelectElement>('room-physicshz').value) || 60;
      if (this.peerMgr.getRole() === 'guest') {
        this.dispatchAdminAction('set_physicshz', undefined, hz);
        return;
      }
      this.updateSettings({ physicsHz: hz });
      el<HTMLSelectElement>('set-physicshz').value = String(hz);
    });

    el<HTMLButtonElement>('btn-room-reset-physics').addEventListener('click', () => {
      el<HTMLButtonElement>('btn-reset-physics-defaults').click();
    });

    el<HTMLButtonElement>('btn-chat-send').addEventListener('click', () => this.sendChat());
    this.chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.sendChat();
        this.chatInput.blur();
      }
    });
    let macroWarnedAt = 0;
    this.chatInput.addEventListener('input', () => {
      if (!this.paused) return;
      const val = this.chatInput.value;
      if (/^(.)\1+$/.test(val) && val.length >= 2 && Date.now() - macroWarnedAt > 2500) {
        macroWarnedAt = Date.now();
        const me = this.players.find((p) => p.id === this.myPlayerId)?.name || this.settings.nickname || 'Oyuncu';
        const msg = `⚠️ ${me}: ${val.length} kez '${val[0]}' bastı (Çift tuş / Makro şüphesi)!`;
        this.addChat('Sistem', msg, true);
        this.peerMgr.broadcastChat('Sistem', msg, undefined);
      }
    });

    // Settings modal
    this.settingsModal.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.preset || '';
        const preset = PERFORMANCE_PRESETS[key];
        if (preset) {
          if (!this.isMeAdmin()) {
            const {
              physicsProfile: _pf,
              ballControl: _bc,
              ballDamping: _bd,
              kickPower: _kp,
              playerSpeed: _ps,
              wallBounce: _wb,
              ...clientSafePreset
            } = preset;
            if (Object.keys(clientSafePreset).length > 0) {
              this.updateSettings(clientSafePreset);
              this.syncSettingsToUI();
            }
            return;
          }
          this.updateSettings(preset);
          this.syncSettingsToUI();
        }
      });
    });
    el<HTMLButtonElement>('btn-settings-reset').addEventListener('click', () => {
      const nick = this.settings.nickname;
      const av = this.settings.avatar;
      window.localStorage.removeItem('openhax_modern_settings_v2');
      this.settings = loadSettings();
      this.settings.nickname = nick;
      this.settings.avatar = av;
      saveSettings(this.settings);
      this.syncSettingsToUI();
      this.applySettingsEffects();
    });

    const bindSelect = (id: string, onChange: (val: string) => void) => {
      el<HTMLSelectElement>(id).addEventListener('change', (e) => {
        onChange((e.target as HTMLSelectElement).value);
      });
    };
    const bindCheck = (id: string, onChange: (val: boolean) => void) => {
      el<HTMLInputElement>(id).addEventListener('change', (e) => {
        onChange((e.target as HTMLInputElement).checked);
      });
    };

    bindSelect('set-fps', (v) => {
      const fps = Math.max(0, Math.min(1000, Number(v) || 0));
      el<HTMLInputElement>('set-fps-custom').value = String(fps);
      this.updateSettings({ fpsLimit: fps });
    });
    el<HTMLInputElement>('set-fps-custom').addEventListener('change', (e) => {
      const raw = Number((e.target as HTMLInputElement).value);
      const fps = !Number.isFinite(raw) || raw <= 0 ? 0 : Math.max(15, Math.min(1000, Math.round(raw)));
      (e.target as HTMLInputElement).value = String(fps);
      const sel = el<HTMLSelectElement>('set-fps');
      if (Array.from(sel.options).some((o) => Number(o.value) === fps)) {
        sel.value = String(fps);
      }
      this.updateSettings({ fpsLimit: fps });
    });
    bindSelect('set-viewport', (v) => this.updateSettings({ viewportMode: v as GameSettings['viewportMode'] }));
    bindSelect('set-grass', (v) => this.updateSettings({ grassDetail: v as GameSettings['grassDetail'] }));
    bindSelect('set-gfx-quality', (v) => {
      if (v === 'ultra_perf') {
        this.updateSettings(PERFORMANCE_PRESETS.ultraPerformance);
      } else if (v === 'low') {
        this.updateSettings({ grassDetail: 'flat', resolution: 1, antialias: false, shadows: false, particles: false, kickFlash: false, perfBoost: true, showGoalNets: false });
      } else if (v === 'medium') {
        this.updateSettings({ grassDetail: 'hd_stadium', resolution: 1, antialias: true, shadows: true, particles: false, kickFlash: true, perfBoost: false, showGoalNets: true });
      } else if (v === 'high') {
        this.updateSettings({ grassDetail: 'hd_stadium', resolution: 1.5, antialias: true, shadows: true, particles: true, kickFlash: true, perfBoost: false, showGoalNets: true });
      } else if (v === 'ultra') {
        this.updateSettings(PERFORMANCE_PRESETS.ultraHD);
      }
      this.syncSettingsToUI();
    });
    bindCheck('set-perfboost', (v) => this.updateSettings({ perfBoost: v }));
    bindCheck('set-goalnets', (v) => this.updateSettings({ showGoalNets: v }));
    bindSelect('set-goalnetstyle', (v) => {
      this.updateSettings({ goalNetStyle: v as GameSettings['goalNetStyle'], showGoalNets: true });
      el<HTMLInputElement>('set-goalnets').checked = true;
    });
    bindSelect('set-goalpoststyle', (v) => this.updateSettings({ goalPostStyle: v as GameSettings['goalPostStyle'] }));
    bindCheck('set-crowd', (v) => this.updateSettings({ crowdEnabled: v }));
    bindSelect('set-ballstyle', (v) => this.updateSettings({ ballStyle: v as GameSettings['ballStyle'] }));
    bindCheck('set-balltrail', (v) => this.updateSettings({ ballTrail: v }));
    bindSelect('set-res', (v) => this.updateSettings({ resolution: Number(v) }));
    bindCheck('set-lowlatency', (v) => this.updateSettings({ lowLatencyCanvas: v }));
    bindCheck('set-customcolors', (v) => this.updateSettings({ customTeamColors: v }));
    bindCheck('set-chatind', (v) => this.updateSettings({ showChatIndicators: v }));
    bindCheck('set-avatars', (v) => this.updateSettings({ showPlayerAvatars: v }));
    el<HTMLInputElement>('set-chatopacity').addEventListener('input', (e) => {
      const val = Number((e.target as HTMLInputElement).value);
      el<HTMLSpanElement>('lbl-chatopacity').textContent = val.toFixed(1);
      this.updateSettings({ chatOpacity: val });
    });
    el<HTMLInputElement>('set-chatheight').addEventListener('input', (e) => {
      const val = Number((e.target as HTMLInputElement).value);
      el<HTMLSpanElement>('lbl-chatheight').textContent = String(val);
      this.updateSettings({ chatFocusHeight: val });
    });
    bindSelect('set-chatwidth', (v) => this.updateSettings({ chatWidth: v as GameSettings['chatWidth'] }));

    this.settingsModal.querySelectorAll<HTMLButtonElement>('.hax-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        const key = tab.dataset.tab || 'video';
        this.settingsModal.querySelectorAll('.hax-tab').forEach((btn) => btn.classList.toggle('active', btn === tab));
        this.settingsModal.querySelectorAll<HTMLElement>('.hax-tab-pane').forEach((pane) => {
          pane.classList.toggle('hidden', pane.dataset.pane !== key);
        });
      });
    });
    bindCheck('set-aa', (v) => this.updateSettings({ antialias: v }));
    bindCheck('set-shadows', (v) => this.updateSettings({ shadows: v }));
    bindCheck('set-particles', (v) => this.updateSettings({ particles: v }));
    bindCheck('set-kickflash', (v) => this.updateSettings({ kickFlash: v }));
    bindCheck('set-hud', (v) => this.updateSettings({ showHud: v }));
    bindCheck('set-blurpause', (v) => this.updateSettings({ pauseOnBlur: v }));
    bindSelect('set-physics', (v) => this.updateSettings({ physicsProfile: v as GameSettings['physicsProfile'] }));
    bindSelect('set-physicshz', (v) => {
      if (!this.isMeAdmin()) return;
      const hz = Math.max(60, Math.min(500, Number(v) || 60));
      if (this.peerMgr.getRole() === 'guest') {
        this.dispatchAdminAction('set_physicshz', undefined, hz);
        return;
      }
      this.updateSettings({ physicsHz: hz });
    });
    const applyRoomMaxFps = (rawVal: number) => {
      if (!this.isMeAdmin()) return;
      const mf = !Number.isFinite(rawVal) || rawVal <= 0 ? 0 : Math.max(15, Math.min(1000, Math.round(rawVal)));
      el<HTMLSelectElement>('set-roommaxfps').value = String(mf);
      el<HTMLSelectElement>('room-fps-select').value = String(mf);
      el<HTMLInputElement>('set-roommaxfps-custom').value = String(mf);
      el<HTMLInputElement>('room-fps-custom').value = String(mf);
      if (this.peerMgr.getRole() === 'guest') {
        this.dispatchAdminAction('set_roommaxfps', undefined, mf);
        return;
      }
      this.updateSettings({ roomMaxFps: mf });
    };
    bindSelect('set-roommaxfps', (v) => applyRoomMaxFps(Number(v)));
    el<HTMLSelectElement>('room-fps-select').addEventListener('change', (e) => {
      applyRoomMaxFps(Number((e.target as HTMLSelectElement).value));
    });
    el<HTMLInputElement>('set-roommaxfps-custom').addEventListener('change', (e) => {
      applyRoomMaxFps(Number((e.target as HTMLInputElement).value));
    });
    el<HTMLInputElement>('room-fps-custom').addEventListener('change', (e) => {
      applyRoomMaxFps(Number((e.target as HTMLInputElement).value));
    });
    el<HTMLSelectElement>('create-roommaxfps').addEventListener('change', (e) => {
      el<HTMLInputElement>('create-roommaxfps-custom').value = (e.target as HTMLSelectElement).value;
    });
    el<HTMLInputElement>('create-roommaxfps-custom').addEventListener('change', (e) => {
      const raw = Number((e.target as HTMLInputElement).value);
      const mf = !Number.isFinite(raw) || raw <= 0 ? 0 : Math.max(15, Math.min(1000, Math.round(raw)));
      (e.target as HTMLInputElement).value = String(mf);
      const sel = el<HTMLSelectElement>('create-roommaxfps');
      if (Array.from(sel.options).some((o) => Number(o.value) === mf)) sel.value = String(mf);
    });
    const botOrder: BotDifficulty[] = ['very_easy', 'easy', 'medium', 'hard', 'pro'];
    const stepBotDiff = (delta: number) => {
      if (!this.isMeAdmin()) return;
      const idx = botOrder.indexOf(this.settings.botDifficulty);
      const next = botOrder[Math.max(0, Math.min(botOrder.length - 1, (idx === -1 ? 2 : idx) + delta))];
      this.roomBotDiff.value = next;
      if (this.peerMgr.getRole() === 'guest') {
        this.dispatchAdminAction('set_botdiff', next);
        return;
      }
      this.updateSettings({ botDifficulty: next });
      el<HTMLSelectElement>('set-botdiff').value = next;
    };
    el<HTMLButtonElement>('btn-botdiff-down').addEventListener('click', () => stepBotDiff(-1));
    el<HTMLButtonElement>('btn-botdiff-up').addEventListener('click', () => stepBotDiff(1));
    bindSelect('set-botdiff', (v) => {
      this.updateSettings({ botDifficulty: v as BotDifficulty });
      this.roomBotDiff.value = v;
    });
    el<HTMLInputElement>('set-yt-clientid').addEventListener('change', (e) => {
      this.updateSettings({ youtubeClientId: (e.target as HTMLInputElement).value.trim() });
    });
    bindSelect('set-yt-privacy', (v) => {
      el<HTMLSelectElement>('room-yt-privacy').value = v;
      this.updateSettings({ youtubePrivacy: v as GameSettings['youtubePrivacy'] });
    });
    el<HTMLButtonElement>('btn-yt-connect').addEventListener('click', () => {
      void this.connectYouTube();
    });
    bindCheck('set-sound', (v) => this.updateSettings({ masterSound: v }));
    el<HTMLInputElement>('set-volume').addEventListener('input', (e) => {
      const vol = Number((e.target as HTMLInputElement).value);
      el<HTMLSpanElement>('vol-label').textContent = Math.round(vol * 100) + '%';
      this.updateSettings({ soundVolume: vol });
    });
    el<HTMLInputElement>('set-goalgif').addEventListener('change', (e) => {
      this.updateSettings({ goalGifUrl: (e.target as HTMLInputElement).value.trim() });
    });
    el<HTMLInputElement>('set-concedegif').addEventListener('change', (e) => {
      this.updateSettings({ concedeGifUrl: (e.target as HTMLInputElement).value.trim() });
    });
    el<HTMLInputElement>('set-chantgif').addEventListener('change', (e) => {
      this.updateSettings({ chantGifUrl: (e.target as HTMLInputElement).value.trim() });
    });
    el<HTMLButtonElement>('btn-trigger-chant').addEventListener('click', () => {
      const url = el<HTMLInputElement>('set-chantgif').value.trim() || this.settings.chantGifUrl || '';
      if (!url) return;
      this.updateSettings({ chantGifUrl: url });
      (this as unknown as { chantBannerUntil: number }).chantBannerUntil = performance.now() + 3500;
    });

    const bindRange = (id: string, lblId: string, fmt: (v: number) => string, apply: (v: number) => void) => {
      el<HTMLInputElement>(id).addEventListener('input', (e) => {
        this.customTuningActive = true;
        const val = Number((e.target as HTMLInputElement).value);
        el<HTMLSpanElement>(lblId).textContent = fmt(val);
        apply(val);
      });
    };
    bindRange('set-ballctrl', 'lbl-ballctrl', (v) => v + '%', (v) => this.updateSettings({ ballControl: v }));
    bindRange('set-balldamp', 'lbl-balldamp', (v) => v.toFixed(3), (v) => this.updateSettings({ ballDamping: v }));
    bindRange('set-kickpwr', 'lbl-kickpwr', (v) => v.toFixed(1), (v) => this.updateSettings({ kickPower: v }));
    bindRange('set-pspd', 'lbl-pspd', (v) => v.toFixed(1), (v) => this.updateSettings({ playerSpeed: v }));
    bindRange('set-wallb', 'lbl-wallb', (v) => v.toFixed(2), (v) => this.updateSettings({ wallBounce: v }));
    (document.getElementById('set-physics-feel') as HTMLSelectElement | null || document.createElement('select')).addEventListener('change', (e) => {
      const mode = (e.target as HTMLSelectElement).value as PhysicsFeelMode;
      this.updateSettings({ physicsFeel: mode });
    });
    bindRange('set-startaccel', 'lbl-startaccel', (v) => v.toFixed(1) + 'x', (v) => {
      this.updateSettings({ physicsFeel: 'custom', startAccelMul: v });
      (document.getElementById('set-physics-feel') as HTMLSelectElement | null || document.createElement('select')).value = 'custom';
    });
    bindRange('set-stopfriction', 'lbl-stopfriction', (v) => v.toFixed(2), (v) => {
      this.updateSettings({ physicsFeel: 'custom', stopFriction: v });
      (document.getElementById('set-physics-feel') as HTMLSelectElement | null || document.createElement('select')).value = 'custom';
    });
    bindRange('set-surfacefriction', 'lbl-surfacefriction', (v) => v.toFixed(3), (v) => {
      this.updateSettings({ physicsFeel: 'custom', surfaceFriction: v });
      (document.getElementById('set-physics-feel') as HTMLSelectElement | null || document.createElement('select')).value = 'custom';
    });
    el<HTMLButtonElement>('btn-reset-physics-defaults').addEventListener('click', () => {
      if (this.activeScreen !== 'room' || !this.isMeAdmin()) return;
      this.customTuningActive = false;
      this.updateSettings({
        physicsProfile: DEFAULT_SETTINGS.physicsProfile,
        physicsFeel: DEFAULT_SETTINGS.physicsFeel,
        physicsHz: DEFAULT_SETTINGS.physicsHz,
        roomMaxFps: DEFAULT_SETTINGS.roomMaxFps,
        ballControl: DEFAULT_SETTINGS.ballControl,
        ballDamping: DEFAULT_SETTINGS.ballDamping,
        kickPower: DEFAULT_SETTINGS.kickPower,
        playerSpeed: DEFAULT_SETTINGS.playerSpeed,
        wallBounce: DEFAULT_SETTINGS.wallBounce,
        startAccelMul: DEFAULT_SETTINGS.startAccelMul,
        stopFriction: DEFAULT_SETTINGS.stopFriction,
        surfaceFriction: DEFAULT_SETTINGS.surfaceFriction
      });
      this.syncSettingsToUI();
      el<HTMLSelectElement>('set-physics').value = DEFAULT_SETTINGS.physicsProfile;
      (document.getElementById('set-physics-feel') as HTMLSelectElement | null || document.createElement('select')).value = DEFAULT_SETTINGS.physicsFeel || 'standard';
      this.roomPhysics.value = DEFAULT_SETTINGS.physicsProfile;
      this.roomPhysicsFeel.value = DEFAULT_SETTINGS.physicsFeel || 'standard';
      if (this.activeScreen === 'room' && this.peerMgr.getRole() === 'guest') {
        this.dispatchAdminAction('set_physics', undefined, DEFAULT_SETTINGS.physicsProfile);
        this.dispatchAdminAction('set_physics_feel', undefined, DEFAULT_SETTINGS.physicsFeel || 'standard');
        this.dispatchAdminAction('set_physicshz', undefined, DEFAULT_SETTINGS.physicsHz || 60);
      }
    });
  }

  private async submitGuestAuth(): Promise<void> {
    const fallbackGuest = this.settings.nickname || ('Misafir' + Math.floor(100 + Math.random() * 900));
    const rawNick = this.authNick.value.trim() || fallbackGuest;
    const avatar = this.authAvatar.value.trim() || ':)';
    const country = this.authCountry.value || this.settings.country || 'TR';
    let guestNick = censorText(rawNick.slice(0, 20));
    if (guestNick.length < 2) guestNick = 'Misafir100';

    const btnGuest = el<HTMLButtonElement>('btn-guest-enter');
    btnGuest.disabled = true;
    const isLocked = await this.profileSvc.checkMemberLocked(guestNick);
    btnGuest.disabled = false;
    if (isLocked) {
      this.authError.textContent =
        'Bu kullanıcı adı şifre ile kayıtlı bir üyeye ait! Şifresini girerek giriş yapın veya başka bir ad seçin.';
      this.authError.classList.remove('hidden');
      return;
    }

    this.profileSvc.setGuestMode(true);
    const local = this.profileSvc.loadLocal();
    const guestProfile =
      local && !local.passHash && local.username === guestNick
        ? { ...local, avatar, country }
        : createEmptyProfile(guestNick, avatar, country, '');
    await this.profileSvc.saveProfile(guestProfile);
    this.myProfile = guestProfile;

    this.authError.classList.add('hidden');
    this.authNick.value = guestNick;
    this.updateSettings({ nickname: guestNick, avatar, country });

    if (this.pendingInviteCode) {
      const code = this.pendingInviteCode;
      this.pendingInviteCode = '';
      this.switchScreen('lobby');
      this.joinRemoteRoom(code, '');
      return;
    }
    this.switchScreen('lobby');
  }

  private async submitAuth(): Promise<void> {
    const rawNick = this.authNick.value.trim();
    const avatar = this.authAvatar.value.trim() || ':)';
    const country = this.authCountry.value || this.settings.country || 'TR';
    const pass = this.authPass.value.trim();

    if (rawNick.length < 2) {
      this.authError.textContent = 'Kullanıcı adı en az 2 karakter olmalıdır.';
      this.authError.classList.remove('hidden');
      return;
    }
    if (pass.length < 3) {
      this.authError.textContent = 'Üyelik girişi/kaydı için en az 3 karakter şifre girin veya "Misafir Olarak Devam Et" butonunu kullanın.';
      this.authError.classList.remove('hidden');
      return;
    }

    const cleanNick = censorText(rawNick);
    this.profileSvc.setGuestMode(false);
    this.btnAuthEnter.disabled = true;
    const res = await this.profileSvc.loginOrRegister(cleanNick, avatar, country, pass);
    this.btnAuthEnter.disabled = false;

    if (!res.ok) {
      this.authError.textContent = res.error;
      this.authError.classList.remove('hidden');
      return;
    }

    this.myProfile = res.profile;
    this.authError.classList.add('hidden');
    this.updateSettings({
      nickname: res.profile.username,
      avatar,
      country
    });

    if (this.pendingInviteCode) {
      const code = this.pendingInviteCode;
      this.pendingInviteCode = '';
      this.switchScreen('lobby');
      this.joinRemoteRoom(code, '');
      return;
    }

    this.switchScreen('lobby');
  }

  private async openProfileModal(profile: PlayerProfile): Promise<void> {
    const box = el<HTMLDivElement>('profile-card-box');
    box.textContent = '';

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';

    const title = document.createElement('strong');
    title.style.fontSize = '16px';
    const timeBadge = getTimeBadge(profile.playSeconds || 0);
    title.append(timeBadge.icon + ' ', createFlagEl(profile.country), ` ${profile.avatar} ${profile.username}`);
    const badge = document.createElement('span');
    badge.style.fontSize = '11px';
    badge.style.color = profile.passHash ? '#7ee787' : '#cbd5e1';
    badge.textContent = `${timeBadge.name} · ${profile.passHash ? '🔒 Kayıtlı Üye' : '👤 Misafir'}`;
    header.appendChild(title);
    header.appendChild(badge);
    box.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'profile-stats-grid';
    const addTile = (val: string, lbl: string) => {
      const tile = document.createElement('div');
      tile.className = 'profile-stat-tile';
      const s = document.createElement('strong');
      s.textContent = val;
      const l = document.createElement('span');
      l.textContent = lbl;
      tile.appendChild(s);
      tile.appendChild(l);
      grid.appendChild(tile);
    };
    const topMode = topRecordKey(profile.modes);
    const topSt = topRecordKey(profile.stadiums);
    addTile(String(profile.goals || 0), 'Gol');
    addTile(String(profile.saves || 0), 'Kurtarma');
    addTile(String(profile.assists || 0), 'Asist');
    addTile(String(profile.wins || 0), 'Galibiyet');
    addTile(formatPlayTime(profile.playSeconds || 0), 'Oyunda Süre');
    addTile(topSt ? formatStadiumName(topSt.key).split(' ')[0] : '—', 'Favori Harita');
    box.appendChild(grid);

    const favs = document.createElement('div');
    favs.style.marginTop = '10px';
    favs.style.fontSize = '12px';
    favs.style.color = '#e2e8f0';
    favs.textContent =
      'En Çok Oynadığı Mod: ' +
      (topMode ? `${formatModeName(topMode.key)} (${topMode.count})` : '—') +
      '  ·  En Çok Oynadığı Saha: ' +
      (topSt ? `${formatStadiumName(topSt.key)} (${topSt.count})` : '—');
    box.appendChild(favs);

    const tbody = el<HTMLTableSectionElement>('leaderboard-tbody');
    tbody.textContent = '';
    const leaders = await this.profileSvc.fetchLeaderboard(12);
    leaders.forEach((p, idx) => {
      const tr = document.createElement('tr');
      const favM = topRecordKey(p.modes);
      const bdg = getTimeBadge(p.playSeconds || 0);
      const cells: Array<string | HTMLElement[]> = [
        String(idx + 1),
        bdg.icon,
        [createFlagEl(p.country), document.createTextNode(' ' + p.username) as unknown as HTMLElement],
        String(p.goals || 0),
        String(p.saves || 0),
        formatPlayTime(p.playSeconds || 0),
        favM ? formatModeName(favM.key) : '—'
      ];
      cells.forEach((c) => {
        const td = document.createElement('td');
        if (Array.isArray(c)) {
          td.append(...c);
        } else {
          td.textContent = c;
        }
        tr.appendChild(td);
      });
      tr.style.cursor = 'pointer';
      tr.addEventListener('click', () => {
        void this.openProfileModal(p);
      });
      tbody.appendChild(tr);
    });
  }

  private dispatchStatToPlayer(
    playerId: string,
    event: 'goal' | 'save' | 'assist' | 'win' | 'match',
    mode?: string,
    stadium?: string
  ): void {
    const p = this.players.find((pl) => pl.id === playerId);
    if (!p || p.isBot) return;
    if (p.id === this.myPlayerId) {
      this.applyLocalStatEvent(event, mode, stadium);
    } else {
      this.peerMgr.sendStatEvent(p.id, event, mode, stadium);
    }
  }

  private applyLocalStatEvent(
    event: 'goal' | 'save' | 'assist' | 'win' | 'match',
    mode?: string,
    stadium?: string
  ): void {
    if (!this.myProfile) {
      if (!this.settings.nickname) return;
      this.myProfile = createEmptyProfile(this.settings.nickname, this.settings.avatar, this.settings.country || 'TR');
    }
    const pr = this.myProfile;
    if (event === 'goal') pr.goals = (pr.goals || 0) + 1;
    else if (event === 'save') pr.saves = (pr.saves || 0) + 1;
    else if (event === 'assist') pr.assists = (pr.assists || 0) + 1;
    else if (event === 'win') pr.wins = (pr.wins || 0) + 1;
    else if (event === 'match') {
      pr.matches = (pr.matches || 0) + 1;
      if (mode) pr.modes[mode] = (pr.modes[mode] || 0) + 1;
      if (stadium) pr.stadiums[stadium] = (pr.stadiums[stadium] || 0) + 1;
    }
    void this.profileSvc.saveProfile(pr);
  }

  private showLobbyError(msg: string): void {
    this.lobbyError.textContent = msg;
    this.lobbyError.classList.remove('hidden');
    window.setTimeout(() => {
      this.lobbyError.classList.add('hidden');
    }, 5000);
  }

  private async refreshRoomList(): Promise<void> {
    if (this.refreshingRooms) return;
    this.refreshingRooms = true;
    try {
      const { rooms, mode, latencyMs } = await this.directory.listRooms();
      this.roomsCache = rooms;
      this.lastDirPingMs = latencyMs;
      this.dirModeBadge.textContent =
        mode === 'server'
          ? 'Canlı Sunucu Listesi (Hosting)'
          : 'Yerel Liste / Davet Linki Modu';
      this.renderRoomsTable();
    } finally {
      this.refreshingRooms = false;
    }
  }

  private estimateRoomPing(r: PublicRoomInfo): number {
    if (r.source === 'local') return 1;
    const roomCountry = (r.country || 'TR').toUpperCase();
    const myCountry = (this.settings.country || 'TR').toUpperCase();
    return roomCountry === myCountry
      ? Math.min(85, Math.max(8, this.lastDirPingMs || 18))
      : Math.max(35, (this.lastDirPingMs || 45) + 30);
  }

  private renderRoomsTable(): void {
    const q = this.lobbySearch.value.trim().toLowerCase();
    const accessFilter = this.lobbyFilterAccess.value;
    const stadiumFilter = this.lobbyFilterStadium.value;
    const sortMode = this.lobbySort.value;

    const filtered = this.roomsCache.filter((r) => {
      if (accessFilter === 'open' && r.hasPassword) return false;
      if (accessFilter === 'locked' && !r.hasPassword) return false;
      if (accessFilter === 'has_players' && r.players <= 0) return false;
      if (accessFilter === 'not_full' && r.players >= r.maxPlayers) return false;
      if (stadiumFilter !== 'all' && r.stadium !== stadiumFilter) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.hostName.toLowerCase().includes(q) ||
        r.code.toLowerCase().includes(q)
      );
    });

    filtered.sort((a, b) => {
      switch (sortMode) {
        case 'most_players':
          return (b.players - a.players) || (b.bots - a.bots) || a.name.localeCompare(b.name);
        case 'least_players':
          return (a.players - b.players) || (a.bots - b.bots) || a.name.localeCompare(b.name);
        case 'available_slots':
          return ((b.maxPlayers - b.players) - (a.maxPlayers - a.players)) || (b.players - a.players);
        case 'best_ping':
          return (this.estimateRoomPing(a) - this.estimateRoomPing(b)) || (b.players - a.players);
        case 'newest':
          return (b.updatedAt || 0) - (a.updatedAt || 0);
        case 'name_az':
          return a.name.localeCompare(b.name);
        default:
          return 0;
      }
    });

    this.lobbyRoomCount.textContent = filtered.length + ' / ' + this.roomsCache.length + ' oda';
    this.roomsTbody.innerHTML = '';
    this.roomsEmpty.classList.toggle('hidden', filtered.length > 0);

    for (let i = 0; i < filtered.length; i++) {
      const r = filtered[i];
      const tr = document.createElement('tr');
      const stadiumLabel = getStadium(r.stadium).label.split(' ')[0];

      const tdFlag = document.createElement('td');
      const roomCountry = (r.country || 'TR').toUpperCase();
      tdFlag.append(createFlagEl(roomCountry), ' ' + roomCountry);

      const tdName = document.createElement('td');
      tdName.textContent = censorText(r.name);

      const tdHost = document.createElement('td');
      tdHost.textContent = censorText(r.hostName);

      const tdSt = document.createElement('td');
      tdSt.textContent = stadiumLabel;

      const tdPl = document.createElement('td');
      tdPl.textContent = r.players + '/' + r.maxPlayers + (r.bots > 0 ? ' (+' + r.bots + ' Bot)' : '');

      const tdPing = document.createElement('td');
      if (r.source === 'local') {
        tdPing.textContent = '🟢 1 ms';
      } else {
        const pingVal = this.estimateRoomPing(r);
        const dot = pingVal < 60 ? '🟢' : pingVal < 130 ? '🟡' : '🔴';
        tdPing.textContent = dot + ' ~' + pingVal + ' ms';
      }

      const tdLock = document.createElement('td');
      tdLock.textContent = r.hasPassword ? 'Şifreli' : 'Açık';

      const tdAct = document.createElement('td');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn primary';
      btn.textContent = 'Katıl';
      btn.addEventListener('click', () => {
        let pass = this.joinPassInput.value;
        if (r.hasPassword && !pass) {
          pass = window.prompt('Oda şifresini girin:') || '';
        }
        this.joinRemoteRoom(r.code, pass);
      });
      tdAct.appendChild(btn);

      tr.appendChild(tdFlag);
      tr.appendChild(tdName);
      tr.appendChild(tdHost);
      tr.appendChild(tdSt);
      tr.appendChild(tdPl);
      tr.appendChild(tdPing);
      tr.appendChild(tdLock);
      tr.appendChild(tdAct);
      this.roomsTbody.appendChild(tr);
    }
  }

  private saveMatchSnapshot(): void {
    if (this.activeScreen !== 'room' || this.peerMgr.getRole() === 'guest') return;
    try {
      const state = {
        scoreRed: this.scoreRed,
        scoreBlue: this.scoreBlue,
        matchSeconds: this.matchSeconds,
        tick: this.tick,
        tickInSecond: this.tickInSecond,
        paused: this.paused,
        matchEnded: this.matchEnded,
        teamsLocked: this.teamsLocked,
        roomEntryLocked: this.roomEntryLocked,
        enabledPowerups: this.enabledPowerups,
        fieldPowerup: this.fieldPowerup,
        ballFireType: this.ballFireType,
        botCounter: this.botCounter,
        ball: {
          x: this.ball.x,
          y: this.ball.y,
          vx: this.ball.vx,
          vy: this.ball.vy,
          radius: this.ball.radius
        },
        players: this.players
          .filter((p) => p.id === 'host' || p.id === 'local-p2' || p.isBot)
          .map((p) => ({
            id: p.id,
            name: p.name,
            avatar: p.avatar,
            team: p.team,
            isBot: p.isBot,
            isAdmin: p.isAdmin,
            country: p.country,
            x: p.x,
            y: p.y,
            vx: p.vx,
            vy: p.vy,
            radius: p.radius
          }))
      };
      window.sessionStorage.setItem('openhax_match_state', JSON.stringify(state));
    } catch { /* ignore */ }
  }

  private createAndEnterRoom(restoreSaved = false): void {
    const kind = this.createType.value as 'public' | 'private' | 'offline' | 'local2p';
    const rawRoomName = this.createName.value.trim() || (this.settings.nickname + "'nun Odasi");
    const roomName = censorText(rawRoomName);
    const stadiumId = this.createStadium.value as StadiumId;
    const maxPlayers = Number(this.createMax.value) || 8;
    const botPreset = this.createBots.value;
    const botDiff = this.createBotDiff.value as BotDifficulty;
    const physProfile = this.createPhysics.value as PhysicsProfile;
    const physFeel = el<HTMLSelectElement>('create-physics-feel').value as PhysicsFeelMode;
    const physHz = 60;
    const rawCreateFps = el<HTMLInputElement>('create-roommaxfps-custom').value.trim();
    const parsedCreateFps = rawCreateFps !== '' ? Number(rawCreateFps) : Number(el<HTMLSelectElement>('create-roommaxfps').value);
    const roomMaxFps = !Number.isFinite(parsedCreateFps) || parsedCreateFps <= 0 ? 0 : Math.max(15, Math.min(1000, Math.round(parsedCreateFps)));
    const powerupMode = (el<HTMLSelectElement>('create-powerup').value as PowerupMode) || 'none';
    const scoreLimit = Number(this.createScoreLimit.value) || 0;
    const timeLimit = Number(this.createTimeLimit.value) || 0;
    const password = this.createPass.value.trim();

    this.roomKind = kind;
    this.currentRoomName = roomName;
    this.roomMaxPlayers = maxPlayers;
    this.roomScoreLimit = scoreLimit;
    this.roomTimeLimit = timeLimit;
    this.currentRoomPassword = password;
    this.roomHasPassword = Boolean(password);
    this.customTuningActive = false;
    this.roomEntryLocked = false;
    this.enabledPowerups =
      powerupMode === 'none'
        ? []
        : powerupMode === 'all'
          ? ['hawk', 'fire', 'speed', 'magnet', 'giant']
          : [powerupMode as PowerupType];
    this.fieldPowerup = null;
    this.ballFireType = null;
    this.nextPowerupSpawnTick = Math.round(4 * physHz);
    this.matchEnded = false;
    this.botCounter = 1;
    this.chatBox.innerHTML = '';

    this.updateSettings({
      stadium: stadiumId,
      botDifficulty: botDiff,
      physicsProfile: physProfile,
      physicsFeel: physFeel,
      physicsHz: physHz,
      roomMaxFps
    });
    this.roomBotDiff.value = botDiff;
    this.roomStadium.value = stadiumId;
    this.roomPhysics.value = physProfile;
    this.roomPhysicsFeel.value = physFeel;
    el<HTMLSelectElement>('room-fps-select').value = String(roomMaxFps);
    el<HTMLInputElement>('room-fps-custom').value = String(roomMaxFps);

    this.myPlayerId = 'host';
    this.players = [
      this.createPlayer('host', this.settings.nickname, this.settings.avatar, 'red', false, true, this.settings.country || 'TR', 0)
    ];

    if (kind === 'local2p') {
      this.players.push(this.createPlayer('local-p2', 'Oyuncu 2', ':(', 'blue', false));
    } else if (botPreset === '1blue') {
      this.players.push(this.createPlayer('bot-' + this.botCounter++, 'Bot-1', 'AI', 'blue', true));
    } else if (botPreset === '2v2') {
      this.players.push(this.createPlayer('bot-' + this.botCounter++, 'Bot-K1', 'AI', 'red', true));
      this.players.push(this.createPlayer('bot-' + this.botCounter++, 'Bot-M1', 'AI', 'blue', true));
      this.players.push(this.createPlayer('bot-' + this.botCounter++, 'Bot-M2', 'AI', 'blue', true));
    }

    let restoredMatch = false;
    if (restoreSaved) {
      try {
        const rawState = window.sessionStorage.getItem('openhax_match_state');
        if (rawState) {
          const st = JSON.parse(rawState) as {
            scoreRed?: number;
            scoreBlue?: number;
            matchSeconds?: number;
            tick?: number;
            tickInSecond?: number;
            paused?: boolean;
            matchEnded?: boolean;
            teamsLocked?: boolean;
            roomEntryLocked?: boolean;
            enabledPowerups?: PowerupType[];
            fieldPowerup?: FieldPowerup | null;
            ballFireType?: PowerupType | null;
            botCounter?: number;
            ball?: { x: number; y: number; vx: number; vy: number; radius?: number };
            players?: Array<{
              id: string;
              name: string;
              avatar: string;
              team: Team;
              isBot: boolean;
              isAdmin?: boolean;
              country?: string;
              x: number;
              y: number;
              vx: number;
              vy: number;
              radius?: number;
            }>;
          };
          this.scoreRed = Number(st.scoreRed) || 0;
          this.scoreBlue = Number(st.scoreBlue) || 0;
          this.matchSeconds = Number(st.matchSeconds) || 0;
          this.tick = Number(st.tick) || 0;
          this.tickInSecond = Number(st.tickInSecond) || 0;
          this.paused = Boolean(st.paused);
          this.matchEnded = Boolean(st.matchEnded);
          this.teamsLocked = Boolean(st.teamsLocked);
          this.roomEntryLocked = Boolean(st.roomEntryLocked);
          if (Array.isArray(st.enabledPowerups)) this.enabledPowerups = st.enabledPowerups;
          this.fieldPowerup = st.fieldPowerup || null;
          this.ballFireType = st.ballFireType || null;
          this.botCounter = Number(st.botCounter) || 1;
          if (st.ball) {
            this.ball.x = st.ball.x;
            this.ball.y = st.ball.y;
            this.ball.prevX = st.ball.x;
            this.ball.prevY = st.ball.y;
            this.ball.vx = st.ball.vx;
            this.ball.vy = st.ball.vy;
            if (st.ball.radius) this.ball.radius = st.ball.radius;
          }
          if (Array.isArray(st.players) && st.players.length > 0) {
            this.players = st.players.map((sp) => {
              const p = this.createPlayer(
                sp.id,
                sp.name,
                sp.avatar,
                sp.team,
                sp.isBot,
                Boolean(sp.isAdmin),
                sp.country || 'TR',
                sp.id === 'host' ? 0 : undefined
              );
              p.x = sp.x;
              p.y = sp.y;
              p.prevX = sp.x;
              p.prevY = sp.y;
              p.vx = sp.vx;
              p.vy = sp.vy;
              if (sp.radius) p.radius = sp.radius;
              return p;
            });
          }
          this.goalPending = false;
          this.goalBannerTeam = null;
          this.goalResetTicks = 0;
          this.goalBannerEl.classList.add('hidden');
          this.pauseBannerEl.classList.toggle('hidden', !this.paused);
          restoredMatch = true;
        }
      } catch { /* ignore */ }
    }
    if (!restoredMatch) {
      this.resetMatch();
    }

    if (kind === 'public' || kind === 'private') {
      const code = this.peerMgr.hostRoom({ roomName, password });
      this.roomCodeBadge.textContent = 'Kod: ' + code;
      this.roomCodeBadge.classList.remove('hidden');
      this.btnCopyLink.classList.remove('hidden');
      this.startRoomHeartbeat(code);
    } else {
      this.roomCodeBadge.classList.add('hidden');
      this.btnCopyLink.classList.add('hidden');
      this.netStatusEl.textContent = kind === 'local2p' ? '2 Kişilik Yerel' : 'Çevrimdışı Oda';
    }

    this.roomTitleLabel.textContent = roomName;
    this.hostBotBar.classList.toggle('hidden', kind === 'local2p');
    this.switchScreen('room');
    try {
      window.sessionStorage.setItem(
        'openhax_active_room',
        JSON.stringify({
          role: 'host',
          kind,
          roomName,
          stadium: stadiumId,
          password,
          maxPlayers: String(maxPlayers),
          scoreLimit: String(scoreLimit),
          timeLimit: String(timeLimit),
          botDiff,
          physProfile,
          physHz: String(physHz),
          roomMaxFps: String(roomMaxFps),
          powerupMode
        })
      );
    } catch { /* ignore */ }
    this.updateRoomUI();
    this.addChat('Sistem', 'Oda kuruldu: ' + roomName, true);
  }

  private joinRemoteRoom(code: string, password: string): void {
    this.lobbyError.classList.add('hidden');
    this.chatBox.innerHTML = '';
    this.players = [];
    this.roomKind = 'public';
    this.pendingJoinCode = code;
    this.currentRoomPassword = password;
    try {
      window.sessionStorage.setItem('openhax_active_room', JSON.stringify({ role: 'guest', code, password }));
    } catch { /* ignore */ }
    this.netStatusEl.textContent = 'Bağlanıyor...';
    this.peerMgr.joinRoom(code, this.settings.nickname, this.settings.avatar, password, this.settings.country || 'TR');
  }

  private pickNextHostPlayer(): PlayerEntity | undefined {
    const humans = this.players.filter((p) => !p.isBot && p.id !== 'host');
    if (humans.length === 0) return undefined;
    return humans.find((p) => p.isAdmin) || humans[0];
  }

  private handleHostLost(roomCode: string): void {
    const fallbackNext = this.pickNextHostPlayer();
    if (!fallbackNext || !roomCode) {
      this.showLobbyError('Oda kurucusu ayrıldı ve oda kapatıldı.');
      this.switchScreen('lobby');
      return;
    }
    this.handleMigrateHost(fallbackNext.id, roomCode, this.currentRoomName, this.currentRoomPassword);
  }

  private handleMigrateHost(newHostId: string, roomCode: string, roomName: string, password: string): void {
    const myOldId = this.myPlayerId;
    if (newHostId === myOldId) {
      const remaining = this.players.filter((p) => p.id !== 'host');
      const me = remaining.find((p) => p.id === myOldId);
      if (me) {
        me.id = 'host';
        me.isAdmin = true;
        me.ping = 0;
      }
      this.players = remaining;
      this.myPlayerId = 'host';
      this.currentRoomName = roomName || this.currentRoomName;
      this.currentRoomPassword = password ?? this.currentRoomPassword;
      this.roomHasPassword = Boolean(this.currentRoomPassword);
      this.addChat('Sistem', 'Kurucu ayrıldı! Oda sahipliği size devredildi (★ Admin).', true);
      window.setTimeout(() => {
        if (this.activeScreen !== 'room') return;
        const claimed = this.peerMgr.hostRoom({
          roomName: this.currentRoomName,
          password: this.currentRoomPassword,
          preferredCode: roomCode
        });
        this.roomCodeBadge.textContent = 'Kod: ' + claimed;
        this.roomCodeBadge.classList.remove('hidden');
        this.btnCopyLink.classList.remove('hidden');
        this.startRoomHeartbeat(claimed);
        this.updateRoomUI();
      }, 450);
    } else {
      this.netStatusEl.textContent = 'Yeni kurucuya bağlanılıyor [' + roomCode + ']...';
      this.addChat('Sistem', 'Kurucu ayrıldı, oda yeni yöneticiye aktarılıyor...', true);
      const savedPass = password ?? this.currentRoomPassword;
      window.setTimeout(() => {
        if (this.activeScreen !== 'room') return;
        this.joinRemoteRoom(roomCode, savedPass);
      }, 1500);
    }
  }

  private leaveCurrentRoom(): void {
    const code = this.peerMgr.getRoomCode();
    const wasHost = this.peerMgr.getRole() === 'host';
    const nextHost = wasHost ? this.pickNextHostPlayer() : undefined;
    this.stopRoomHeartbeat();
    this.teamsLocked = false;
    this.roomEntryLocked = false;

    if (wasHost && code) {
      if (nextHost) {
        this.peerMgr.broadcastHostMigration(nextHost.id);
        this.switchScreen('lobby');
        window.setTimeout(() => this.peerMgr.disconnect(), 130);
        return;
      }
      void this.directory.removeRoom(code);
    }
    this.peerMgr.disconnect();
    this.switchScreen('lobby');
  }

  private startRoomHeartbeat(code: string): void {
    this.stopRoomHeartbeat();
    if (this.roomKind !== 'public') return;

    const publishNow = () => {
      const humans = this.players.filter((p) => !p.isBot).length;
      const bots = this.players.filter((p) => p.isBot).length;
      if (this.activeScreen !== 'room' || this.peerMgr.getRole() !== 'host' || humans <= 0) {
        void this.directory.removeRoom(code);
        this.stopRoomHeartbeat();
        return;
      }
      void this.directory.publishRoom({
        code,
        name: this.currentRoomName,
        hostName: this.settings.nickname,
        stadium: this.stadium.id,
        players: humans,
        bots,
        maxPlayers: this.roomMaxPlayers,
        hasPassword: this.roomHasPassword,
        country: this.settings.country || 'TR'
      });
    };

    publishNow();
    try {
      const blob = new Blob(['setInterval(() => postMessage(1), 6000);'], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(blob);
      const worker = new Worker(workerUrl);
      URL.revokeObjectURL(workerUrl);
      worker.onmessage = () => {
        if (this.peerMgr.getRole() === 'host') publishNow();
      };
      this.heartbeatWorker = worker;
    } catch {
      this.heartbeatTimer = window.setInterval(publishNow, 6000);
    }

    const onPageExit = () => {
      if (this.peerMgr.getRole() === 'host' && this.peerMgr.getRoomCode() === code) {
        const nextHost = this.pickNextHostPlayer();
        if (nextHost) {
          this.peerMgr.broadcastHostMigration(nextHost.id);
        } else {
          void this.directory.removeRoom(code);
        }
      }
    };
    this.pageExitHandler = onPageExit;
    window.addEventListener('pagehide', onPageExit);
    window.addEventListener('beforeunload', onPageExit);
  }

  private stopRoomHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.heartbeatWorker) {
      this.heartbeatWorker.terminate();
      this.heartbeatWorker = null;
    }
    if (this.pageExitHandler) {
      window.removeEventListener('pagehide', this.pageExitHandler);
      window.removeEventListener('beforeunload', this.pageExitHandler);
      this.pageExitHandler = null;
    }
  }

  private addBot(team: 'red' | 'blue'): void {
    if (this.peerMgr.getRole() === 'guest') return;
    if (this.players.length >= 14) return;
    const id = 'bot-' + this.botCounter++;
    const label = (team === 'red' ? 'Bot-K' : 'Bot-M') + (this.botCounter - 1);
    const bot = this.createPlayer(id, label, 'AI', team, true);
    const cx = this.stadium.pitchX + this.stadium.pitchWidth / 2;
    const cy = this.stadium.pitchY + this.stadium.pitchHeight / 2;
    bot.x = team === 'red' ? cx - 140 : cx + 140;
    bot.y = cy + ((Math.random() - 0.5) * 60);
    bot.prevX = bot.x;
    bot.prevY = bot.y;
    this.players.push(bot);
    this.addChat('Sistem', label + ' (' + (team === 'red' ? 'Kırmızı' : 'Mavi') + ') oyuna eklendi.', true);
    this.updateRoomUI();
  }

  private removeLastBot(): void {
    if (this.peerMgr.getRole() === 'guest') return;
    for (let i = this.players.length - 1; i >= 0; i--) {
      if (this.players[i].isBot) {
        const removed = this.players.splice(i, 1)[0];
        this.addChat('Sistem', removed.name + ' çıkarıldı.', true);
        this.updateRoomUI();
        return;
      }
    }
  }

  private clearBots(): void {
    if (this.peerMgr.getRole() === 'guest') return;
    this.players = this.players.filter((p) => !p.isBot);
    this.addChat('Sistem', 'Tüm botlar temizlendi.', true);
    this.updateRoomUI();
  }

  private updateRoomUI(): void {
    const isAdmin = this.isMeAdmin();
    this.hostBotBar.classList.toggle('hidden', this.roomKind === 'local2p');
    this.hostBotBar.querySelectorAll<HTMLButtonElement | HTMLSelectElement>('button, select').forEach((node) => {
      node.disabled = !isAdmin;
    });
    this.btnPause.classList.toggle('hidden', this.activeScreen !== 'room' || !isAdmin);
    this.btnReset.classList.toggle('hidden', this.activeScreen !== 'room' || !isAdmin);

    // Lock physics controls for non-admin users while keeping graphics/FPS/sound unlocked
    const lockIds = ['set-physics', 'set-physicshz', 'set-roommaxfps', 'set-ballctrl', 'set-balldamp', 'set-kickpwr', 'set-pspd', 'set-wallb'];
    for (const id of lockIds) {
      const node = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
      if (node) node.disabled = !isAdmin;
    }
    const proBtn = this.settingsModal.querySelector<HTMLButtonElement>('[data-preset="proControl"]');
    if (proBtn) proBtn.disabled = !isAdmin;
    this.physicsAdminNote.classList.toggle('hidden', isAdmin);

    if (this.roomKind === 'local2p') {
      this.controlsHintEl.textContent = '2 Kişilik Yerel: Kırmızı W A S D + Boşluk | Mavi Ok Tuşları + X';
    } else {
      this.controlsHintEl.textContent = 'Kontroller: Ok Tuşları veya W A S D + X / Boşluk';
    }

    this.rosterStrip.innerHTML = '';
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      const chip = document.createElement('span');
      chip.className = 'roster-chip ' + p.team + (p.isAdmin ? ' admin' : '');
      const pingSuffix = !p.isBot && typeof p.ping === 'number' ? ' (' + p.ping + 'ms)' : '';
      const restText = (p.isAdmin ? '★ ' : '') + (p.isBot ? '[BOT] ' : '') + p.name + pingSuffix;
      if (p.isBot) {
        chip.textContent = '🤖 ' + restText;
      } else {
        chip.append(createFlagEl(p.country), ' ' + restText);
      }
      if (isAdmin && p.id !== 'host') {
        chip.title = 'Sağ tıkla: Admin / Takım / At';
        chip.style.cursor = 'context-menu';
        chip.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.openPlayerContextMenu(e.clientX, e.clientY, p);
        });
      }
      this.rosterStrip.appendChild(chip);
    }
    const teamsEl = document.getElementById('teams-modal');
    if (teamsEl && !teamsEl.classList.contains('hidden')) {
      this.renderTeamsModalFn?.();
    }
  }

  private isMeAdmin(): boolean {
    if (this.peerMgr.getRole() !== 'guest') return true;
    const me = this.players.find((p) => p.id === this.myPlayerId);
    return Boolean(me?.isAdmin);
  }

  private openPlayerContextMenu(x: number, y: number, target: PlayerEntity): void {
    this.ctxMenu.innerHTML = '';
    const addItem = (label: string, onClick: () => void) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = label;
      btn.addEventListener('click', () => {
        this.ctxMenu.classList.add('hidden');
        onClick();
      });
      this.ctxMenu.appendChild(btn);
    };

    if (!target.isBot) {
      addItem(target.isAdmin ? 'Adminliği Al' : '★ Admin Yap', () => {
        this.dispatchAdminAction('toggle_admin', target.id);
      });
    }
    addItem('Kırmızı Takıma Al', () => this.dispatchAdminAction('set_team', target.id, 'red'));
    addItem('Mavi Takıma Al', () => this.dispatchAdminAction('set_team', target.id, 'blue'));
    addItem('İzleyiciye Al', () => this.dispatchAdminAction('set_team', target.id, 'spec'));
    if (target.id !== this.myPlayerId) {
      addItem('Odadan At (Kick)', () => this.dispatchAdminAction('kick', target.id));
    }

    this.ctxMenu.style.left = Math.min(window.innerWidth - 190, x) + 'px';
    this.ctxMenu.style.top = Math.min(window.innerHeight - 180, y) + 'px';
    this.ctxMenu.classList.remove('hidden');
  }

  private dispatchAdminAction(cmd: string, targetId?: string, value?: string | number | boolean): void {
    if (this.peerMgr.getRole() === 'guest') {
      if (this.isMeAdmin()) {
        this.peerMgr.sendAdminCmd(cmd, targetId, value);
      }
      return;
    }
    this.executeAdminCmd(cmd, targetId, value);
  }

  private handleRemoteAdminCmd(fromPeerId: string, cmd: string, targetId?: string, value?: string | number | boolean): void {
    const sender = this.players.find((p) => p.id === fromPeerId);
    if (!sender || !sender.isAdmin) return;
    this.executeAdminCmd(cmd, targetId, value);
  }

  private executeAdminCmd(cmd: string, targetId?: string, value?: string | number | boolean): void {
    if (cmd === 'toggle_admin' && targetId) {
      const target = this.players.find((p) => p.id === targetId);
      if (target && !target.isBot && target.id !== 'host') {
        target.isAdmin = !target.isAdmin;
        this.addChat('Sistem', target.name + (target.isAdmin ? ' artık oda admini.' : ' adminlikten çıkarıldı.'), true);
        this.peerMgr.broadcastChat('Sistem', target.name + (target.isAdmin ? ' artık oda admini.' : ' adminlikten çıkarıldı.'), undefined);
        this.updateRoomUI();
      }
    } else if (cmd === 'set_team' && targetId && (value === 'red' || value === 'blue' || value === 'spec')) {
      this.handlePeerTeam(targetId, value as Team, true);
    } else if (cmd === 'kick' && targetId && targetId !== 'host') {
      const idx = this.players.findIndex((p) => p.id === targetId);
      if (idx !== -1) {
        const removed = this.players[idx];
        if (removed.isBot) {
          this.players.splice(idx, 1);
          this.updateRoomUI();
        } else {
          this.peerMgr.kickPeer(targetId, 'Oda admini tarafından odadan çıkarıldınız.');
        }
      }
    } else if (cmd === 'toggle_lock') {
      this.teamsLocked = !this.teamsLocked;
      this.addChat('Sistem', this.teamsLocked ? 'Takım seçimi kilitlendi.' : 'Takım seçimi açıldı.', true);
      this.peerMgr.broadcastChat('Sistem', this.teamsLocked ? 'Takım seçimi kilitlendi.' : 'Takım seçimi açıldı.', undefined);
      this.updateRoomUI();
    } else if (cmd === 'toggle_roomlock') {
      this.roomEntryLocked = !this.roomEntryLocked;
      const msg = this.roomEntryLocked ? '🔒 Oda yeni oyunculara kilitlendi.' : '🔓 Oda yeni oyunculara açıldı.';
      this.addChat('Sistem', msg, true);
      this.peerMgr.broadcastChat('Sistem', msg, undefined);
      this.updateRoomUI();
    } else if (cmd === 'toggle_pause') {
      this.togglePause();
      if (this.paused) {
        this.chatInput.focus();
        this.addChat('Sistem', '🔍 Makro Testi: Şimdi 1 kere X tuşuna basın (seri/makro basanlar sohbete xxxx yazacaktır).', true);
      }
    } else if (cmd === 'reset_match') {
      this.resetMatch();
    } else if (cmd === 'add_bot' && (value === 'red' || value === 'blue')) {
      this.addBot(value);
    } else if (cmd === 'remove_bot') {
      this.removeLastBot();
    } else if (cmd === 'clear_bots') {
      this.clearBots();
    } else if (cmd === 'set_botdiff' && (value === 'easy' || value === 'medium' || value === 'hard')) {
      this.updateSettings({ botDifficulty: value });
      this.roomBotDiff.value = value;
      el<HTMLSelectElement>('set-botdiff').value = value;
    } else if (cmd === 'set_stadium' && typeof value === 'string') {
      const nextStadium = getStadium(value as StadiumId);
      this.updateSettings({ stadium: nextStadium.id });
      resetPositionsForKickoff(this.players, this.ball, this.stadium);
      this.roomStadium.value = nextStadium.id;
    } else if (cmd === 'set_physics' && typeof value === 'string') {
      this.customTuningActive = false;
      this.updateSettings({ physicsProfile: value as PhysicsProfile });
      this.roomPhysics.value = value;
      el<HTMLSelectElement>('set-physics').value = value;
    } else if (cmd === 'set_physics_feel' && typeof value === 'string') {
      this.updateSettings({ physicsFeel: value as PhysicsFeelMode });
      this.roomPhysicsFeel.value = value;
      (document.getElementById('set-physics-feel') as HTMLSelectElement | null || document.createElement('select')).value = value;
    } else if (cmd === 'set_physicshz' && typeof value === 'number') {
      const hz = Math.max(60, Math.min(500, value));
      this.updateSettings({ physicsHz: hz });
      el<HTMLSelectElement>('set-physicshz').value = String(hz);
    } else if (cmd === 'set_powerups' && typeof value === 'string') {
      const list = value
        .split(',')
        .map((s) => s.trim())
        .filter((s): s is PowerupType => ['hawk', 'fire', 'speed', 'magnet', 'giant'].includes(s));
      this.enabledPowerups = list;
      this.fieldPowerup = null;
      this.ballFireType = null;
      if (list.length === 0) {
        for (const pl of this.players) {
          pl.powerup = null;
          pl.radius = 15;
        }
      } else {
        this.nextPowerupSpawnTick = this.tick + 120;
      }
      this.addChat('Sistem', list.length ? `Aktif Güçler: ${list.join(', ')}` : 'Süper Güçler kapatıldı.', true);
      this.peerMgr.broadcastChat('Sistem', list.length ? `Aktif Güçler: ${list.join(', ')}` : 'Süper Güçler kapatıldı.', undefined);
    } else if (cmd === 'set_roommaxfps' && typeof value === 'number') {
      const mf = Math.max(0, value);
      this.updateSettings({ roomMaxFps: mf });
      el<HTMLSelectElement>('set-roommaxfps').value = String(mf);
      el<HTMLSelectElement>('room-fps-select').value = String(mf);
    } else if (cmd === 'remove_team_bot' && (value === 'red' || value === 'blue')) {
      for (let i = this.players.length - 1; i >= 0; i--) {
        if (this.players[i].isBot && this.players[i].team === value) {
          const removed = this.players.splice(i, 1)[0];
          this.addChat('Sistem', removed.name + ' çıkarıldı.', true);
          this.updateRoomUI();
          break;
        }
      }
    }
  }

  private updateSettings(patch: Partial<GameSettings>): void {
    this.settings = { ...this.settings, ...patch };
    saveSettings(this.settings);
    this.applySettingsEffects();
  }

  private applySettingsEffects(): void {
    this.audio.setConfig(this.settings.masterSound, this.settings.soundVolume);
    const l = this.settings.lang || 'tr';
    this.btnMute.textContent = this.settings.masterSound ? t(l, 'soundOn') : t(l, 'soundOff');
    this.btnMute.classList.toggle('danger', !this.settings.masterSound);
    this.fpsHudEl.classList.toggle('hidden', !this.settings.showHud);
    const uFps = Number(this.settings.fpsLimit) || 0;
    const rFps = this.activeScreen === 'room' ? (Number(this.settings.roomMaxFps) || 0) : 0;
    const effFps = uFps > 0 && rFps > 0 ? Math.min(uFps, rFps) : uFps || rFps;
    const fpsText = effFps > 0 ? effFps + ' FPS' : '∞';
    this.btnSettings.textContent = t(l, 'settingsShort') + ' (' + fpsText + ')';
    if (this.peerMgr.getRole() !== 'guest') {
      this.stadium = getStadium(this.settings.stadium);
    }
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty('--chat-opacity', String(this.settings.chatOpacity ?? 0.8));
    rootStyle.setProperty('--chat-focus-h', (this.settings.chatFocusHeight ?? 140) + 'px');
    rootStyle.setProperty('--canvas-scale', String(this.settings.resolution || 1));
    document.body.classList.toggle('chat-full', this.settings.chatWidth === 'full');
    document.body.classList.toggle('vp-full', this.settings.viewportMode === 'full' || this.settings.viewportMode === 'fullscreen');
    document.body.classList.toggle('vp-restricted', this.settings.viewportMode === 'restricted');
    if (this.settings.viewportMode === 'fullscreen') {
      if (!document.fullscreenElement) {
        void document.documentElement.requestFullscreen?.().catch(() => {});
      }
    } else if (document.fullscreenElement) {
      void document.exitFullscreen?.().catch(() => {});
    }
  }

  private syncSettingsToUI(): void {
    const s = this.settings;
    el<HTMLSelectElement>('set-fps').value = String(s.fpsLimit);
    el<HTMLInputElement>('set-fps-custom').value = String(s.fpsLimit);
    el<HTMLSelectElement>('set-viewport').value = s.viewportMode || 'dynamic';
    el<HTMLSelectElement>('set-grass').value = s.grassDetail;
    el<HTMLSelectElement>('set-ballstyle').value = s.ballStyle;
    el<HTMLInputElement>('set-balltrail').checked = s.ballTrail;
    el<HTMLSelectElement>('set-goalnetstyle').value = s.goalNetStyle || 'classic';
    el<HTMLSelectElement>('set-goalpoststyle').value = s.goalPostStyle || 'classic';
    el<HTMLInputElement>('set-crowd').checked = s.crowdEnabled !== false;
    el<HTMLSelectElement>('set-res').value = String(s.resolution);
    el<HTMLInputElement>('set-lowlatency').checked = s.lowLatencyCanvas !== false;
    el<HTMLInputElement>('set-customcolors').checked = s.customTeamColors !== false;
    el<HTMLInputElement>('set-chatind').checked = s.showChatIndicators !== false;
    el<HTMLInputElement>('set-avatars').checked = s.showPlayerAvatars !== false;
    const chatOp = s.chatOpacity ?? 0.8;
    el<HTMLInputElement>('set-chatopacity').value = String(chatOp);
    el<HTMLSpanElement>('lbl-chatopacity').textContent = Number(chatOp).toFixed(1);
    const chatH = s.chatFocusHeight ?? 140;
    el<HTMLInputElement>('set-chatheight').value = String(chatH);
    el<HTMLSpanElement>('lbl-chatheight').textContent = String(chatH);
    el<HTMLSelectElement>('set-chatwidth').value = s.chatWidth || 'compact';
    el<HTMLInputElement>('set-aa').checked = s.antialias;
    el<HTMLInputElement>('set-perfboost').checked = Boolean(s.perfBoost);
    el<HTMLInputElement>('set-goalnets').checked = s.showGoalNets !== false;
    el<HTMLInputElement>('set-shadows').checked = s.shadows;
    el<HTMLInputElement>('set-particles').checked = s.particles;
    el<HTMLInputElement>('set-kickflash').checked = s.kickFlash;
    el<HTMLInputElement>('set-hud').checked = s.showHud;
    el<HTMLInputElement>('set-blurpause').checked = s.pauseOnBlur;
    el<HTMLSelectElement>('set-physics').value = s.physicsProfile;
    el<HTMLSelectElement>('set-physicshz').value = String(s.physicsHz || 60);
    el<HTMLSelectElement>('set-roommaxfps').value = String(s.roomMaxFps || 0);
    el<HTMLSelectElement>('room-fps-select').value = String(s.roomMaxFps || 0);
    el<HTMLInputElement>('set-roommaxfps-custom').value = String(s.roomMaxFps || 0);
    el<HTMLInputElement>('room-fps-custom').value = String(s.roomMaxFps || 0);
    el<HTMLSelectElement>('set-botdiff').value = s.botDifficulty;
    el<HTMLInputElement>('set-sound').checked = s.masterSound;
    el<HTMLInputElement>('set-volume').value = String(s.soundVolume);
    el<HTMLSpanElement>('vol-label').textContent = Math.round(s.soundVolume * 100) + '%';
    el<HTMLInputElement>('set-goalgif').value = s.goalGifUrl || '';
    el<HTMLInputElement>('set-concedegif').value = s.concedeGifUrl || '';
    el<HTMLInputElement>('set-chantgif').value = s.chantGifUrl || '';
    el<HTMLInputElement>('set-yt-clientid').value = s.youtubeClientId || '';
    el<HTMLSelectElement>('set-yt-privacy').value = s.youtubePrivacy || 'unlisted';
    el<HTMLSelectElement>('room-yt-privacy').value = s.youtubePrivacy || 'unlisted';
    el<HTMLInputElement>('set-ballctrl').value = String(s.ballControl);
    el<HTMLSpanElement>('lbl-ballctrl').textContent = s.ballControl + '%';
    el<HTMLInputElement>('set-balldamp').value = String(s.ballDamping);
    el<HTMLSpanElement>('lbl-balldamp').textContent = Number(s.ballDamping).toFixed(3);
    el<HTMLInputElement>('set-kickpwr').value = String(s.kickPower);
    el<HTMLSpanElement>('lbl-kickpwr').textContent = Number(s.kickPower).toFixed(1);
    el<HTMLInputElement>('set-pspd').value = String(s.playerSpeed);
    el<HTMLSpanElement>('lbl-pspd').textContent = Number(s.playerSpeed).toFixed(1);
    el<HTMLInputElement>('set-wallb').value = String(s.wallBounce);
    el<HTMLSpanElement>('lbl-wallb').textContent = Number(s.wallBounce).toFixed(2);
    (document.getElementById('set-physics-feel') as HTMLSelectElement | null || document.createElement('select')).value = s.physicsFeel || 'standard';
    this.roomPhysicsFeel.value = s.physicsFeel || 'standard';
    el<HTMLInputElement>('set-startaccel').value = String(s.startAccelMul ?? 1.4);
    el<HTMLSpanElement>('lbl-startaccel').textContent = Number(s.startAccelMul ?? 1.4).toFixed(1) + 'x';
    el<HTMLInputElement>('set-stopfriction').value = String(s.stopFriction ?? 0.82);
    el<HTMLSpanElement>('lbl-stopfriction').textContent = Number(s.stopFriction ?? 0.82).toFixed(2);
    el<HTMLInputElement>('set-surfacefriction').value = String(s.surfaceFriction ?? 0.974);
    el<HTMLSpanElement>('lbl-surfacefriction').textContent = Number(s.surfaceFriction ?? 0.974).toFixed(3);
    this.roomBotDiff.value = s.botDifficulty;
    this.roomStadium.value = s.stadium;
    el<HTMLSelectElement>('select-lang').value = s.lang || 'tr';

    this.applySettingsEffects();
    this.applyLanguage();
  }

  private populateCountrySelect(lang: Lang): void {
    const prev = this.authCountry.value || this.settings.country || 'TR';
    this.authCountry.textContent = '';
    for (const code of ALL_COUNTRY_CODES) {
      const opt = document.createElement('option');
      opt.value = code;
      opt.textContent = getCountryLabel(code, lang);
      this.authCountry.appendChild(opt);
    }
    this.authCountry.value = ALL_COUNTRY_CODES.includes(prev) ? prev : 'TR';
  }

  private enhanceFlagSelect(
    selectEl: HTMLSelectElement,
    getFlagCode: (value: string) => string,
    fullWidth: boolean,
    searchable: boolean
  ): () => void {
    const wrap = document.createElement('div');
    wrap.className = 'flag-select' + (fullWidth ? ' full' : '');
    selectEl.parentNode?.insertBefore(wrap, selectEl);
    wrap.appendChild(selectEl);
    selectEl.classList.add('sr-only-select');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'flag-select-btn';
    const mainSpan = document.createElement('span');
    mainSpan.className = 'flag-select-main';
    const arrow = document.createElement('span');
    arrow.textContent = '▾';
    btn.append(mainSpan, arrow);

    const menu = document.createElement('div');
    menu.className = 'flag-select-menu hidden';

    wrap.append(btn, menu);

    let searchInput: HTMLInputElement | null = null;
    const renderOptions = (filter = '') => {
      menu.textContent = '';
      if (searchable) {
        if (!searchInput) {
          searchInput = document.createElement('input');
          searchInput.type = 'text';
          searchInput.className = 'flag-select-search';
          searchInput.placeholder = '🔍 ...';
          searchInput.addEventListener('click', (e) => e.stopPropagation());
          searchInput.addEventListener('input', () => renderOptions(searchInput?.value || ''));
        }
        menu.appendChild(searchInput);
      }
      const q = filter.trim().toLowerCase();
      for (const opt of Array.from(selectEl.options)) {
        const txt = opt.textContent || opt.value;
        if (q && !txt.toLowerCase().includes(q) && !opt.value.toLowerCase().includes(q)) continue;
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'flag-select-opt' + (opt.value === selectEl.value ? ' selected' : '');
        item.append(createFlagEl(getFlagCode(opt.value)), document.createTextNode(txt));
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          selectEl.value = opt.value;
          selectEl.dispatchEvent(new Event('change', { bubbles: true }));
          menu.classList.add('hidden');
          sync();
        });
        menu.appendChild(item);
      }
      if (searchable && searchInput) {
        window.setTimeout(() => searchInput?.focus(), 0);
      }
    };

    const sync = () => {
      const selected = selectEl.selectedOptions[0] || selectEl.options[0];
      mainSpan.textContent = '';
      if (selected) {
        mainSpan.append(createFlagEl(getFlagCode(selected.value)), document.createTextNode(selected.textContent || selected.value));
      }
    };

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = menu.classList.contains('hidden');
      document.querySelectorAll('.flag-select-menu').forEach((m) => m.classList.add('hidden'));
      if (willOpen) {
        if (searchInput) searchInput.value = '';
        renderOptions('');
        menu.classList.remove('hidden');
      }
    });
    document.addEventListener('click', () => menu.classList.add('hidden'));
    selectEl.addEventListener('change', sync);
    sync();
    return sync;
  }

  private applyLanguage(): void {
    const l = this.settings.lang || 'tr';
    this.populateCountrySelect(l);
    this.syncLangSelectUi?.();
    this.syncCountrySelectUi?.();
    const setText = (sel: string, key: string) => {
      const node = document.querySelector(sel);
      if (node) node.textContent = t(l, key);
    };
    const setPh = (sel: string, key: string) => {
      const node = document.querySelector(sel) as HTMLInputElement | null;
      if (node) node.placeholder = t(l, key);
    };
    setText('[data-nav="news"]', 'navNews');
    setText('[data-nav="play"]', 'navPlay');
    setText('[data-nav="about"]', 'navAbout');
    setText('[data-nav="community"]', 'navCommunity');
    setText('#btn-profile', 'profileBtn');
    if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
      setText('#btn-record', 'recordBtn');
    }
    setText('#btn-topbar-menu', 'menuBtn');
    setText('#btn-toggle-roombars', 'roomBarBtn');
    setText('#view-auth h1', 'authTitle');
    setText('#view-auth .subtitle', 'authSub');
    const authFieldSpans = document.querySelectorAll('#view-auth .auth-card label.field > span');
    if (authFieldSpans[0]) authFieldSpans[0].textContent = t(l, 'nickLabel');
    if (authFieldSpans[1]) authFieldSpans[1].textContent = t(l, 'avatarLabel');
    if (authFieldSpans[2]) authFieldSpans[2].textContent = t(l, 'countryLabel');
    if (authFieldSpans[3]) authFieldSpans[3].textContent = t(l, 'passLabel');
    setText('#btn-guest-enter', 'enterGuest');
    setText('.auth-leaders-card h2', 'leadersTitle');
    setText('.auth-chat-card h2', 'globalChatTitle');
    setPh('#global-chat-input', 'globalChatPh');
    setText('#btn-global-chat-send', 'send');
    setText('.lobby-chat-card h2', 'globalChatTitle');
    setPh('#lobby-global-chat-input', 'globalChatPh');
    setText('#btn-lobby-global-chat-send', 'send');
    setText('.lobby-list-card h2', 'roomsTitle');
    setPh('#lobby-search', 'searchPh');
    setPh('#join-code-input', 'joinCodePh');
    setPh('#join-pass-input', 'joinPassPh');
    setText('#rooms-empty', 'roomsEmpty');
    setText('.lobby-create-card h2', 'createRoomTitle');
    setText('#btn-create-room', 'createRoomBtn');
    setText('#btn-join-code', 'joinBtn');
    setText('#btn-refresh-rooms', 'refreshBtn');
    setText('#btn-change-name', 'changeName');
    setText('#btn-reset', 'reset');
    setText('#btn-leave-room', 'leaveRoom');
    setText('#btn-copy-link', 'copyLink');
    setText('#settings-modal h2', 'settingsTitle');
    setText('[data-tab="sound"]', 'tabSound');
    setText('[data-tab="video"]', 'tabVideo');
    setText('[data-tab="input"]', 'tabInput');
    setText('[data-tab="misc"]', 'tabMisc');
    setText('[data-tab="physics"]', 'tabPhysics');
    setText('#btn-settings-close', 'close');
    setText('#teams-modal-title', 'teamsTitle');
    setText('#btn-teams-close', 'close');
    setText('#btn-teams-start', 'startGame');
    setText('#btn-chat-send', 'send');
    setPh('#chat-input', 'chatPh');
    setText('#pause-banner span', 'pausedBanner');
    this.btnAuthEnter.textContent = this.pendingInviteCode ? t(l, 'enterInvite') : t(l, 'enterLobby');
    this.btnMute.textContent = this.settings.masterSound ? t(l, 'soundOn') : t(l, 'soundOff');
    this.btnPause.textContent = this.paused ? t(l, 'resume') : t(l, 'pause');
    const uFps = Number(this.settings.fpsLimit) || 0;
    const rFps = this.activeScreen === 'room' ? (Number(this.settings.roomMaxFps) || 0) : 0;
    const effFps = uFps > 0 && rFps > 0 ? Math.min(uFps, rFps) : uFps || rFps;
    const fpsText = effFps > 0 ? effFps + ' FPS' : '∞';
    this.btnSettings.textContent = t(l, 'settingsShort') + ' (' + fpsText + ')';
  }

  private createPlayer(
    id: string,
    name: string,
    avatar: string,
    team: Team,
    isBot: boolean,
    isAdmin = false,
    country?: string,
    ping?: number
  ): PlayerEntity {
    return {
      id,
      name,
      avatar,
      team,
      isBot,
      isAdmin,
      country,
      ping,
      x: 0,
      y: 0,
      prevX: 0,
      prevY: 0,
      vx: 0,
      vy: 0,
      radius: 15,
      inputBits: 0,
      kickArmed: false,
      prevKick: false,
      kickFlashTicks: 0,
      nextKickTick: 0
    };
  }

  private onPeerStatus(role: PeerRole, stateText: string, roomCode: string): void {
    this.netStatusEl.textContent = roomCode ? stateText + ' [' + roomCode + ']' : stateText;
    if (role === 'guest') {
      this.roomCodeBadge.textContent = 'Kod: ' + roomCode;
      this.roomCodeBadge.classList.remove('hidden');
      this.btnCopyLink.classList.remove('hidden');
    }
  }

  private handlePeerJoin(peerId: string, name: string, avatar: string, country = 'TR'): boolean | string {
    if (this.roomEntryLocked) {
      return 'Oda girişe kilitli! Yeni oyuncu kabul edilmiyor.';
    }
    const humanCount = this.players.filter((p) => !p.isBot).length;
    if (humanCount >= this.roomMaxPlayers) {
      return 'Oda dolu (' + humanCount + '/' + this.roomMaxPlayers + ')';
    }
    if (this.players.some((p) => p.id === peerId)) return true;

    const redCount = this.players.filter((p) => p.team === 'red').length;
    const blueCount = this.players.filter((p) => p.team === 'blue').length;
    const team: Team = redCount <= blueCount ? 'red' : 'blue';
    const player = this.createPlayer(peerId, name, avatar, team, false, false, country);

    const cx = this.stadium.pitchX + this.stadium.pitchWidth / 2;
    const cy = this.stadium.pitchY + this.stadium.pitchHeight / 2;
    player.x = team === 'red' ? cx - 140 : cx + 140;
    player.y = cy;
    player.prevX = player.x;
    player.prevY = player.y;

    this.players.push(player);
    this.addChat('Sistem', name + ' odaya katildi (' + (team === 'red' ? 'Kirmizi' : 'Mavi') + ').', true);
    this.peerMgr.broadcastChat('Sistem', name + ' odaya katildi.', undefined);
    this.updateRoomUI();
    return true;
  }

  private handlePeerLeave(peerId: string): void {
    const idx = this.players.findIndex((p) => p.id === peerId);
    if (idx !== -1) {
      const left = this.players.splice(idx, 1)[0];
      this.addChat('Sistem', left.name + ' odadan ayrildi.', true);
      this.peerMgr.broadcastChat('Sistem', left.name + ' odadan ayrildi.', undefined);
      this.updateRoomUI();
    }
  }

  private handlePeerInput(peerId: string, bits: number): void {
    const p = this.players.find((pl) => pl.id === peerId);
    if (p) p.inputBits = (Number(bits) || 0) & 31;
  }

  private handlePeerTeam(peerId: string, team: Team, bypassLock = false): void {
    const p = this.players.find((pl) => pl.id === peerId);
    if (!p || p.team === team) return;
    if (this.teamsLocked && !bypassLock && !p.isAdmin) return;
    p.team = team;
    p.vx = 0;
    p.vy = 0;
    if (team !== 'spec') {
      const cx = this.stadium.pitchX + this.stadium.pitchWidth / 2;
      const cy = this.stadium.pitchY + this.stadium.pitchHeight / 2;
      p.x = team === 'red' ? cx - 140 : cx + 140;
      p.y = cy;
      p.prevX = p.x;
      p.prevY = p.y;
    }
    this.updateRoomUI();
  }

  private togglePause(): void {
    if (this.peerMgr.getRole() === 'guest') return;
    this.paused = !this.paused;
    this.syncScoreboardUI();
  }

  private resetMatch(): void {
    if (this.peerMgr.getRole() === 'guest') return;
    this.scoreRed = 0;
    this.scoreBlue = 0;
    this.matchSeconds = 0;
    this.tickInSecond = 0;
    this.paused = false;
    this.matchEnded = false;
    this.goalPending = false;
    this.goalBannerTeam = null;
    this.goalResetTicks = 0;
    this.lastTouchId = '';
    this.assistTouchId = '';
    this.lastTouchTick = 0;
    this.saveCooldownTick = 0;
    this.particles = [];
    resetPositionsForKickoff(this.players, this.ball, this.stadium);
    this.pendingNetEvents |= 4;
    this.audio.playStart();
    this.syncScoreboardUI();
  }

  private spawnGoalParticles(team: Team): void {
    if (!this.settings.particles) return;
    const color = team === 'red' ? '#fca5a5' : '#93c5fd';
    for (let i = 0; i < 28; i++) {
      const ang = (Math.PI * 2 * i) / 28 + Math.random() * 0.25;
      const spd = 1.6 + Math.random() * 4.4;
      this.particles.push({
        x: this.ball.x,
        y: this.ball.y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life: 48,
        maxLife: 48,
        color,
        size: 2.5 + Math.random() * 2.5
      });
    }
  }

  private updateParticles(): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.x += pt.vx;
      pt.y += pt.vy;
      pt.vx *= 0.94;
      pt.vy *= 0.94;
      pt.life--;
      if (pt.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  private onSimulationTick(): void {
    const role = this.peerMgr.getRole();

    if (role === 'guest') {
      const bits = this.input.getSingleInputBits();
      this.inputKeepaliveTicks++;
      if (bits !== this.lastSentInputBits || this.inputKeepaliveTicks >= 6) {
        this.peerMgr.sendInput(bits);
        this.lastSentInputBits = bits;
        this.inputKeepaliveTicks = 0;
      }
      this.updateParticles();
      return;
    }

    if (this.paused) {
      if (role === 'host') this.broadcastHostSnapshot();
      return;
    }

    this.tick++;
    this.updateParticles();

    if (this.roomKind === 'local2p') {
      if (this.players[0]) this.players[0].inputBits = this.input.getLocalP1WasdBits();
      if (this.players[1]) this.players[1].inputBits = this.input.getLocalP2ArrowBits();
    } else {
      const me = this.players.find((p) => p.id === this.myPlayerId);
      if (me) me.inputBits = this.input.getSingleInputBits();
    }

    const physicsHz = Math.max(30, Math.min(500, Number(this.settings.physicsHz) || 60));

    if (!this.goalPending) {
      this.tickInSecond++;
      if (this.tickInSecond >= physicsHz) {
        this.tickInSecond = 0;
        this.matchSeconds++;
        if (this.roomTimeLimit > 0 && this.matchSeconds >= this.roomTimeLimit && !this.matchEnded) {
          this.matchEnded = true;
          this.goalPending = true;
          this.goalResetTicks = Math.round(3.5 * physicsHz);
          this.goalBannerTeam = this.scoreRed >= this.scoreBlue ? 'red' : 'blue';
          this.audio.play('end');
          this.pendingNetEvents |= 8;
          if (el<HTMLDivElement>('teams-modal').classList.contains('hidden')) {
            el<HTMLButtonElement>('btn-room-teams').click();
          }
          const msg =
            this.scoreRed === this.scoreBlue
              ? 'Sure doldu! Mac berabere bitti (' + this.scoreRed + '-' + this.scoreBlue + ')'
              : 'Sure doldu! ' + (this.scoreRed > this.scoreBlue ? 'Kirmizi' : 'Mavi') + ' takim kazandi!';
          this.addChat('Sistem', msg, true);
          const winner: Team | null = this.scoreRed > this.scoreBlue ? 'red' : this.scoreBlue > this.scoreRed ? 'blue' : null;
          for (const pl of this.players) {
            if (!pl.isBot && pl.team !== 'spec') {
              this.dispatchStatToPlayer(pl.id, 'match', this.settings.physicsProfile, this.stadium.id);
              if (winner && pl.team === winner) {
                this.dispatchStatToPlayer(pl.id, 'win');
              }
            }
          }
        }
        this.syncScoreboardUI();
      }
    }

    const res = stepPhysicsTick(
      this.players,
      this.ball,
      this.stadium,
      this.settings.physicsProfile,
      this.settings.botDifficulty,
      this.tick,
      this.goalPending,
      this.botAvoidMemory,
      this.customTuningActive ? this.settings : undefined,
      physicsHz,
      this.settings
    );

    if (res.touchedById) {
      if (this.lastTouchId !== res.touchedById) {
        this.assistTouchId = this.lastTouchId;
        this.lastTouchId = res.touchedById;
      }
      this.lastTouchTick = this.tick;
    }

    if (res.savedById && !this.goalPending && this.tick >= this.saveCooldownTick) {
      this.saveCooldownTick = this.tick + Math.round(1.5 * physicsHz);
      const saver = this.players.find((p) => p.id === res.savedById);
      if (saver && !saver.isBot) {
        this.dispatchStatToPlayer(saver.id, 'save');
        const saveMsg = '🧤 Kurtarış: ' + saver.name;
        this.addChat('Sistem', saveMsg, true);
        this.peerMgr.broadcastChat('Sistem', saveMsg, undefined);
      }
    }

    if (res.kicked) {
      this.audio.playKick();
      this.pendingNetEvents |= 1;
    }

    if (res.powerKickType) {
      this.ballFireType = res.powerKickType;
      this.ballFireUntilTick = this.tick + Math.round(2.5 * physicsHz);
    }
    if (this.ballFireType && this.tick >= this.ballFireUntilTick) {
      this.ballFireType = null;
    }

    if (this.enabledPowerups.length > 0 && !this.goalPending) {
      if (!this.fieldPowerup && this.tick >= this.nextPowerupSpawnTick) {
        const margin = 70;
        const px = this.stadium.pitchX + margin + Math.random() * Math.max(40, this.stadium.pitchWidth - margin * 2);
        const py = this.stadium.pitchY + margin + Math.random() * Math.max(40, this.stadium.pitchHeight - margin * 2);
        const pType: PowerupType = this.enabledPowerups[Math.floor(Math.random() * this.enabledPowerups.length)];
        this.fieldPowerup = { x: Math.round(px), y: Math.round(py), type: pType };
      } else if (this.fieldPowerup) {
        for (const pl of this.players) {
          if (pl.team === 'spec') continue;
          const dx = pl.x - this.fieldPowerup.x;
          const dy = pl.y - this.fieldPowerup.y;
          if (dx * dx + dy * dy <= (pl.radius + 16) * (pl.radius + 16)) {
            pl.powerup = this.fieldPowerup.type;
            pl.powerupUntilTick = this.tick + Math.round(8 * physicsHz);
            const names: Record<PowerupType, string> = {
              hawk: '🦅 Şahin Vuruşu',
              fire: '🔥 Alevli Şut',
              speed: '⚡ Hızlı Koşu',
              magnet: '🧲 Mıknatıs',
              giant: '🛡️ Dev Oyuncu'
            };
            const msg = `${names[this.fieldPowerup.type]} -> ${pl.name}! (8sn)`;
            this.addChat('Sistem', msg, true);
            this.peerMgr.broadcastChat('Sistem', msg, undefined);
            this.fieldPowerup = null;
            this.nextPowerupSpawnTick = this.tick + Math.round(9 * physicsHz);
            break;
          }
        }
      }
      for (const pl of this.players) {
        if (pl.powerup && this.tick >= (pl.powerupUntilTick || 0)) {
          pl.powerup = null;
        }
      }
    }

    if (res.goalTeam && !this.goalPending) {
      this.goalPending = true;
      this.goalBannerTeam = res.goalTeam;
      if (res.goalTeam === 'red') this.scoreRed++;
      else this.scoreBlue++;

      // Credit goal & assist to human players if touched within 6s
      const scorer = this.lastTouchId && this.tick - this.lastTouchTick <= Math.round(6 * physicsHz)
        ? this.players.find((p) => p.id === this.lastTouchId)
        : undefined;
      if (scorer && !scorer.isBot && scorer.team === res.goalTeam) {
        this.dispatchStatToPlayer(scorer.id, 'goal');
        const assister = this.assistTouchId ? this.players.find((p) => p.id === this.assistTouchId) : undefined;
        if (assister && !assister.isBot && assister.id !== scorer.id && assister.team === res.goalTeam) {
          this.dispatchStatToPlayer(assister.id, 'assist');
        }
      }
      this.lastTouchId = '';
      this.assistTouchId = '';

      const reachedLimit =
        this.roomScoreLimit > 0 &&
        (this.scoreRed >= this.roomScoreLimit || this.scoreBlue >= this.roomScoreLimit);

      if (reachedLimit) {
        this.matchEnded = true;
        this.goalResetTicks = Math.round(3.5 * physicsHz);
        this.audio.play('end');
        this.addChat(
          'Sistem',
          (res.goalTeam === 'red' ? 'Kirmizi' : 'Mavi') + ' takim maci kazandi! (' + this.scoreRed + '-' + this.scoreBlue + ')',
          true
        );
        for (const pl of this.players) {
          if (!pl.isBot && pl.team !== 'spec') {
            this.dispatchStatToPlayer(pl.id, 'match', this.settings.physicsProfile, this.stadium.id);
            if (pl.team === res.goalTeam) {
              this.dispatchStatToPlayer(pl.id, 'win');
            }
          }
        }
      } else {
        this.goalResetTicks = Math.round(1.6 * physicsHz);
        this.audio.playGoal();
      }
      this.spawnGoalParticles(res.goalTeam);
      this.pendingNetEvents |= 2;
      this.syncScoreboardUI();
    }

    if (this.goalPending) {
      this.goalResetTicks--;
      if (this.goalResetTicks <= 0) {
        this.goalPending = false;
        this.goalBannerTeam = null;
        if (this.matchEnded) {
          this.resetMatch();
        } else {
          resetPositionsForKickoff(this.players, this.ball, this.stadium);
          this.syncScoreboardUI();
        }
      }
    }

    if (role === 'host') {
      this.broadcastHostSnapshot();
    }
  }

  private broadcastHostSnapshot(): void {
    const snap: MatchSnapshot = {
      t: this.tick,
      rn: this.currentRoomName,
      st: this.stadium.id,
      pf: this.settings.physicsProfile,
      pfeel: this.settings.physicsFeel || 'standard',
      hz: this.settings.physicsHz || 60,
      mf: this.settings.roomMaxFps || 0,
      sc: [this.scoreRed, this.scoreBlue],
      sl: this.roomScoreLimit,
      tl: this.roomTimeLimit,
      sec: this.matchSeconds,
      p: this.paused,
      lk: this.teamsLocked,
      rl: this.roomEntryLocked,
      gt: this.goalBannerTeam,
      pu: this.fieldPowerup,
      bf: this.ballFireType,
      b: [
        Math.round(this.ball.x * 10) / 10,
        Math.round(this.ball.y * 10) / 10,
        Math.round(this.ball.vx * 100) / 100,
        Math.round(this.ball.vy * 100) / 100
      ],
      pl: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        team: p.team,
        isBot: p.isBot,
        adm: Boolean(p.isAdmin),
        ct: p.country,
        pg: p.ping,
        cc: p.customColor,
        pw: p.powerup || null,
        x: Math.round(p.x * 10) / 10,
        y: Math.round(p.y * 10) / 10,
        vx: Math.round(p.vx * 100) / 100,
        vy: Math.round(p.vy * 100) / 100,
        kf: p.kickFlashTicks
      })),
      ev: this.pendingNetEvents
    };
    this.pendingNetEvents = 0;
    this.peerMgr.broadcastSnapshot(snap);
  }

  private applyGuestSnapshot(snap: MatchSnapshot): void {
    if (snap.st !== this.stadium.id) {
      this.stadium = getStadium(snap.st);
    }
    if (snap.pf && snap.pf !== this.settings.physicsProfile) {
      this.settings.physicsProfile = snap.pf;
    }
    if (snap.pfeel && snap.pfeel !== this.settings.physicsFeel) {
      this.settings.physicsFeel = snap.pfeel;
      this.roomPhysicsFeel.value = snap.pfeel;
      (document.getElementById('set-physics-feel') as HTMLSelectElement | null || document.createElement('select')).value = snap.pfeel;
    }
    if (snap.hz && snap.hz !== this.settings.physicsHz) {
      this.settings.physicsHz = snap.hz;
      el<HTMLSelectElement>('set-physicshz').value = String(snap.hz);
    }
    if (typeof snap.mf === 'number' && snap.mf !== this.settings.roomMaxFps) {
      this.settings.roomMaxFps = snap.mf;
      el<HTMLSelectElement>('set-roommaxfps').value = String(snap.mf);
      el<HTMLSelectElement>('room-fps-select').value = String(snap.mf);
    }
    if (typeof snap.sl === 'number') {
      this.roomScoreLimit = snap.sl;
    }
    if (typeof snap.tl === 'number') {
      this.roomTimeLimit = snap.tl;
    }
    if (snap.rn && snap.rn !== this.currentRoomName) {
      this.currentRoomName = snap.rn;
      this.roomTitleLabel.textContent = snap.rn;
    }

    const scoreOrGoalChanged =
      this.scoreRed !== snap.sc[0] ||
      this.scoreBlue !== snap.sc[1] ||
      this.matchSeconds !== snap.sec ||
      this.paused !== snap.p ||
      this.goalBannerTeam !== snap.gt;

    this.scoreRed = snap.sc[0];
    this.scoreBlue = snap.sc[1];
    this.matchSeconds = snap.sec;
    this.paused = snap.p;
    this.teamsLocked = Boolean(snap.lk);
    this.roomEntryLocked = Boolean(snap.rl);
    this.goalBannerTeam = snap.gt;
    this.fieldPowerup = snap.pu || null;
    this.ballFireType = snap.bf || null;

    this.ball.prevX = this.ball.x;
    this.ball.prevY = this.ball.y;
    this.ball.x = snap.b[0];
    this.ball.y = snap.b[1];
    this.ball.vx = snap.b[2];
    this.ball.vy = snap.b[3];

    const existingMap = new Map(this.players.map((p) => [p.id, p]));
    const updated: PlayerEntity[] = [];
    let rosterChanged = this.players.length !== snap.pl.length;

    for (let i = 0; i < snap.pl.length; i++) {
      const sp = snap.pl[i];
      const cur = existingMap.get(sp.id);
      if (cur) {
        if (cur.team !== sp.team || cur.name !== sp.name || Boolean(cur.isAdmin) !== Boolean(sp.adm)) rosterChanged = true;
        cur.prevX = cur.x;
        cur.prevY = cur.y;
        cur.x = sp.x;
        cur.y = sp.y;
        cur.vx = sp.vx;
        cur.vy = sp.vy;
        cur.name = sp.name;
        cur.avatar = sp.avatar;
        cur.team = sp.team;
        cur.isBot = sp.isBot;
        cur.isAdmin = Boolean(sp.adm);
        cur.country = sp.ct;
        cur.ping = sp.pg;
        cur.customColor = sp.cc && /^#[0-9a-f]{6}$/i.test(sp.cc) ? sp.cc : undefined;
        cur.powerup = sp.pw || null;
        cur.kickFlashTicks = sp.kf;
        updated.push(cur);
      } else {
        rosterChanged = true;
        const fresh = this.createPlayer(sp.id, sp.name, sp.avatar, sp.team, sp.isBot, Boolean(sp.adm), sp.ct, sp.pg);
        fresh.x = sp.x;
        fresh.y = sp.y;
        fresh.prevX = sp.x;
        fresh.prevY = sp.y;
        fresh.vx = sp.vx;
        fresh.vy = sp.vy;
        fresh.kickFlashTicks = sp.kf;
        updated.push(fresh);
      }
    }
    this.players = updated;

    if (snap.ev & 1) this.audio.playKick();
    if (snap.ev & 2) {
      this.audio.playGoal();
      if (snap.gt) this.spawnGoalParticles(snap.gt);
    }
    if (snap.ev & 4) this.audio.playStart();

    if (scoreOrGoalChanged) this.syncScoreboardUI();
    if (rosterChanged) this.updateRoomUI();
  }

  private syncScoreboardUI(): void {
    this.scoreRedEl.textContent = String(this.scoreRed);
    this.scoreBlueEl.textContent = String(this.scoreBlue);

    const m = Math.floor(this.matchSeconds / 60);
    const s = this.matchSeconds % 60;
    this.timerEl.textContent = (m < 10 ? '0' + m : String(m)) + ':' + (s < 10 ? '0' + s : String(s));

    this.btnPause.classList.toggle('active', this.paused);
    this.btnPause.textContent = this.paused ? 'Devam Et (P)' : 'Duraklat (P)';
    this.pauseBannerEl.classList.toggle('hidden', !this.paused);

    const safeHttpUrl = (raw?: string): string => {
      const trimmed = (raw || '').trim();
      return /^https?:\/\/[^\s"'<>]+$/i.test(trimmed) ? trimmed : '';
    };
    const renderBanner = (gifUrl: string, labelText?: string) => {
      this.goalBannerEl.textContent = '';
      const wrap = document.createElement('div');
      wrap.style.textAlign = 'center';
      const safeUrl = safeHttpUrl(gifUrl);
      if (safeUrl) {
        const img = document.createElement('img');
        img.src = safeUrl;
        img.alt = labelText ? 'goal' : 'chant';
        img.style.maxHeight = labelText ? '110px' : '120px';
        img.style.borderRadius = '6px';
        if (labelText) img.style.marginBottom = '8px';
        img.style.display = 'block';
        img.style.marginLeft = 'auto';
        img.style.marginRight = 'auto';
        wrap.appendChild(img);
      }
      if (labelText) {
        const span = document.createElement('span');
        span.textContent = labelText;
        wrap.appendChild(span);
      }
      this.goalBannerEl.appendChild(wrap);
    };

    if (this.goalBannerTeam) {
      const l = this.settings.lang || 'tr';
      this.goalBannerEl.className = 'overlay-banner ' + this.goalBannerTeam;
      const me = this.players.find((p) => p.id === this.myPlayerId);
      const isConcede = Boolean(me && me.team !== 'spec' && me.team !== this.goalBannerTeam && this.settings.concedeGifUrl);
      const activeGif = isConcede ? (this.settings.concedeGifUrl || '') : (this.settings.goalGifUrl || '');
      renderBanner(activeGif, this.goalBannerTeam === 'red' ? t(l, 'goalRed') : t(l, 'goalBlue'));
    } else if (((this as unknown as { chantBannerUntil?: number }).chantBannerUntil || 0) > performance.now() && this.settings.chantGifUrl) {
      this.goalBannerEl.className = 'overlay-banner';
      renderBanner(this.settings.chantGifUrl);
    } else {
      this.goalBannerEl.className = 'overlay-banner hidden';
      this.goalBannerEl.textContent = '';
    }
  }

  private sendChat(): void {
    const raw = this.chatInput.value.trim();
    if (!raw) return;
    if (raw.startsWith('/')) {
      const [cmdRaw, ...rest] = raw.slice(1).split(/\s+/);
      const arg = rest.join(' ').trim();
      const cmd = (cmdRaw || '').toLowerCase();
      const me = this.players.find((p) => p.id === this.myPlayerId);
      if ((cmd === 'color' || cmd === 'renk') && /^#[0-9a-f]{6}$/i.test(arg)) {
        if (me) me.customColor = arg;
        this.chatInput.value = '';
        this.addChat('Sistem', `Renk güncellendi: ${arg}`, true);
        return;
      }
      if (cmd === 'avatar' && arg) {
        const av = arg.slice(0, 3);
        if (me) me.avatar = av;
        this.updateSettings({ avatar: av });
        this.chatInput.value = '';
        this.addChat('Sistem', `Avatar güncellendi: ${av}`, true);
        return;
      }
      if ((cmd === 'nick' || cmd === 'isim') && arg.length >= 2) {
        const nn = censorText(arg.slice(0, 20));
        if (me) me.name = nn;
        this.updateSettings({ nickname: nn });
        this.updateRoomUI();
        this.chatInput.value = '';
        this.addChat('Sistem', `İsim güncellendi: ${nn}`, true);
        return;
      }
    }
    const text = censorText(raw);
    this.chatInput.value = '';
    const me = this.players.find((p) => p.id === this.myPlayerId);
    const author = me ? me.name : this.settings.nickname;
    const team = me ? me.team : undefined;
    this.addChat(author, text, false, team);
    this.peerMgr.broadcastChat(author, text, team);
  }

  private connectYouTube(): Promise<string | null> {
    return new Promise((resolve) => {
      const clientId = (this.settings.youtubeClientId || DEFAULT_YOUTUBE_CLIENT_ID).trim();
      const statusEl = el<HTMLSpanElement>('yt-auth-status');
      const roomBtn = el<HTMLButtonElement>('btn-room-yt-connect');
      if (!clientId) {
        statusEl.textContent = 'Client ID gerekli';
        const entered = window.prompt(
          'YouTube hesabını bağlayıp onaylamak için sitenin Google OAuth Client ID bilgisini girin\n(Google Cloud Console → APIs & Services → Credentials → Web Client ID):'
        );
        if (entered && entered.trim()) {
          this.updateSettings({ youtubeClientId: entered.trim() });
          el<HTMLInputElement>('set-yt-clientid').value = entered.trim();
          void this.connectYouTube().then(resolve);
          return;
        }
        resolve(null);
        return;
      }
      const g = (window as unknown as {
        google?: {
          accounts?: {
            oauth2?: {
              initTokenClient: (cfg: {
                client_id: string;
                scope: string;
                callback: (resp: { access_token?: string; error?: string }) => void;
              }) => { requestAccessToken: (opts?: { prompt?: string }) => void };
            };
          };
        };
      }).google;
      if (!g?.accounts?.oauth2) {
        statusEl.textContent = 'Google SDK yüklenemedi';
        resolve(null);
        return;
      }
      const client = g.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/youtube.upload',
        callback: (resp) => {
          if (resp && resp.access_token) {
            this.ytAccessToken = resp.access_token;
            statusEl.textContent = 'Bağlı ✓';
            roomBtn.textContent = '📺 YT Bağlı ✓';
            roomBtn.classList.add('primary');
            resolve(resp.access_token);
          } else {
            statusEl.textContent = 'Bağlantı başarısız';
            resolve(null);
          }
        }
      });
      client.requestAccessToken({ prompt: 'consent select_account' });
    });
  }

  private async uploadVideoToYouTube(blob: Blob): Promise<void> {
    let token = this.ytAccessToken;
    const hasClientId = Boolean((this.settings.youtubeClientId || DEFAULT_YOUTUBE_CLIENT_ID).trim());
    if (!token && hasClientId) {
      token = await this.connectYouTube();
    }
    if (!token) return;
    this.addChat('Sistem', '📺 Maç videosu YouTube hesabına yükleniyor...', true);
    try {
      const metadata = {
        snippet: {
          title: `OpenHax Maç Kaydı - ${this.currentRoomName} (${this.scoreRed}-${this.scoreBlue})`,
          description: `OpenHaxModern üzerinde kaydedildi.\nSaha: ${this.stadium.label}\nSkor: ${this.scoreRed} - ${this.scoreBlue}`,
          tags: ['OpenHax', 'HaxBall', 'Gaming'],
          categoryId: '20'
        },
        status: {
          privacyStatus: this.settings.youtubePrivacy || 'unlisted'
        }
      };
      const initRes = await fetch(
        'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
        {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json; charset=UTF-8',
            'X-Upload-Content-Length': String(blob.size),
            'X-Upload-Content-Type': 'video/webm'
          },
          body: JSON.stringify(metadata)
        }
      );
      if (!initRes.ok) {
        this.addChat('Sistem', `YouTube yükleme başlatılamadı (HTTP ${initRes.status}).`, true);
        return;
      }
      const uploadUrl = initRes.headers.get('Location');
      if (!uploadUrl) {
        this.addChat('Sistem', 'YouTube yükleme adresi alınamadı.', true);
        return;
      }
      const upRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'video/webm' },
        body: blob
      });
      if (!upRes.ok) {
        this.addChat('Sistem', `YouTube yükleme hatası (HTTP ${upRes.status}).`, true);
        return;
      }
      const uploaded = (await upRes.json()) as { id?: string };
      if (uploaded.id) {
        this.addChat('Sistem', `✅ YouTube'a yüklendi: https://youtu.be/${uploaded.id}`, true);
      }
    } catch {
      this.addChat('Sistem', 'YouTube yükleme sırasında ağ hatası oluştu.', true);
    }
  }

  private togglePauseRecording(): void {
    const pauseBtn = el<HTMLButtonElement>('btn-record-pause');
    if (!this.mediaRecorder) return;
    if (this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.pause();
      pauseBtn.textContent = '▶';
      pauseBtn.title = 'Kayda Devam Et';
    } else if (this.mediaRecorder.state === 'paused') {
      this.mediaRecorder.resume();
      pauseBtn.textContent = '⏸';
      pauseBtn.title = 'Kaydı Duraklat';
    }
  }

  private toggleMatchRecording(): void {
    const btn = el<HTMLButtonElement>('btn-record');
    const pauseBtn = el<HTMLButtonElement>('btn-record-pause');
    if (this.mediaRecorder && (this.mediaRecorder.state === 'recording' || this.mediaRecorder.state === 'paused')) {
      this.mediaRecorder.stop();
      btn.classList.remove('danger');
      btn.textContent = '⏺ Kaydet';
      pauseBtn.classList.add('hidden');
      pauseBtn.textContent = '⏸';
      return;
    }
    try {
      const stream = this.canvas.captureStream(60);
      this.recordedChunks = [];
      const rec = new MediaRecorder(stream, { mimeType: 'video/webm' });
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) this.recordedChunks.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
        const hasClientId = Boolean((this.settings.youtubeClientId || DEFAULT_YOUTUBE_CLIENT_ID).trim());
        if (this.ytAccessToken || hasClientId) {
          void this.uploadVideoToYouTube(blob);
        } else {
          this.addChat(
            'Sistem',
            '📺 Kayıt tamamlandı! Doğrudan YouTube\'a yüklemek için Ayarlar → Çeşitli bölümünden Google Client ID ile YouTube hesabını bağla.',
            true
          );
          const row = document.createElement('div');
          row.className = 'chat-msg system';
          row.style.display = 'flex';
          row.style.gap = '6px';
          const btnYt = document.createElement('button');
          btnYt.type = 'button';
          btnYt.className = 'btn primary';
          btnYt.textContent = '📺 YouTube Bağla & Ayarlar';
          btnYt.addEventListener('click', () => {
            this.settingsModal.classList.remove('hidden');
            this.settingsModal.querySelector<HTMLButtonElement>('[data-tab="misc"]')?.click();
          });
          const btnDl = document.createElement('button');
          btnDl.type = 'button';
          btnDl.className = 'btn';
          btnDl.textContent = '💾 İsteğe Bağlı İndir (.webm)';
          btnDl.addEventListener('click', () => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `openhax-${Date.now()}.webm`;
            a.click();
            URL.revokeObjectURL(url);
          });
          row.append(btnYt, btnDl);
          this.chatBox.appendChild(row);
          this.chatBox.scrollTop = this.chatBox.scrollHeight;
        }
      };
      rec.start();
      this.mediaRecorder = rec;
      btn.classList.add('danger');
      btn.textContent = '⏹ Bitir & Yayınla';
      pauseBtn.classList.remove('hidden');
      pauseBtn.textContent = '⏸';
    } catch {
      this.addChat('Sistem', 'Tarayıcınız video kaydını desteklemiyor.', true);
    }
  }

  private addChat(author: string, text: string, system = false, team?: Team): void {
    const safeAuthor = system ? author : censorText(author);
    const safeText = censorText(text);
    const row = document.createElement('div');
    row.className = 'chat-msg' + (system ? ' system' : '');

    if (system) {
      row.textContent = safeText;
    } else {
      const nickSpan = document.createElement('span');
      nickSpan.className = 'nick' + (team === 'red' || team === 'blue' ? ' ' + team : '');
      nickSpan.textContent = safeAuthor + ': ';
      const msgSpan = document.createElement('span');
      msgSpan.textContent = safeText;
      row.appendChild(nickSpan);
      row.appendChild(msgSpan);
    }

    this.chatBox.appendChild(row);
    while (this.chatBox.childElementCount > 60 && this.chatBox.firstChild) {
      this.chatBox.removeChild(this.chatBox.firstChild);
    }
    this.chatBox.scrollTop = this.chatBox.scrollHeight;
  }

  private onRenderFrame(alpha: number): void {
    const localIds = new Set<string>([this.myPlayerId]);
    if (this.roomKind === 'local2p' && this.players[1]) {
      localIds.add(this.players[1].id);
    }
    this.renderer.render(
      this.stadium,
      this.players,
      this.ball,
      this.particles,
      localIds,
      this.settings,
      alpha,
      this.fieldPowerup,
      this.ballFireType
    );
  }

  private updateHud(t: PerfTelemetry): void {
    if (!this.settings.showHud) return;
    const target = t.targetFps;
    const healthy = target === 0 || t.fps >= target - 4;
    this.fpsHudEl.classList.toggle('warn', !healthy);
    const limitLabel = target > 0 ? ` / ${target}` : ' (∞)';
    const pingPart = this.pingMs !== null ? ' | Ping ' + this.pingMs + ' ms' : '';
    this.fpsHudEl.textContent =
      t.fps + ' FPS' + limitLabel + ' | ' + t.frameMs.toFixed(1) + ' ms | CPU ' + t.workMs.toFixed(2) + ' ms' + pingPart;
  }
}

new OpenHaxApp();
