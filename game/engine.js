// Motor del anfitrión P2P WebRTC (Host) para ARENA
import {
  CHARACTERS,
  PEER_PREFIX,
  MODES,
  DIFFICULTIES,
  charById,
} from './constants.js';
import { Sim } from './sim.js';
import { peerOptionsFromURL, peerParamsString } from './peeropts.js';
import { arenaInitMsg, snapshotMsg, eulerToQuat } from './mirror.js';

export { peerParamsString };

export function peerIdForCode(code) {
  return `${PEER_PREFIX}-${code}`;
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const STEP = 1 / 60;

const KB = {
  kbA: {
    left: ['KeyA'],
    right: ['KeyD'],
    up: ['KeyW'],
    down: ['KeyS'],
    attack: ['KeyQ', 'KeyK'],
    jump: ['Space'],
    power: ['KeyE'],
    place: ['KeyF'],
    def1: ['Digit1'],
    def2: ['Digit2'],
  },
  kbB: {
    left: ['ArrowLeft'],
    right: ['ArrowRight'],
    up: ['ArrowUp'],
    down: ['ArrowDown'],
    attack: ['Slash', 'Numpad0'],
    jump: ['NumpadDecimal', 'RightControl'],
    power: ['Period', 'Numpad2'],
    place: ['ShiftRight', 'Numpad1'],
    def1: ['PageUp'],
    def2: ['PageDown'],
  },
};

function randCode() {
  let s = '';
  for (let i = 0; i < 5; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

function loadCfg() {
  try {
    const c = JSON.parse(localStorage.getItem('arna_cfg') || 'null');
    if (c && typeof c === 'object') return { mode: 'campana', diff: 1, ...c };
  } catch (e) { /* sin almacenamiento */ }
  return { mode: 'campana', diff: 1 };
}

// Sintetizador ligero WebAudio para efectos Cyber-Arcana
class CyberAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }
  init() {
    if (this.ctx || typeof window === 'undefined') return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) this.ctx = new Ctx();
    } catch (e) { /* nada */ }
  }
  setMuted(m) {
    this.muted = !!m;
  }
  sfx(name) {
    if (this.muted || !this.ctx) return;
    try {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);

      if (name === 'join') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(340, now);
        osc.frequency.exponentialRampToValueAtTime(680, now + 0.14);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.16);
        osc.start(now);
        osc.stop(now + 0.16);
      } else if (name === 'select') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.exponentialRampToValueAtTime(760, now + 0.08);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.09);
        osc.start(now);
        osc.stop(now + 0.09);
      } else if (name === 'build') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(540, now + 0.18);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
      } else if (name === 'attack') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(480, now);
        osc.frequency.exponentialRampToValueAtTime(160, now + 0.09);
        gain.gain.setValueAtTime(0.07, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
      } else if (name === 'power' || name === 'horn') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(620, now + 0.35);
        gain.gain.setValueAtTime(0.16, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.38);
        osc.start(now);
        osc.stop(now + 0.38);
      } else if (name === 'hit') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(130, now);
        osc.frequency.exponentialRampToValueAtTime(55, now + 0.18);
        gain.gain.setValueAtTime(0.14, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
      } else {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.12);
        osc.start(now);
        osc.stop(now + 0.12);
      }
    } catch (e) { /* nada */ }
  }
}

