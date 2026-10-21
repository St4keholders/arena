// Espejo de estado 3D P2P: empaqueta e interpola [id, tipo, x, z, rotY, hp, estadoAnimacion]
// para Héroes, Torretas y Hordas, manteniendo máscaras de bits elementales.
import { charById, defenseById, ENEMY_TYPES, CRYSTAL_MAX_HP } from './constants.js';

// Máscaras de bits para estados elementales y de animación
export const F = {
  MOVING: 1,
  ATTACKING: 2,
  CASTING: 4,
  BUILDING: 8,
  HURT: 16,
  DEAD: 32,
  FROZEN: 64,
  BURNING: 128,
  STUNNED: 256,
  BUFFED: 512,
  SHIELDED: 1024,
  LIFTED: 2048,
};

const INTERP_DELAY = 0.08;

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function encodeEntityFlags(ent) {
  let f = 0;
  if (ent.moving) f |= F.MOVING;
  if (ent.attackT > 0) f |= F.ATTACKING;
  if (ent.castT > 0) f |= F.CASTING;
  if (ent.buildMode) f |= F.BUILDING;
  if (ent.hurtT > 0) f |= F.HURT;
  if (ent.dead || ent.hp <= 0) f |= F.DEAD;
  if (ent.frozenT > 0) f |= F.FROZEN;
  if (ent.burningT > 0) f |= F.BURNING;
  if (ent.stunnedT > 0) f |= F.STUNNED;
  if (ent.buffedT > 0) f |= F.BUFFED;
  if (ent.shieldT > 0) f |= F.SHIELDED;
  if (ent.liftedT > 0) f |= F.LIFTED;
  return f;
}

export function decodeEntityFlags(target, f) {
  target.estadoAnimacion = f;
  target.moving = !!(f & F.MOVING);
  target.attackT = f & F.ATTACKING ? 0.25 : 0;
  target.castT = f & F.CASTING ? 0.4 : 0;
  target.buildMode = !!(f & F.BUILDING);
  target.hurtT = f & F.HURT ? 0.2 : 0;
  target.dead = !!(f & F.DEAD);
  target.frozenT = f & F.FROZEN ? 1 : 0;
  target.burningT = f & F.BURNING ? 1 : 0;
  target.stunnedT = f & F.STUNNED ? 1 : 0;
  target.buffedT = f & F.BUFFED ? 1 : 0;
  target.shieldT = f & F.SHIELDED ? 1 : 0;
  target.liftedT = f & F.LIFTED ? 1 : 0;
}

export class MirrorSim {
  constructor(init = {}) {
    this.mode = init.mode || 'campana';
    this.maxWaves = init.maxWaves || 5;
    this.wave = 1;
    this.subPhase = 'forge'; // 'forge' | 'horde'
    this.forgeTimer = 30;
    this.time = 0;
    this.crystal = { hp: CRYSTAL_MAX_HP, maxHp: CRYSTAL_MAX_HP, pulse: 0 };
    this.heroes = [];
    this.turrets = [];
    this.enemies = [];
    this.projs = [];
    this.effects = [];
    this.snaps = [];
    this.offset = null;
  }

  push(s) {
    if (!s) return;
    const now = performance.now() / 1000;
    const off = s.ts - now;
    if (this.offset === null || off > this.offset) this.offset = off;
    else this.offset += (off - this.offset) * 0.05;

    this.snaps.push(s);
    if (this.snaps.length > 12) this.snaps.shift();

    this.wave = s.w || 1;
    this.maxWaves = s.mw || this.maxWaves;
    this.subPhase = s.sp || 'forge';
    this.forgeTimer = s.ft ?? 0;
    if (s.cr) {
      this.crystal.hp = s.cr[0];
      this.crystal.maxHp = s.cr[1] || CRYSTAL_MAX_HP;
    }
    this.projs = (s.p || []).map(([id, type, x, y, z, tx, tz, col]) => ({
      id, type, x, y, z, tx, tz, color: col,
    }));
    this.effects = (s.fx || []).map(([id, type, x, z, r, t, max, col]) => ({
      id, type, x, z, r, t, max, color: col,
    }));
  }