export class GameHost {
  constructor(onChange) {
    this.onChange = onChange;
    this.audio = new CyberAudio();
    this.players = [null, null, null, null];
    this.cfg = loadCfg();
    this.phase = 'lobby'; // 'lobby' | 'playing' | 'results'
    this.code = null;
    this.peerStatus = 'connecting';
    this.peerError = '';
    this.conns = new Map();
    this.keys = new Set();
    this.pend = {};
    this.phoneIn = {};
    this.results = null;
    this.victory = false;
    this.paused = false;
    this.sim = null;
    this.demo = null;
    this.running = true;
    this.acc = 0;
    this.last = typeof performance !== 'undefined' ? performance.now() : 0;
    this.hudTimer = 0;
    this.snapTimer = 0;
    this.uiTimer = 0;
    this.sfxOut = [];
    this.arenaInit = null;

    // Controlador de cámara en 3ra persona y Raycasting en Host
    this.cameraMode = 'auto'; // 'auto' (Forja=táctica, Horda=3ra persona) | 'third_person' | 'tactical'
    this.camTargetSlot = 0;
    this.hostCamYaw = Math.PI;
    this.hostCamPitch = -0.22;
    this.navRayX = null;
    this.navRayZ = null;
    this.mouseAttack = false;

    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.onKeyDown);
      window.addEventListener('keyup', this.onKeyUp);
      this.startDemo();
      this.loop = this.loop.bind(this);
      requestAnimationFrame(this.loop);
      this.initPeer();
    }
  }

  rotateHostCamera(deltaYaw = 0, deltaPitch = 0) {
    this.hostCamYaw -= deltaYaw;
    this.hostCamPitch = Math.max(-0.78, Math.min(0.45, this.hostCamPitch - deltaPitch));
  }

  setNavMeshRay(x, z) {
    this.navRayX = x;
    this.navRayZ = z;
  }

  triggerNavMeshClick(isRightClick = false) {
    if (this.phase !== 'playing' || !this.sim || this.paused) return;
    const kbSlot = this.players.findIndex((p) => p && (p.kind === 'kbA' || p.kind === 'kbB'));
    const targetSlot = kbSlot >= 0 ? kbSlot : this.camTargetSlot;
    const pd = this.pend[targetSlot] || (this.pend[targetSlot] = {});
    if (this.sim.subPhase === 'forge' || isRightClick) {
      pd.place = true;
    } else {
      pd.attack = true;
    }
  }

  toggleCameraMode() {
    if (this.cameraMode === 'auto') {
      this.cameraMode =
        this.sim && this.sim.subPhase === 'forge' ? 'third_person' : 'tactical';
    } else if (this.cameraMode === 'third_person') {
      this.cameraMode = 'tactical';
    } else {
      this.cameraMode = 'auto';
    }
    this.changed();
  }

  cycleCamTarget() {
    if (!this.sim || !this.sim.heroes.length) return;
    const idx = this.sim.heroes.findIndex((h) => h.slot === this.camTargetSlot);
    const next = this.sim.heroes[(idx + 1) % this.sim.heroes.length];
    if (next) {
      this.camTargetSlot = next.slot;
      this.changed();
    }
  }

  destroy() {
    this.running = false;
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.onKeyDown);
      window.removeEventListener('keyup', this.onKeyUp);
    }
    try {
      this.peer && this.peer.destroy();
    } catch (e) { /* nada */ }
  }

  activeSim() {
    return this.phase === 'playing' && this.sim ? this.sim : this.demo;
  }

  snapshot() {
    const s = this.sim;
    return {
      phase: this.phase,
      subPhase: s ? s.subPhase : 'forge',
      wave: s ? s.wave : 1,
      maxWaves: s ? s.maxWaves : 5,
      forgeTimer: s ? Math.ceil(s.forgeTimer) : 35,
      crystalHp: s ? Math.round(s.crystal.hp) : 1500,
      crystalMaxHp: s ? Math.round(s.crystal.maxHp) : 1500,
      enemiesLeft: s ? s.enemiesRemaining() : 0,
      code: this.code,
      peerStatus: this.peerStatus,
      peerError: this.peerError,
      players: this.players.map(
        (p) =>
          p && {
            slot: p.slot,
            kind: p.kind,
            char: p.char,
            connected: p.connected,
          }
      ),
      heroesHud: s
        ? s.heroes.map((h) => ({
            slot: h.slot,
            char: h.char,
            hp: Math.round(h.hp),
            maxHp: Math.round(h.maxHp),
            mana: Math.round(h.mana),
            maxMana: Math.round(h.maxMana),
            powerCharge: Math.round(h.powerCharge),
            buildType: h.buildType,
            kills: h.kills,
            built: h.built,
          }))
        : [],
      cfg: { ...this.cfg },
      results: this.results,
      victory: this.victory,
      paused: this.paused,
      muted: this.audio.muted,
      cameraMode: this.cameraMode,
      camTargetSlot: this.camTargetSlot,
    };
  }

  changed() {
    this.onChange && this.onChange(this.snapshot());
  }

  async initPeer() {
    let code = null;
    try {
      code = sessionStorage.getItem('arna_code');
    } catch (e) { /* nada */ }
    if (!code) code = randCode();
    this.code = code;
    try {
      sessionStorage.setItem('arna_code', code);
    } catch (e) { /* nada */ }
    this.changed();

    let PeerCls;
    try {
      PeerCls = (await import('peerjs')).Peer;
    } catch (e) {
      this.peerStatus = 'error';
      this.peerError = 'No se pudo cargar PeerJS';
      this.changed();
      return;
    }

    const open = () => {
      if (!this.running) return;
      const peer = new PeerCls(peerIdForCode(this.code), peerOptionsFromURL());
      this.peer = peer;
      peer.on('open', () => {
        this.peerStatus = 'ready';
        this.peerError = '';
        this.changed();
      });
      peer.on('connection', (conn) => this.handleConn(conn));
      peer.on('disconnected', () => {
        this.peerStatus = 'connecting';
        this.changed();
        setTimeout(() => {
          try {
            if (!peer.destroyed) peer.reconnect();
          } catch (e) { /* nada */ }
        }, 1500);
      });
      peer.on('error', (err) => {
        if (err.type === 'unavailable-id') {
          try {
            peer.destroy();
          } catch (e) { /* nada */ }
          this.code = randCode();
          try {
            sessionStorage.setItem('arna_code', this.code);
          } catch (e) { /* nada */ }
          this.changed();
          setTimeout(open, 300);
        } else if (
          err.type === 'network' ||
          err.type === 'server-error' ||
          err.type === 'socket-error' ||
          err.type === 'socket-closed'
        ) {
          this.peerStatus = 'error';
          this.peerError = 'Sin conexión con el servidor P2P. Reintentando...';
          this.changed();
          setTimeout(() => {
            try {
              if (!peer.destroyed) peer.reconnect();
            } catch (e) { /* nada */ }
          }, 3000);
        } else if (err.type !== 'peer-unavailable') {
          this.peerError = String(err.type || err.message || err);
          this.changed();
        }
      });
    };
    open();
  }

  handleConn(conn) {
    conn.on('data', (msg) => this.onMsg(conn, msg));
    conn.on('close', () => this.dropConn(conn));
    conn.on('error', () => this.dropConn(conn));
  }

  dropConn(conn) {
    const slot = this.conns.get(conn);
    this.conns.delete(conn);
    if (slot === undefined) return;
    const p = this.players[slot];
    if (p && p.conn === conn) {
      p.connected = false;
      p.conn = null;
      if (this.phase === 'lobby') {
        this.players[slot] = null;
        this.broadcastLobby();
      }
      this.changed();
    }
  }

  send(slot, msg) {
    const p = this.players[slot];
    if (p && p.conn && p.conn.open) {
      try {
        p.conn.send(msg);
      } catch (e) { /* nada */ }
    }
  }

  broadcast(msgFn) {
    this.players.forEach((p, i) => {
      if (p && p.kind === 'phone') {
        this.send(i, typeof msgFn === 'function' ? msgFn(i) : msgFn);
      }
    });
  }

  hostSlot() {
    return this.players.findIndex((p) => p && p.kind === 'phone' && p.connected);
  }

  lobbyMsg(slot) {
    return {
      t: 'lobby',
      you: slot,
      host: this.hostSlot() === slot,
      phase: this.phase,
      players: this.players.map(
        (p) => p && { kind: p.kind, char: p.char, connected: p.connected }
      ),
      cfg: this.cfg,
    };
  }

  broadcastLobby() {
    this.broadcast((i) => this.lobbyMsg(i));
  }

  freeChar() {
    const used = new Set(this.players.filter(Boolean).map((p) => p.char));
    return (CHARACTERS.find((c) => !used.has(c.id)) || CHARACTERS[0]).id;
  }

  onMsg(conn, msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'hello') {
      let slot = this.players.findIndex((p) => p && p.kind === 'phone' && p.pid === msg.pid);
      if (slot < 0) {
        slot = this.players.findIndex((p) => !p);
        if (slot < 0) {
          try {
            conn.send({ t: 'full' });
          } catch (e) { /* nada */ }
          return;
        }
        this.players[slot] = {
          slot,
          kind: 'phone',
          pid: msg.pid,
          char: this.freeChar(),
          connected: true,
          conn,
        };
        this.audio.sfx('join');
        // Si la partida ya está en curso y entra un jugador nuevo, agregarlo a sim
        if (this.phase === 'playing' && this.sim) {
          this.ensureHeroInSim(this.players[slot]);
        }
      } else {
        const p = this.players[slot];
        if (p.conn && p.conn !== conn) {
          try {
            p.conn.close();
          } catch (e) { /* nada */ }
          this.conns.delete(p.conn);
        }
        p.conn = conn;
        p.connected = true;
      }
      this.conns.set(conn, slot);
      try {
        conn.send({ t: 'welcome', slot });
      } catch (e) { /* nada */ }
      this.broadcastLobby();
      if (this.phase !== 'lobby') this.send(slot, this.phaseMsg(slot));
      if (this.phase === 'playing' && this.arenaInit) this.send(slot, this.arenaInit);
      this.changed();
      return;
    }

    const slot = this.conns.get(conn);
    if (slot === undefined) return;
    const p = this.players[slot];
    if (!p) return;

    switch (msg.t) {
      case 'in': {
        const prev = this.phoneIn[slot] || {
          ac: msg.ac || 0,
          pc: msg.pc || 0,
          bc: msg.bc || 0,
          jc: msg.jc || 0,
        };
        const pd = this.pend[slot] || (this.pend[slot] = {});
        if ((msg.ac || 0) > (prev.ac || 0)) pd.attack = true;
        if ((msg.pc || 0) > (prev.pc || 0)) pd.power = true;
        if ((msg.bc || 0) > (prev.bc || 0)) pd.place = true;
        if ((msg.jc || 0) > (prev.jc || 0)) pd.jump = true;
        if (msg.def) pd.selectDef = msg.def;
        this.phoneIn[slot] = msg;
        p.lastSeen = performance.now();
        break;
      }
      case 'pick':
        if (this.phase !== 'lobby') break;
        if (CHARACTERS.some((c) => c.id === msg.char)) p.char = msg.char;
        this.audio.sfx('select');
        this.broadcastLobby();
        this.changed();
        break;
      case 'cfg':
        if (this.hostSlot() !== slot || this.phase !== 'lobby') break;
        this.setCfg(msg.cfg || {});
        break;
      case 'start':
        if (this.phase === 'lobby' && (this.hostSlot() === slot || slot === 0)) {
          this.startGame();
        }
        break;
      case 'start_horde':
        if (this.phase === 'playing' && this.sim && this.sim.subPhase === 'forge') {
          this.triggerHorde();
        }
        break;
      case 'pause':
        if (this.phase === 'playing') this.togglePause();
        break;
      case 'quit':
        if (this.hostSlot() === slot || slot === 0) this.toLobby();
        break;
      default:
        break;
    }
  }

  ensureHeroInSim(p) {
    if (!this.sim) return;
    if (this.sim.heroes.some((h) => h.slot === p.slot)) return;
    const ch = charById(p.char);
    const angle = (p.slot * Math.PI) / 2 + Math.PI / 4;
    this.sim.heroes.push({
      id: `h_${p.slot}`,
      slot: p.slot,
      char: ch.id,
      ch,
      human: true,
      autopilot: false,
      x: Math.cos(angle) * 7.5,
      z: Math.sin(angle) * 7.5,
      rotY: angle + Math.PI,
      hp: ch.stats.hp,
      maxHp: ch.stats.hp,
      mana: 120,
      maxMana: ch.stats.maxMana + 60,
      powerCharge: 35,
      atkCd: 0,
      attackT: 0,
      castT: 0,
      hurtT: 0,
      frozenT: 0,
      burningT: 0,
      stunnedT: 0,
      buffedT: 0,
      shieldT: 0,
      dead: false,
      respawnT: 0,
      moving: false,
      buildMode: this.sim.subPhase === 'forge',
      buildType: ch.defenses[0].id,
      holoX: 0,
      holoZ: 0,
      holoValid: true,
      kills: 0,
      built: 0,
      dmgDealt: 0,
      message: '',
      messageT: 0,
      input: { moveX: 0, moveZ: 0, attack: false, power: false, place: false, selectDef: null },
    });
  }

  setCfg(c) {
    if (c.mode && MODES.some((m) => m.id === c.mode)) this.cfg.mode = c.mode;
    if (Number.isInteger(c.diff) && DIFFICULTIES.some((d) => d.id === c.diff)) this.cfg.diff = c.diff;
    try {
      localStorage.setItem('arna_cfg', JSON.stringify(this.cfg));
    } catch (e) { /* nada */ }
    this.audio.sfx('select');
    this.broadcastLobby();
    this.changed();
  }

  onKeyDown(e) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    const code = e.code;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) {
      e.preventDefault();
    }
    this.audio.init();
    if (e.repeat) {
      this.keys.add(code);
      return;
    }
    this.keys.add(code);
    if (code === 'KeyM') {
      this.toggleMute();
      return;
    }

    if (this.phase === 'lobby') {
      for (const kind of ['kbA', 'kbB']) {
        const map = KB[kind];
        const slot = this.players.findIndex((p) => p && p.kind === kind);
        if (slot < 0) {
          if (map.up.includes(code)) {
            const free = this.players.findIndex((p) => !p);
            if (free >= 0) {
              this.players[free] = {
                slot: free,
                kind,
                char: this.freeChar(),
                connected: true,
              };
              this.audio.sfx('join');
              this.broadcastLobby();
              this.changed();
            }
          }
        } else {
          const p = this.players[slot];
          const ci = CHARACTERS.findIndex((c) => c.id === p.char);
          if (map.left.includes(code)) {
            p.char = CHARACTERS[(ci + CHARACTERS.length - 1) % CHARACTERS.length].id;
            this.audio.sfx('select');
          } else if (map.right.includes(code)) {
            p.char = CHARACTERS[(ci + 1) % CHARACTERS.length].id;
            this.audio.sfx('select');
          } else if ((kind === 'kbA' && code === 'KeyQ') || (kind === 'kbB' && code === 'Backspace')) {
            this.players[slot] = null;
          } else continue;
          this.broadcastLobby();
          this.changed();
        }
      }
      if (code === 'Enter' || code === 'NumpadEnter') this.startGame();
      return;
    }

    if (this.phase === 'playing') {
      if (code === 'Escape' || code === 'KeyP') {
        this.togglePause();
        return;
      }
      if (code === 'KeyC') {
        this.toggleCameraMode();
        return;
      }
      if (code === 'Tab') {
        e.preventDefault();
        this.cycleCamTarget();
        return;
      }
      if (code === 'Enter' && this.sim && this.sim.subPhase === 'forge') {
        this.triggerHorde();
        return;
      }
      for (const kind of ['kbA', 'kbB']) {
        const slot = this.players.findIndex((p) => p && p.kind === kind);
        if (slot < 0) continue;
        const map = KB[kind];
        const pd = this.pend[slot] || (this.pend[slot] = {});
        const ch = charById(this.players[slot].char);
        if (map.attack.includes(code)) pd.attack = true;
        if (map.jump && map.jump.includes(code)) pd.jump = true;
        if (map.power.includes(code)) pd.power = true;
        if (map.place.includes(code)) pd.place = true;
        if (map.def1.includes(code) && ch.defenses[0]) pd.selectDef = ch.defenses[0].id;
        if (map.def2.includes(code) && ch.defenses[1]) pd.selectDef = ch.defenses[1].id;
      }
      return;
    }

    if (this.phase === 'results' && (code === 'Enter' || code === 'Space')) {
      this.toLobby();
    }
  }

  onKeyUp(e) {
    this.keys.delete(e.code);
  }

  kbInput(kind) {
    const m = KB[kind];
    const k = this.keys;
    const any = (arr) => arr.some((c) => k.has(c));
    return {
      moveX: (any(m.right) ? 1 : 0) - (any(m.left) ? 1 : 0),
      moveZ: (any(m.down) ? 1 : 0) - (any(m.up) ? 1 : 0),
      attack: any(m.attack),
    };
  }

  removePlayer(slot) {
    if (this.phase !== 'lobby') return;
    const p = this.players[slot];
    if (!p) return;
    if (p.conn) {
      const c = p.conn;
      try {
        c.send({ t: 'kicked' });
      } catch (e) { /* nada */ }
      this.conns.delete(c);
      setTimeout(() => {
        try {
          c.close();
        } catch (e) { /* nada */ }
      }, 300);
    }
    this.players[slot] = null;
    this.broadcastLobby();
    this.changed();
  }

  toggleMute() {
    this.audio.setMuted(!this.audio.muted);
    this.changed();
  }

  startDemo() {
    this.demo = new Sim({ mode: 'campana', difficulty: 1, demo: true });
  }

  activePlayers() {
    return this.players.filter(Boolean);
  }

  startGame() {
    if (this.phase !== 'lobby') return;
    this.audio.init();
    // Si no hay jugadores unidos aún, unir automáticamente a J1 con teclado WASD para permitir prueba inmediata
    if (!this.activePlayers().length) {
      this.players[0] = {
        slot: 0,
        kind: 'kbA',
        char: CHARACTERS[0].id,
        connected: true,
      };
    }
    const modeObj = MODES.find((m) => m.id === this.cfg.mode) || MODES[0];
    const humans = this.activePlayers().map((p) => ({
      slot: p.slot,
      char: p.char,
      autopilot: false,
    }));
    this.sim = new Sim({
      mode: modeObj.id,
      maxWaves: modeObj.waves,
      difficulty: this.cfg.diff,
      humans,
      demo: false,
    });
    const firstHero = this.sim.heroes[0];
    this.camTargetSlot = firstHero ? firstHero.slot : 0;
    this.hostCamYaw = firstHero ? firstHero.rotY : Math.PI;
    this.hostCamPitch = -0.22;
    this.cameraMode = 'auto';
    this.phase = 'playing';
    this.paused = false;
    this.results = null;
    this.pend = {};
    this.arenaInit = arenaInitMsg(this.sim);
    this.sfxOut = [];
    this.broadcast((i) => this.phaseMsg(i));
    this.broadcast(this.arenaInit);
    this.sendHud();
    this.changed();
  }

  triggerHorde() {
    if (this.phase !== 'playing' || !this.sim) return;
    this.sim.startHordePhase();
    this.sendHud();
    this.changed();
  }

  phaseMsg(slot) {
    return {
      t: 'phase',
      phase: this.phase,
      subPhase: this.sim ? this.sim.subPhase : 'forge',
      host: this.hostSlot() === slot || slot === 0,
      victory: this.victory,
      results: this.results,
    };
  }

  endGame(victory) {
    this.victory = !!victory;
    this.results = this.sim ? this.sim.results() : [];
    this.phase = 'results';
    this.paused = false;
    this.broadcast((i) => this.phaseMsg(i));
    this.changed();
  }

  toLobby() {
    this.phase = 'lobby';
    this.sim = null;
    this.results = null;
    this.paused = false;
    this.players = this.players.map((p) => (p && p.kind === 'phone' && !p.connected ? null : p));
    this.startDemo();
    this.broadcast((i) => this.phaseMsg(i));
    this.broadcastLobby();
    this.changed();
  }

  togglePause() {
    if (this.phase !== 'playing') return;
    this.paused = !this.paused;
    this.broadcast({ t: 'paused', v: this.paused });
    this.changed();
  }

  loop(now) {
    if (!this.running) return;
    requestAnimationFrame(this.loop);
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.1) dt = 0.1;

    if (this.phase === 'playing' && this.sim) {
      if (!this.paused) {
        this.acc += dt;
        while (this.acc >= STEP) {
          this.applyInputs();
          this.sim.step(STEP);
          this.acc -= STEP;
          this.handleEvents();
          if (this.phase !== 'playing') break;
        }
        this.hudTimer -= dt;
        if (this.hudTimer <= 0 && this.sim) {
          this.hudTimer = 0.1;
          this.sendHud();
        }
        this.snapTimer -= dt;
        if (this.snapTimer <= 0 && this.sim) {
          this.snapTimer = 1 / 20;
          const snap = snapshotMsg(this.sim, this.sfxOut);
          this.broadcast(snap);
          this.sfxOut = [];
        }
        this.uiTimer -= dt;
        if (this.uiTimer <= 0) {
          this.uiTimer = 0.2;
          this.changed();
        }
      }
    } else if (this.demo) {
      this.acc += dt;
      let n = 0;
      while (this.acc >= STEP && n < 4) {
        this.demo.step(STEP);
        this.demo.events.length = 0;
        this.acc -= STEP;
        n++;
      }
      if (n >= 4) this.acc = 0;
    }
  }

  applyInputs() {
    for (const h of this.sim.heroes) {
      const p = this.players[h.slot];
      const pd = this.pend[h.slot] || {};
      let base = {
        moveX: 0,
        moveZ: 0,
        attack: false,
        camYaw: h.camYaw ?? h.rotY ?? Math.PI,
        camPitch: h.camPitch ?? -0.22,
        camQuat: h.camQuat || null,
        camRelative: true,
        rayX: null,
        rayZ: null,
      };

      if (!p) {
        h.autopilot = true;
        base.camRelative = false;
      } else if (p.kind === 'phone') {
        const m = this.phoneIn[h.slot];
        const stale = !p.lastSeen || performance.now() - p.lastSeen > 3500;
        h.autopilot = !p.connected || stale;
        if (m) {
          const cy = Number.isFinite(m.cy) ? Number(m.cy) : h.camYaw ?? h.rotY ?? Math.PI;
          const cp = Number.isFinite(m.cp) ? Number(m.cp) : h.camPitch ?? -0.22;
          base = {
            moveX: Math.max(-1, Math.min(1, Number(m.x) || 0)),
            moveZ: Math.max(-1, Math.min(1, Number(m.z) || 0)),
            attack: !!m.atk || !!pd.attack,
            camYaw: cy,
            camPitch: cp,
            camQuat: Array.isArray(m.cq) && m.cq.length === 4 ? m.cq : eulerToQuat(cp, cy, 0),
            camRelative: true,
            rayX: null,
            rayZ: null,
          };
          if (m.def) pd.selectDef = m.def;
        }
      } else {
        h.autopilot = false;
        const kb = this.kbInput(p.kind);
        const isPrimaryKb = p.kind === 'kbA';
        const cy = isPrimaryKb ? this.hostCamYaw : Math.PI;
        const cp = isPrimaryKb ? this.hostCamPitch : -0.25;
        base = {
          moveX: kb.moveX,
          moveZ: kb.moveZ,
          attack: kb.attack || !!pd.attack || (isPrimaryKb && this.mouseAttack),
          camYaw: cy,
          camPitch: cp,
          camQuat: eulerToQuat(cp, cy, 0),
          camRelative: true,
          rayX: isPrimaryKb ? this.navRayX : null,
          rayZ: isPrimaryKb ? this.navRayZ : null,
        };
      }

      h.input = {
        ...base,
        jump: !!pd.jump,
        power: !!pd.power,
        place: !!pd.place,
        selectDef: pd.selectDef || null,
      };
      this.pend[h.slot] = {};
    }
  }

  handleEvents() {
    const ev = this.sim.events;
    for (const e of ev) {
      if (e.type === 'sfx') {
        this.audio.sfx(e.name);
        if (this.sfxOut.length < 10 && !this.sfxOut.includes(e.name)) {
          this.sfxOut.push(e.name);
        }
      } else if (e.type === 'buzz') {
        this.send(e.slot, { t: 'buzz', ms: e.ms });
      } else if (e.type === 'done') {
        this.sim.events.length = 0;
        this.endGame(e.victory);
        return;
      }
    }
    ev.length = 0;
  }

  sendHud() {
    const sim = this.sim;
    if (!sim) return;
    for (const h of sim.heroes) {
      const p = this.players[h.slot];
      if (!p || p.kind !== 'phone') continue;
      this.send(h.slot, {
        t: 'hud',
        char: h.char,
        subPhase: sim.subPhase,
        wave: sim.wave,
        maxWaves: sim.maxWaves,
        forgeTimer: Math.ceil(sim.forgeTimer),
        hp: Math.round(h.hp),
        maxHp: Math.round(h.maxHp),
        mana: Math.round(h.mana),
        maxMana: Math.round(h.maxMana),
        powerCharge: Math.round(h.powerCharge),
        buildType: h.buildType,
        holoValid: h.holoValid,
        crystalHp: Math.round(sim.crystal.hp),
        crystalMaxHp: Math.round(sim.crystal.maxHp),
        enemiesLeft: sim.enemiesRemaining(),
        msg: h.messageT > 0 ? h.message : '',
      });
    }
  }
}