  advance(dt) {
    if (!this.snaps.length) return;
    const now = performance.now() / 1000;
    const rt = now + (this.offset || 0) - INTERP_DELAY;
    let s0 = this.snaps[0];
    let s1 = this.snaps[this.snaps.length - 1];
    for (let i = 0; i < this.snaps.length - 1; i++) {
      if (this.snaps[i].ts <= rt && this.snaps[i + 1].ts >= rt) {
        s0 = this.snaps[i];
        s1 = this.snaps[i + 1];
        break;
      }
    }
    if (rt >= s1.ts) s0 = s1;
    const span = s1.ts - s0.ts;
    const t = span > 0 ? Math.max(0, Math.min(1, (rt - s0.ts) / span)) : 1;
    this.time = Math.max(this.time, rt);

    // Interpolar Héroes: [id, tipo, x, z, rotY, hp, estadoAnimacion, maxHp, slot, buildType, holoX, holoZ, holoValid]
    const hMap0 = new Map((s0.h || []).map((arr) => [arr[0], arr]));
    this.heroes = (s1.h || []).map((b) => {
      const a = hMap0.get(b[0]) || b;
      const ch = charById(b[1]);
      const ent = {
        id: b[0],
        tipo: b[1],
        char: b[1],
        ch,
        x: a[2] + (b[2] - a[2]) * t,
        z: a[3] + (b[3] - a[3]) * t,
        rotY: a[4] + wrapAngle(b[4] - a[4]) * t,
        hp: b[5],
        maxHp: b[7] || ch.stats.hp,
        slot: b[8] ?? 0,
        buildType: b[9] || null,
        holoX: b[10] || 0,
        holoZ: b[11] || 0,
        holoValid: !!b[12],
      };
      decodeEntityFlags(ent, b[6]);
      return ent;
    });

    // Interpolar Torretas: [id, tipo, x, z, rotY, hp, estadoAnimacion, maxHp, ownerSlot]
    const tMap0 = new Map((s0.tu || []).map((arr) => [arr[0], arr]));
    this.turrets = (s1.tu || []).map((b) => {
      const a = tMap0.get(b[0]) || b;
      const def = defenseById(b[1]);
      const ent = {
        id: b[0],
        tipo: b[1],
        type: b[1],
        def,
        x: a[2] + (b[2] - a[2]) * t,
        z: a[3] + (b[3] - a[3]) * t,
        rotY: a[4] + wrapAngle(b[4] - a[4]) * t,
        hp: b[5],
        maxHp: b[7] || def.hp,
        ownerSlot: b[8] ?? 0,
      };
      decodeEntityFlags(ent, b[6]);
      return ent;
    });

    // Interpolar Hordas: [id, tipo, x, z, rotY, hp, estadoAnimacion, maxHp, y]
    const eMap0 = new Map((s0.e || []).map((arr) => [arr[0], arr]));
    this.enemies = (s1.e || []).map((b) => {
      const a = eMap0.get(b[0]) || b;
      const spec = ENEMY_TYPES[b[1]] || ENEMY_TYPES.swarm;
      const ent = {
        id: b[0],
        tipo: b[1],
        type: b[1],
        spec,
        x: a[2] + (b[2] - a[2]) * t,
        z: a[3] + (b[3] - a[3]) * t,
        rotY: a[4] + wrapAngle(b[4] - a[4]) * t,
        hp: b[5],
        maxHp: b[7] || spec.hp,
        y: (a[8] || 0) + ((b[8] || 0) - (a[8] || 0)) * t,
      };
      decodeEntityFlags(ent, b[6]);
      return ent;
    });
  }
}

const r1 = (v) => Math.round((v || 0) * 10) / 10;
const r2 = (v) => Math.round((v || 0) * 100) / 100;
const r3 = (v) => Math.round((v || 0) * 1000) / 1000;

export function arenaInitMsg(sim) {
  return {
    t: 'arenainit',
    mode: sim.mode,
    maxWaves: sim.maxWaves,
    heroes: sim.heroes.map((h) => [h.id, h.char, h.slot]),
  };
}

export function snapshotMsg(sim, sfx = []) {
  return {
    t: 'snap',
    ts: r3(sim.time),
    w: sim.wave,
    mw: sim.maxWaves,
    sp: sim.subPhase,
    ft: r1(sim.forgeTimer),
    cr: [Math.round(sim.crystal.hp), Math.round(sim.crystal.maxHp)],
    // Formato empaquetado [id, tipo, x, z, rotY, hp, estadoAnimacion, ...]
    h: sim.heroes.map((h) => [
      h.id,
      h.char,
      r1(h.x),
      r1(h.z),
      r2(h.rotY),
      Math.round(h.hp),
      encodeEntityFlags(h),
      Math.round(h.maxHp),
      h.slot,
      h.buildType || '',
      r1(h.holoX),
      r1(h.holoZ),
      h.holoValid ? 1 : 0,
    ]),
    tu: sim.turrets.map((tu) => [
      tu.id,
      tu.type,
      r1(tu.x),
      r1(tu.z),
      r2(tu.rotY),
      Math.round(tu.hp),
      encodeEntityFlags(tu),
      Math.round(tu.maxHp),
      tu.ownerSlot,
    ]),
    e: sim.enemies.map((e) => [
      e.id,
      e.type,
      r1(e.x),
      r1(e.z),
      r2(e.rotY),
      Math.round(e.hp),
      encodeEntityFlags(e),
      Math.round(e.maxHp),
      r1(e.y || 0),
    ]),
    p: sim.projs.slice(0, 40).map((p) => [
      p.id,
      p.type,
      r1(p.x),
      r1(p.y || 1.2),
      r1(p.z),
      r1(p.tx || 0),
      r1(p.tz || 0),
      p.color || '#00f5ff',
    ]),
    fx: sim.effects.slice(0, 25).map((ef) => [
      ef.id,
      ef.type,
      r1(ef.x),
      r1(ef.z),
      r1(ef.r || 2),
      r2(ef.t),
      r2(ef.max),
      ef.color || '#00f5ff',
    ]),
    s: sfx,
  };
}
